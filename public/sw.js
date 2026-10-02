/**
 * Service Worker de AyudaEnCali — T30 (FEAT-05 · PWA offline).
 *
 * Fichero clásico (no se transpila): vive en `public/` y se sirve desde la
 * raíz con `Cache-Control` propio. Diseño por recurso:
 *
 * - Navegaciones → **network-first**: con red manda SIEMPRE el servidor
 *   (la 404 real de la SPA no se rompe, decisión 2026-09-29); sin red:
 *   `/` sirve el shell cacheado con un aviso offline y cualquier otra ruta
 *   responde la `404.html` cacheada con estado 404.
 * - `GET /api/config` → **network-first** (nunca sirve una clave pública de
 *   Clerk caducada; la caché solo se usa si no hay red).
 * - Resto de `GET /api/*` → **stale-while-revalidate**; solo respuestas HTTP 200
 *   almacenables. Nunca se interceptan POST/PATCH/PUT/DELETE: la cola
 *   offline `pendingWrite` de AppContext se encarga de esos fallos.
 * - `/assets/*` (nombres con hash, inmutables) → **cache-first**.
 * - Estáticos propios (imágenes, favicon, manifest) → stale-while-revalidate.
 * - Fuera del alcance: peticiones cross-origin (tiles, tipografías y Clerk
 *   se quedan fuera de esta caché, coherente con la política de consentimiento
 *   de `src/utils/consent.ts`), `/api/supabase/*` (DDL) y cualquier petición
 *   con cabecera `Authorization` (datos con sesión, no se persisten).
 *
 * Solo cachea `GET` + mismo origen + respuestas HTTP 200 sin `no-store`/`private`.
 */

/** Versión de la caché: cámbiala en cada release que invalide el precache. */
const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'ayudaencali-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${CACHE_VERSION}`;

/**
 * Precache mínimo: shell, la página 404 y (tras leer el HTML) sus chunks con
 * hash. Los estáticos cosméticos (iconos, favicon, manifest) NO se precachean
 * aquí: se cachean en runtime con stale-while-revalidate, que sí actualiza la
 * copia en su propia caché al cambiar sin forzar un bump de versión.
 */
const PRECACHE_URLS = ['/', '/404.html'];

/** Extrae los chunks con hash referenciados por el shell (`src`/`href`). */
function extractAssets(html) {
  const found = html.match(/(?:src|href)="(\/assets\/[^"]+)"/g) ?? [];
  const urls = found.map((tag) => tag.split('"')[1]);
  return [...new Set(urls)];
}

/** Solo se persisten respuestas HTTP 200 del mismo origen sin directivas de no caché. */
function isStorable(response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return false;
  const cacheControl = response.headers.get('Cache-Control') ?? '';
  return !/\b(no-store|private)\b/i.test(cacheControl);
}

async function putIfStorable(cache, request, response) {
  if (isStorable(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

/** Descarga y guarda en la caché del shell; un fallo no aborta el precache. */
async function precacheUrl(cache, url) {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (response.status === 200) await cache.put(url, response);
  } catch {
    // Sin red u otro fallo puntual: el resto del precache sigue adelante.
  }
}

async function precache() {
  const cache = await caches.open(SHELL_CACHE);

  // El shell es obligatorio: sin él la instalación falla y el navegador
  // reintenta (no queremos un SW a medias sin caché de arranque).
  const shell = await fetch('/', { cache: 'no-cache' });
  if (shell.status !== 200) {
    throw new Error(`No se pudo precachear el shell (HTTP ${shell.status})`);
  }
  await cache.put('/', shell.clone());

  const html = await shell.text();
  await Promise.all([
    ...PRECACHE_URLS.filter((url) => url !== '/').map((url) => precacheUrl(cache, url)),
    ...extractAssets(html).map((url) => precacheUrl(cache, url)),
  ]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !key.endsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/* ------------------------------- Estrategias ------------------------------ */

/**
 * Network-first de navegación: con red siempre responde el servidor (aquí
 * sigue mandando su 404 real); solo si la red falla se recurre a la caché.
 */
async function navigateNetworkFirst(event, request, url) {
  try {
    const response = await fetch(request);
    // Refresca el shell precacheado para que la reserva offline no envejezca.
    if (url.pathname === '/' && response.status === 200) {
      const cache = await caches.open(SHELL_CACHE);
      event.waitUntil(cache.put('/', response.clone()));
    }
    return response;
  } catch {
    return offlineNavigation(url);
  }
}

/** Reservas offline: el shell con aviso para `/`, 404 real para el resto. */
async function offlineNavigation(url) {
  if (url.pathname === '/') {
    const shell = await caches.match('/');
    if (shell) {
      const html = await shell.text();
      return new Response(withOfflineNotice(html), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }
  }

  const notFound = await caches.match('/404.html');
  if (notFound) {
    // El fichero /404.html pedido a propósito conserva su estado; cualquier
    // otra ruta inexistente responde con la 404 y su estado real.
    if (url.pathname === '/404.html') return notFound;
    return new Response(await notFound.text(), {
      status: 404,
      statusText: 'Not Found',
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }

  return new Response('Sin conexión y sin reserva local del shell.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** Inserta un aviso fijo (sin JS: la CSP no admite scripts en línea). */
function withOfflineNotice(html) {
  const notice =
    '<div id="sw-offline-notice" role="status" style="position:fixed;left:0;right:0;bottom:0;z-index:9999;' +
    'background:#EA580C;color:#fff;font:600 14px/1.5 system-ui,-apple-system,sans-serif;' +
    'padding:10px 16px;text-align:center">Sin conexión: mostrando la última versión guardada.</div>';
  if (html.includes('</body>')) return html.replace('</body>', `${notice}</body>`);
  return html + notice;
}

/** Network-first con reserva: prioriza la red, la caché solo cubre offline. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    return await putIfStorable(cache, request, response);
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error; // sin red ni reserva: mismo comportamiento que sin SW
  }
}

/** Stale-while-revalidate: responde la reserva al instante y la revalida. */
async function staleWhileRevalidate(event, request) {
  const cached = await caches.match(request);
  if (cached) {
    // Reserva servida ya; la revalidación corre en segundo plano.
    event.waitUntil(
      fetch(request)
        .then(async (response) => {
          const cache = await caches.open(RUNTIME_CACHE);
          await putIfStorable(cache, request, response);
        })
        .catch(() => undefined), // offline: la reserva servida sigue vigente
    );
    return cached;
  }

  const response = await fetch(request);
  const cache = await caches.open(RUNTIME_CACHE);
  return await putIfStorable(cache, request, response);
}

/** Cache-first: los chunks con hash no cambian nunca sin cambiar de nombre. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cache = await caches.open(RUNTIME_CACHE);
  return await putIfStorable(cache, request, response);
}

/* ------------------------------ Interceptación ---------------------------- */

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Escrituras (POST/PATCH/PUT/DELETE): jamás se interceptan ni cachean; si
  // la red falla, AppContext reintentará con su cola `pendingWrite`.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Terceros (tiles OSM, tipografías, Clerk…) fuera de la caché del SW:
  // solo se cachean recursos propios y APIs de la app (política de cookies).
  if (url.origin !== self.location.origin) return;

  // DDL de Supabase y el propio SW: nunca a la caché.
  if (url.pathname.startsWith('/api/supabase/')) return;
  if (url.pathname === '/sw.js') return;

  // Datos con sesión (Bearer): no se persisten en caché compartida.
  if (request.headers.has('Authorization')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigateNetworkFirst(event, request, url));
    return;
  }

  if (url.pathname === '/api/config') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, request));
});
