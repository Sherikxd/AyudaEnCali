# Log — frontend (2026-10-02) · T30 PWA offline

## En qué trabajé

- Tareas del tablero: **T30 · PWA offline (FEAT-05)** de la auditoría de
  objetivos (`tareas-semana-2.md`), heredera de T15. Área propia:
  `src/**`, `index.html`, `public/**`.

## Cambios realizados

- **`public/manifest.webmanifest`** (nuevo): nombre/descripción de la marca,
  `id/start_url/scope: "/"`, `display: standalone` (+`display_override`),
  `theme_color: #EA580C` y `background_color: #FFFFFF` (mismos que el
  `<meta name="theme-color">` y el `body` de `index.html`), `lang: es-CO`,
  categorías `["health","social","utilities"]` e iconos:
  - `favicon.svg` (`sizes: any`),
  - `images/icon-192.png` + `images/icon-512.png` (`purpose: any`) —
    **generados con `rsvg-convert` desde el `favicon.svg` de la marca**,
    RGBA con esquinas transparentes,
  - `images/icon-maskable-192.png` + `icon-maskable-512.png`
    (`purpose: maskable`) — variante a sangre (naranja pleno + cruz dentro
    de la zona segura del 80 %),
  - `images/apple-touch-icon.png` existente, reutilizado con su **sizes
    honesta `180x180`** (no se tocó el fichero).
- **`public/sw.js`** (nuevo): Service Worker clásico, versionado con
  `CACHE_VERSION = 'v1'` y cachés `ayudaencali-shell-v1` /
  `ayudaencali-runtime-v1` (las de versiones viejas se borran en
  `activate`; `skipWaiting` + `clients.claim` para activarse sin esperar).
  Estrategias por recurso más abajo.
- **`index.html`**: `<link rel="manifest" href="/manifest.webmanifest" />`
  junto a los iconos (el `meta theme-color` ya existía, línea 11).
- **`src/main.tsx`**: registro de `/sw.js` **solo en producción**
  (`import.meta.env.PROD && 'serviceWorker' in navigator`), tras el evento
  `load` y con `logger.warn` en caso de fallo (sin `console.*`).
- Iconos nuevos en `public/images/`: `icon-192.png`, `icon-512.png`,
  `icon-maskable-192.png`, `icon-maskable-512.png`.

## Estrategias del Service Worker (resumen)

| Recurso | Estrategia |
| --- | --- |
| Navegaciones (GET, `mode: navigate`) | **network-first**: con red responde SIEMPRE el servidor (la 404 real de la SPA sigue intacta, decisión 2026-09-29 — verificado: `/ruta-inexistente` con red devuelve 404, no el shell). Sin red: `/` → shell cacheado + aviso offline fijo (HTML inline, sin JS, compatible con la CSP `script-src 'self'`); `/404.html` → la copia cacheada con su 200; cualquier otra ruta → `404.html` cacheada con **estado 404** |
| `GET /api/config` | **network-first** (nunca una clave pública de Clerk caducada; la caché solo cubre offline y si no hay reserva se propaga el error de red igual que sin SW) |
| Resto `GET /api/*` | **stale-while-revalidate** (reserva al instante + revalidación en `waitUntil`) |
| `GET /assets/*` (hash, inmutables) | **cache-first** |
| Estáticos propios (imágenes, favicon, manifest) | stale-while-revalidate |
| `POST/PATCH/PUT/DELETE` | **no se interceptan** (nunca se cachean; sin red, la cola `pendingWrite` de `AppContext` — con estados `failed` — se encarga, tal como pide el tablero) |

Protecciones: solo `GET` + mismo origen + respuesta `200` `type: 'basic'`
sin `Cache-Control: no-store|private`; **fuera de alcance**: cross-origin
(tiles OSM, tipografías y Clerk quedan fuera de la caché del SW — coherente
con la política de consentimiento de `src/utils/consent.ts`), `/api/supabase/*`
(DDL), `/sw.js` y cualquier petición con cabecera `Authorization` (datos con
sesión no se persisten). El precache se limita a `/`, `/404.html` y los
chunks `/assets/*` que se extraen del propio HTML del shell (los estáticos
cosméticos se cachean en runtime para que su revalidación actualice la copia
en su propia caché).

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `node --check public/sw.js` | ✅ sintaxis OK |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ · `dist/sw.js`, `dist/manifest.webmanifest` y los 4 iconos presentes |
| `npm run test:ui` | ✅ (TODO OK) |
| `npm run verify:rls` | n/a (no toqué `supabase/`) |
| Humo de prod: `NODE_ENV=production PORT=3124 node --import tsx server.ts` | ✅ `/sw.js` → 200 `application/javascript; charset=UTF-8`; `/manifest.webmanifest` → 200 `application/manifest+json`; `/` → 200; `/404.html` → 200; `/ruta-inexistente` → **404**; iconos → 200 |
| `node /tmp/opencode/test-sw.mjs` (fuera del repo, contra :3124) | ✅ **31/31** — precache simulado (chunks extraídos del HTML real → 200), `isStorable` (404/no-store/private/opaco → false), aviso offline, navegación con red (404 del servidor **sin** shell ni aviso; `/` sin aviso offline), navegación sin red (`/` 200 + aviso, ruta rara → **404** con la página real, `/404.html` → 200) e iconos del manifest |

## Decisiones tomadas (y por qué)

- **Navegaciones network-first** (y no cache-first del shell): es la única
  forma de no romper la decisión «la 404 la sirve el servidor» — con red,
  el servidor manda siempre; la caché solo entra cuando `fetch` falla
  (offline real), nunca tras un 404/5xx.
- **Offline en ruta inexistente → `404.html` con estado 404** (no el shell):
  mantiene el semántica 404 también sin red. Descartado: servir el shell
  para todo (mal SEO/enlaces rotos invisible, el mismo argumento de la
  decisión de 2026-09-29).
- **Escrituras no interceptadas**: el tablero hablaba de «network-first en
  POST con la cola»; dejar pasar las escrituras a red cruda es
  equivalente-fuerte (la cola `pendingWrite` ya distingue transitorio /
  `failed` y reintenta) y evita duplicar lógica dentro del SW.
- **`/api/config` network-first y `Authorization` nunca cacheado**: evita
  clave de Clerk caducada y datos con sesión en caché compartida.
- **Iconos generados del SVG de la marca** en vez de reescalar el JPG/PNG
  existente: tamaños 192/512 reales y honestos; el `apple-touch-icon`
  (180×180) se conserva y se declara con su tamaño real.
- **Precache mínimo (`/`, `/404.html`, chunks)**: `caches.match` devuelve la
  primera caché creada; precachear iconos/favicon en la caché del shell
  haría que una copia vieja ganase siempre a la revalidada hasta un bump de
  versión. Así, los estáticos viven en la caché runtime donde la
  revalidación sustituye la copia en el mismo sitio.

## Riesgos y deuda que dejo

- **Cabecera `no-cache` de `/sw.js` (y `max-age` corto del manifest) — NO es
  mi fichero.** Verificado en el humo: Express sirve ambos con
  `Cache-Control: public, max-age=604800` (7 días; `server.ts:73`
  `express.static(distDir, { maxAge: '7d' })`) y `vercel.json` no tiene
  regla para `/sw.js` ni `/manifest.webmanifest`. Acciones pendientes:
  - `vercel.json` → **agente-calidad**: regla `Cache-Control: no-cache`
    (p. ej. `max-age=0, must-revalidate`) para `/sw.js`
    (y corto para `/manifest.webmanifest`).
  - `server.ts` → **agente-backend**: `setHeaders` para `sw.js` y
    `manifest.webmanifest` en `express.static(distDir, …)`, con paridad con
    Vercel (misma deuda que T32 de paridad de cabeceras).
  - Tras deploy: `curl -I https://ayuda-en-cali.vercel.app/sw.js` para
    confirmar la cabecera real.
- **Instalabilidad real en dispositivo** → revisión manual pendiente:
  Lighthouse/Chrome (Android) «Instalar app», bisagra del icono maskable y
  prueba offline real (avión): mapa/tablón desde caché + publicar con la
  cola y que se envíe al volver. No puedo validar el dispositivo desde aquí.
- **`CACHE_VERSION` es manual**: si un release cambia iconos o `favicon.svg`
  sin tocar `sw.js`, hay que subir la versión para que el precache se
  renueve (los chunks `/assets/*` no lo necesitan: van por hash + la
  reserva del shell se refresca en cada navegación con red).
- **La caché runtime acumula chunks `/assets/*` de deploys antiguos** hasta
  el siguiente bump de `CACHE_VERSION` (solo los que se pidieron; la
  presión de almacenamiento la gestiona el navegador). Podida futura
  posible en `activate`.
- **Tests automáticos del SW en la puerta**: `scripts/**` no es mi área →
  propuesta para **agente-backend/agente-calidad**: añadir a
  `smoke-vercel` (o al test de núcleos) `GET /sw.js` y
  `GET /manifest.webmanifest` con 200 + content-type, y a `test:ui` un
  check de `<link rel="manifest">` en `index.html`. El chequeo funcional
  que usé vive fuera del repo (`/tmp/opencode/test-sw.mjs`, 31 checks).
- No toqué el tablero `tareas-semana-2.md` (docs fuera de mi área salvo
  este log): **T30 puede pasar a ✅** con este cierre.

## Para el siguiente agente

- El SW vive en `public/sw.js` (se copia tal cual a `dist/`; no pasa por
  Vite ni `tsc`). Cualquier cambio → subir `CACHE_VERSION` y revalidar con
  `npm run lint && npx vite build && npm run test:ui` + humo local.
- La cola offline de escrituras (`pendingWrite` con `failed`) NO se tocó:
  el SW solo cachea lecturas; si alguien propone cachear escrituras, es una
  decisión que pasa por `decisiones.md`.
- Si se introduce enrutador (FEAT-03), revisar `navigateNetworkFirst` y
  `offlineNavigation`: hoy asumen que solo `/` es una ruta válida (decisión
  2026-09-29).
