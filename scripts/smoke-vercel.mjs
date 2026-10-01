/**
 * Humo de las funciones de Vercel — `npm run smoke:vercel` (R6 de la T12).
 *
 * Qué hace, en este orden:
 *
 *  1. **Importa cada `api/*.ts`** y comprueba que exporta un handler
 *     (si algún módulo no compila o arrastra algo raro, aquí revienta).
 *  2. **Estáticos de `vercel.json`**: orden de los rewrites (específicos
 *     antes del catch-all), `_orig` en cada destino, id explícito en el
 *     rewrite de apoyos y ≤ 12 funciones (límite del plan Hobby). Si existen
 *     los rewrites de ciclo de vida (`/api/needs/:id`, `/api/points/:id`,
 *     T2) también se comprueba que entreguen el id por ruta canónica **y**
 *     por `?id=`.
 *  3. **Rutas**: levanta un servidor local que emula el enrutado de Vercel
 *     (filesystem primero y luego los `rewrites` del `vercel.json` real,
 *     expandiendo `:id`/`:path*` como hace `@vercel/routing-utils`) y
 *     dispara la matriz de comprobaciones clave de la T12:
 *       · método correcto → 200/401, método incorrecto → **404 JSON**
 *       · JSON malformado → **400** (mismo cuerpo que Express)
 *       · `?id=` del rewrite entregado → 401 (404 si el id se perdiera)
 *       · espejos filesystem (`/api/support-mine`, `/api/needs-support?id=`,
 *         `/api/sql`) → **404** como Express
 *       · `api/index` → 404 JSON **con la ruta original**
 *       · `/api/supabase/sql` → **401 sin token** y 200 con
 *         `Authorization: Bearer <SQL_ADMIN_TOKEN>` (T3)
 *       · GET paginados → `?page=999` devuelve página vacía con metadatos y
 *         cabeceras `RateLimit-*`; sin `page` la respuesta sigue intacta (T3)
 *       · `PATCH /needs/:id` y `DELETE /points/:id` → 401 con sesión ausente
 *         cuando el rewrite existe, o el 404 histórico si aún no está (T2)
 *  4. **`request.body` que lanza** (comportamiento documentado de Vercel ante
 *     JSON malformado): llama directamente al handler con un getter que
 *     lanza y espera el **400** (P1 de la T12), y con otro error cualquiera
 *     espera el 500.
 *
 * Uso:
 *   npm run smoke:vercel
 *   SMOKE_WITH_ENV=1 npm run smoke:vercel     # lee `.env` (Supabase real)
 *   SMOKE_BASE_URL=https://xxx.vercel.app npm run smoke:vercel   # R6: deploy
 *
 * Por defecto se fuerza `VERCEL=1` (sin `.env`): la corrida es hermética y
 * determinista (sin BD, sin Clerk, sin Gemini). Con `SMOKE_BASE_URL` las
 * mismas rutas se prueban contra el despliegue real; las comprobaciones de
 * código (paso 4) corren igualmente en local.
 */
import http from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Hermético por defecto: sin `.env` no hay BD ni claves → respaldos en memoria.
if (!process.env.SMOKE_WITH_ENV) process.env.VERCEL ??= '1';

// Token local para el caso de éxito de `/api/supabase/sql` (T3): el handler
// lo lee en cada petición, así que basta con definirlo aquí. En los casos sin
// token se borra para comprobar el 401 real.
process.env.SQL_ADMIN_TOKEN ??= 'token-smoke-local';

/* -------------------------------------------------------------------------- */
/* 1) Importar cada api/*.ts                                                   */
/* -------------------------------------------------------------------------- */

const apiDir = path.join(ROOT, 'api');
const apiFiles = readdirSync(apiDir).filter((f) => f.endsWith('.ts')).sort();

/** Ruta montada (`/api/<fichero>`) → handler de la función. */
const handlers = new Map();

for (const file of apiFiles) {
  const mod = await import(pathToFileURL(path.join(apiDir, file)).href);
  if (typeof mod.default !== 'function') {
    console.error(`FALLO: ${file} no exporta un handler por defecto (${typeof mod.default})`);
    process.exit(1);
  }
  handlers.set(`/api/${file.replace(/\.ts$/, '')}`, mod.default);
}
// Convención de Vercel: `/api` exacto lo sirve `api/index.ts`.
if (handlers.has('/api/index')) handlers.set('/api', handlers.get('/api/index'));

/* -------------------------------------------------------------------------- */
/* 2) Estáticos de vercel.json                                                 */
/* -------------------------------------------------------------------------- */

const cfg = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const rewrites = Array.isArray(cfg.rewrites) ? cfg.rewrites : [];
const errores = [];
let checkEstaticos = 0;

function estatico(ok, descripcion) {
  checkEstaticos += 1;
  if (!ok) errores.push(`[estático] ${descripcion}`);
  console.log(`${ok ? 'OK  ' : 'FALLO'} (estático) ${descripcion}`);
}

const catchAll = rewrites.findIndex((r) => r.source === '/api/:path*');
estatico(catchAll === rewrites.length - 1, 'el catch-all `/api/:path*` es el último rewrite');
estatico(
  rewrites.slice(0, -1).every((r) => !r.source.includes(':path*')),
  'ningún rewrite específico usa el patrón del catch-all',
);
estatico(
  rewrites.every((r) => String(r.destination).includes('_orig=')),
  'todos los rewrites arrastran `_orig=`',
);
const needsRewrite = rewrites.find((r) => r.source === '/api/needs/:id/support');
estatico(
  !!needsRewrite &&
    String(needsRewrite.destination).includes('_orig=needs/:id/support') &&
    String(needsRewrite.destination).includes('id=:id'),
  'el rewrite de apoyos entrega el id por ruta canónica Y por `?id=`',
);
// T2: si agente-calidad ya añadió los rewrites de ciclo de vida, tienen que
// cumplir el mismo contrato (y estar antes del catch-all). Si aún no, el
// check pasa sin exigirlos: la comprobación de ruta de más abajo cambia en
// consecuencia (404 histórico en lugar de 401).
const needsIdRewrite = rewrites.find((r) => r.source === '/api/needs/:id');
const pointsIdRewrite = rewrites.find((r) => r.source === '/api/points/:id');
estatico(
  !needsIdRewrite ||
    (String(needsIdRewrite.destination).includes('_orig=needs/:id') &&
      String(needsIdRewrite.destination).includes('id=:id') &&
      rewrites.indexOf(needsIdRewrite) < catchAll),
  'el rewrite de /api/needs/:id (si existe) entrega el id por ruta canónica Y por `?id=`',
);
estatico(
  !pointsIdRewrite ||
    (String(pointsIdRewrite.destination).includes('_orig=points/:id') &&
      String(pointsIdRewrite.destination).includes('id=:id') &&
      rewrites.indexOf(pointsIdRewrite) < catchAll),
  'el rewrite de /api/points/:id (si existe) entrega el id por ruta canónica Y por `?id=`',
);
estatico(apiFiles.length <= 12, `${apiFiles.length} funciones ≤ 12 del plan Hobby`);

/* -------------------------------------------------------------------------- */
/* 3) Servidor local con el enrutado de vercel.json                            */
/* -------------------------------------------------------------------------- */

/** Convierte un `source` (path-to-regexp: `:id`, `:path*`) en RegExp. */
function sourceToRegExp(source) {
  const keys = [];
  let pattern = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ':') {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1;
      const name = source.slice(i + 1, j);
      const star = source[j] === '*';
      keys.push({ name, star });
      if (star) {
        // `/:path*` absorbe la barra previa (zero or more segments).
        if (pattern.endsWith('/')) pattern = pattern.slice(0, -1);
        pattern += '(?:/(.*))?';
      } else {
        pattern += '([^/]+)';
      }
      i = star ? j + 1 : j;
      continue;
    }
    pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  return { re: new RegExp(`^${pattern}$`), keys };
}

const rules = rewrites.map((r) => ({ ...r, ...sourceToRegExp(r.source) }));

/** Expande los parámetros del `source` en el `destination` (path y query). */
function expand(template, params) {
  let out = template;
  // `:name*` antes que `:name`: si no, `:path` partiría antes que el `*`.
  for (const [name, value] of Object.entries(params)) {
    out = out.split(`:${name}*`).join(value).split(`:${name}`).join(value);
  }
  return out;
}

/**
 * Emula la precedencia de Vercel: filesystem (`api/<ruta>.ts`) y, si no
 * existe fichero, los `rewrites` en orden con los parámetros expandidos.
 * Como en `@vercel/routing-utils`, los parámetros del `source` que no
 * aparecen en el path de destino se añaden al query (por eso llega `?id=`).
 */
function resolveTarget(rawUrl) {
  const url = new URL(rawUrl, 'http://vercel.local');

  const rel = url.pathname === '/api' ? '' : url.pathname.startsWith('/api/') ? url.pathname.slice(5) : null;
  if (rel !== null) {
    const fileRoute = `/api/${rel}`;
    if (handlers.has(fileRoute)) {
      return { handler: handlers.get(fileRoute), url: url.pathname + url.search };
    }
  }

  for (const rule of rules) {
    const m = rule.re.exec(url.pathname);
    if (!m) continue;

    const params = {};
    rule.keys.forEach((key, index) => {
      const raw = m[index + 1];
      if (raw === undefined) {
        if (key.star) params[key.name] = ''; // `:path*` sin segmentos → ''
        return;
      }
      params[key.name] = raw;
    });

    const [destPathTemplate, destQueryTemplate = ''] = rule.destination.split('?');
    const destPath = expand(destPathTemplate, params);
    const destQuery = expand(destQueryTemplate, params);
    const query = new URLSearchParams(destQuery);

    for (const name of Object.keys(params)) {
      // Solo si el parámetro NO está en el path de destino (routing-utils).
      const inDestPath = new RegExp(`:${name}(?!\\w)`).test(destPathTemplate);
      if (!inDestPath && !query.has(name)) query.set(name, params[name]);
    }
    for (const [key, value] of url.searchParams) {
      if (!query.has(key)) query.set(key, value);
    }

    const target = `${destPath}?${query.toString()}`;
    const handler = handlers.get(destPath);
    if (!handler) return null;
    return { handler, url: target };
  }

  return null;
}

/** Helpers `status`/`json` que el runtime de Vercel añade a `res`. */
function attachHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.headersSent) res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return body;
  };
}

const server = http.createServer(async (req, res) => {
  const target = resolveTarget(req.url ?? '/');
  if (!target) {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain');
    res.end('404 (sin función ni rewrite)');
    return;
  }
  req.url = target.url;
  attachHelpers(res);
  try {
    await target.handler(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Error interno del servidor.' }));
    }
    console.error('error no controlado:', error);
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const localBase = `http://127.0.0.1:${server.address().port}`;

const BASE = (process.env.SMOKE_BASE_URL ?? localBase).replace(/\/+$/, '');
const esDeploy = BASE !== localBase;

/* -------------------------------------------------------------------------- */
/* Matriz de comprobaciones                                                     */
/* -------------------------------------------------------------------------- */

const JSON_INVALIDO = 'JSON inválido en el cuerpo de la petición.';
const SIN_SESION_APOYO = 'Debes iniciar sesión para apoyar una necesidad.';

/**
 * ¿Los rewrites de ciclo de vida (T2) están ya en `vercel.json`?
 *
 * Si sí, `PATCH /needs/:id` y `DELETE /points/:id` llegan a los núcleos y
 * responden **401** sin sesión; si no, caen en el catch-all y responden el
 * **404** histórico. La comprobación cambia con la configuración real para
 * que la suite esté verde en cualquiera de los dos estados.
 */
const routedNeedsId = resolveTarget('/api/needs/XYZ')?.handler === handlers.get('/api/needs');
const routedPointsId = resolveTarget('/api/points/XYZ')?.handler === handlers.get('/api/points');

/**
 * Caso de ciclo de vida adaptado al estado del `vercel.json`.
 *
 * Con `SMOKE_BASE_URL` manda el `vercel.json` **del despliegue**, que puede
 * ser distinto del local: ahí se aceptan los dos resultados posibles.
 */
function casoCiclo(id, method, path, json, routed) {
  if (esDeploy) return { id, method, path, json, statusAny: [401, 404] };
  if (routed) return { id, method, path, json, status: 401, includes: ['Debes iniciar sesión'] };
  return {
    id,
    method,
    path,
    json,
    status: 404,
    exactBody: { error: `Ruta no encontrada: ${method} ${path.slice('/api'.length)}` },
  };
}

const casos = [
  // --- métodos correctos (rutas canónicas) ---
  { id: 'health', method: 'GET', path: '/api/health', status: 200, includes: ['"status"'] },
  {
    id: 'points',
    method: 'GET',
    path: '/api/points',
    status: 200,
    includes: ['"points"'],
    // Sin `?page=` la respuesta no cambia (compat con el cliente) y los GET
    // llevan cabeceras del límite de tasa (T3/FAL-05).
    header: ['ratelimit-limit', '120'],
    check: (cuerpo) =>
      cuerpo && !('page' in cuerpo) && !('total' in cuerpo)
        ? true
        : 'la respuesta sin paginación no debe llevar metadatos',
  },
  {
    id: 'points ?page=999 → página vacía con metadatos (T3)',
    method: 'GET',
    path: '/api/points?page=999&limit=10',
    status: 200,
    includes: ['"points"'],
    check: (cuerpo) => {
      if (!cuerpo || !Array.isArray(cuerpo.points)) return 'falta el array "points"';
      if (cuerpo.points.length !== 0) return `page=999 devolvió ${cuerpo.points.length} puntos`;
      if (cuerpo.page !== 999 || cuerpo.limit !== 10) return 'faltan page/limit correctos';
      if (typeof cuerpo.total !== 'number' || cuerpo.totalPages !== Math.ceil(cuerpo.total / 10)) {
        return 'faltan total/totalPages coherentes';
      }
      return true;
    },
  },
  { id: 'needs', method: 'GET', path: '/api/needs', status: 200, includes: ['"needs"'] },
  { id: 'comments', method: 'GET', path: '/api/comments', status: 200, includes: ['"comments"'] },
  { id: 'config', method: 'GET', path: '/api/config', status: 200, includes: ['supabaseConnected'] },
  { id: 'sql sin token → 401 (T3)', method: 'GET', path: '/api/supabase/sql', status: 401, includes: ['SQL_ADMIN_TOKEN'] },
  {
    id: 'sql con token → 200 (T3, solo local)',
    method: 'GET',
    path: '/api/supabase/sql',
    headers: { authorization: `Bearer ${process.env.SQL_ADMIN_TOKEN}` },
    status: 200,
    includes: ['"sql"'],
    // El token del despliegue solo lo conoce la persona: el caso con éxito
    // se ejecuta contra el servidor local.
    soloLocal: true,
  },
  { id: 'cabeceras de seguridad', method: 'GET', path: '/api/health', status: 200, header: ['x-content-type-options', 'nosniff'] },
  {
    id: 'POST /api/points sin sesión',
    method: 'POST',
    path: '/api/points',
    json: { name: 'Prueba', category: 'acopio', lat: 3.4, lng: -76.5, address: 'Calle 1', barrio: 'San Antonio' },
    status: 401,
    includes: ['Debes iniciar sesión'],
  },
  {
    id: 'apoyo con id en la PATH (rewrite) → llega el id',
    method: 'POST',
    path: '/api/needs/XYZ/support',
    json: { action: 'add' },
    status: 401,
    includes: [SIN_SESION_APOYO],
    // Si el id se perdiera, el núcleo respondería 404 antes de la auth.
  },
  {
    id: 'apoyo con SOLO `_orig` (URL de destino) → llega el id',
    method: 'POST',
    path: '/api/needs-support?_orig=needs/XYZ/support',
    json: { action: 'add' },
    status: 401,
    includes: [SIN_SESION_APOYO],
  },
  {
    id: 'support/mine por rewrite → 401 (ruta canónica)',
    method: 'GET',
    path: '/api/support/mine',
    status: 401,
    includes: ['Debes iniciar sesión para ver tus apoyos.'],
  },
  {
    id: 'chat vacío → 400 con details de Express',
    method: 'POST',
    path: '/api/chat',
    json: {},
    status: 400,
    includes: ['El mensaje es obligatorio.'],
  },
  {
    id: 'chat SIN content-type → 400 mismos details que Express',
    method: 'POST',
    path: '/api/chat',
    body: '{"message":"hola"}',
    jsonContentType: false,
    status: 400,
    includes: ['El mensaje es obligatorio.'],
  },
  {
    id: 'chat válido → 200 con reply',
    method: 'POST',
    path: '/api/chat',
    json: { message: 'Hola, ¿qué puntos de acopio hay en Siloé?' },
    status: 200,
    includes: ['"reply"'],
    timeout: 20_000,
  },

  // --- método incorrecto → 404 JSON con la ruta mont-relative ---
  { id: 'DELETE /api/points', method: 'DELETE', path: '/api/points', status: 404, exactBody: { error: 'Ruta no encontrada: DELETE /points' } },
  { id: 'PUT /api/needs', method: 'PUT', path: '/api/needs', status: 404, exactBody: { error: 'Ruta no encontrada: PUT /needs' } },
  { id: 'GET apoyo por método', method: 'GET', path: '/api/needs/XYZ/support', status: 404, exactBody: { error: 'Ruta no encontrada: GET /needs/XYZ/support' } },

  // --- ciclo de vida (T2) ---
  casoCiclo('PATCH /api/needs/XYZ sin sesión', 'PATCH', '/api/needs/XYZ', { status: 'resuelta' }, routedNeedsId),
  casoCiclo('DELETE /api/points/XYZ sin sesión', 'DELETE', '/api/points/XYZ', undefined, routedPointsId),
  // Con o sin rewrite, un método no soportado en la ruta con id es 404 y con
  // la misma ruta canónica en el cuerpo (paridad Express ↔ funciones).
  { id: 'GET /api/needs/XYZ → 404', method: 'GET', path: '/api/needs/XYZ', status: 404, exactBody: { error: 'Ruta no encontrada: GET /needs/XYZ' } },
  { id: 'GET /api/points/XYZ → 404', method: 'GET', path: '/api/points/XYZ', status: 404, exactBody: { error: 'Ruta no encontrada: GET /points/XYZ' } },

  // --- espejos filesystem → 404 como Express ---
  { id: 'espejo GET /api/support-mine', method: 'GET', path: '/api/support-mine', status: 404, exactBody: { error: 'Ruta no encontrada: GET /support-mine' } },
  { id: 'espejo POST /api/needs-support?id=', method: 'POST', path: '/api/needs-support?id=XYZ', json: { action: 'add' }, status: 404, exactBody: { error: 'Ruta no encontrada: POST /needs-support' } },
  { id: 'espejo GET /api/sql', method: 'GET', path: '/api/sql', status: 404, exactBody: { error: 'Ruta no encontrada: GET /sql' } },

  // --- body malformado → 400 (paridad con body-parser) ---
  { id: 'JSON malformado en points', method: 'POST', path: '/api/points', body: '{ "name": ', jsonContentType: true, status: 400, exactBody: { error: JSON_INVALIDO } },
  { id: 'JSON malformado en chat', method: 'POST', path: '/api/chat', body: '{ "message": ', jsonContentType: true, status: 400, exactBody: { error: JSON_INVALIDO } },
  { id: 'body >1 MB → 500 (solo local)', method: 'POST', path: '/api/points', body: 'x'.repeat(1_100_000), jsonContentType: true, status: 500, exactBody: { error: 'Error interno del servidor.' }, soloLocal: true },

  // --- api/index (catch-all) → 404 JSON con la ruta original ---
  { id: 'GET /api/xyz', method: 'GET', path: '/api/xyz-inexistente', status: 404, exactBody: { error: 'Ruta no encontrada: GET /xyz-inexistente' } },
  { id: 'GET /api exacto', method: 'GET', path: '/api', status: 404, exactBody: { error: 'Ruta no encontrada: GET /' } },
  { id: 'GET /api/a/b/c', method: 'GET', path: '/api/a/b/c', status: 404, exactBody: { error: 'Ruta no encontrada: GET /a/b/c' } },
  { id: 'PUT /api/xyz', method: 'PUT', path: '/api/xyz', status: 404, exactBody: { error: 'Ruta no encontrada: PUT /xyz' } },
];

let checkRutas = 0;
let fallos = 0;

function resultado(ok, descripcion) {
  checkRutas += 1;
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${descripcion}`);
}

for (const caso of casos) {
  if (caso.soloLocal && esDeploy) continue;

  const headers = { ...(caso.headers ?? {}) };
  let body;
  if (caso.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(caso.json);
  } else if (caso.body !== undefined) {
    if (caso.jsonContentType !== false) headers['content-type'] = 'application/json';
    body = caso.body;
  }

  try {
    const res = await fetch(`${BASE}${caso.path}`, {
      method: caso.method,
      headers: body === undefined && caso.method !== 'GET' ? { 'content-type': 'application/json', ...headers } : headers,
      body,
      signal: AbortSignal.timeout(caso.timeout ?? 10_000),
    });
    const text = await res.text();

    const esperados = caso.statusAny ?? [caso.status];
    let ok = esperados.includes(res.status);
    let detalle = `${caso.method} ${caso.path} → ${res.status} (esperado ${esperados.join(' ó ')})`;

    if (ok && caso.exactBody) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const igual = parsed !== null && JSON.stringify(parsed) === JSON.stringify(caso.exactBody);
      if (!igual) detalle += ` · cuerpo ${text.slice(0, 120)}`;
      ok = igual;
    }
    if (ok && caso.includes) {
      for (const fragmento of caso.includes) {
        if (!text.includes(fragmento)) {
          ok = false;
          detalle += ` · falta ${JSON.stringify(fragmento)} en ${text.slice(0, 120)}`;
        }
      }
    }
    if (ok && caso.header) {
      const [key, value] = caso.header;
      const got = res.headers.get(key);
      if (got !== value) {
        ok = false;
        detalle += ` · header ${key}=${got} (esperado ${value})`;
      }
    }
    if (ok && caso.check) {
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // El `check` decide qué hacer con un cuerpo que no es JSON.
      }
      const veredicto = caso.check(parsed);
      if (veredicto !== true) {
        ok = false;
        detalle += ` · ${typeof veredicto === 'string' ? veredicto : 'el check del cuerpo falló'}`;
      }
    }
    resultado(ok, `${caso.id}: ${detalle}`);
  } catch (error) {
    resultado(false, `${caso.id}: ${caso.method} ${caso.path} → ${error instanceof Error ? error.message : String(error)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* 4) `request.body` que lanza (documentación de Vercel)                        */
/* -------------------------------------------------------------------------- */

function fakeRes() {
  const cabeceras = new Map();
  return {
    headersSent: false,
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      cabeceras.set(String(name).toLowerCase(), value);
      return value;
    },
    getHeader(name) {
      return cabeceras.get(String(name).toLowerCase());
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.headersSent = true;
      this.body = value;
      return value;
    },
  };
}

function fakeReq({ bodyError, body }) {
  const req = {
    method: 'POST',
    url: '/api/points',
    headers: { 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  if (bodyError) {
    Object.defineProperty(req, 'body', { get() { throw bodyError; } });
  } else {
    req.body = body;
  }
  return req;
}

const puntosHandler = handlers.get('/api/points');

async function lanzamiento(descripcion, bodyError, esperado) {
  const res = fakeRes();
  await puntosHandler(fakeReq({ bodyError }), res);
  const ok = res.statusCode === esperado.status && JSON.stringify(res.body) === JSON.stringify(esperado.body);
  resultado(
    ok,
    `${descripcion} → ${res.statusCode} ${JSON.stringify(res.body)} (esperado ${esperado.status} ${JSON.stringify(esperado.body)})`,
  );
}

await lanzamiento(
  'req.body lanza SyntaxError (JSON malformado en Vercel)',
  new SyntaxError('Unexpected token o in JSON at position 1'),
  { status: 400, body: { error: JSON_INVALIDO } },
);
await lanzamiento('req.body lanza un error cualquiera', new Error('boom'), {
  status: 500,
  body: { error: 'Error interno del servidor.' },
});

// Cuerpo pre-parseado por el runtime → pasa al núcleo (401 sin sesión).
{
  const res = fakeRes();
  await puntosHandler(fakeReq({ body: {} }), res);
  const ok = res.statusCode === 401;
  resultado(ok, `req.body pre-parseado {} → ${res.statusCode} (esperado 401)`);
}

/* -------------------------------------------------------------------------- */

server.close();

const total = checkEstaticos + checkRutas;
console.log(`\n${total} comprobaciones · ${errores.length + fallos} fallos · base ${BASE}`);
for (const error of errores) console.log(`  - ${error}`);
console.log(fallos + errores.length === 0 ? 'TODO OK (smoke vercel)' : `${fallos + errores.length} FALLOS`);
process.exit(fallos + errores.length === 0 ? 0 : 1);
