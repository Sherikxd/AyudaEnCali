/**
 * Tests de los núcleos (T6 · FAL-07).
 *
 *   npm run test:server        → node --env-file-if-exists=.env scripts/test-nucleos.mjs
 *
 * Diseño (hereda las lecciones de los harnesses de `/tmp` del log 19):
 *
 *  - **Sin Express ni servidor** (secciones A–L): los núcleos de
 *    `server/handlers/*` se importan como módulos y reciben un `ApiRequest`
 *    + `JsonResponder` falsos; la respuesta se construye igual que `mount()`
 *    de `server/app.ts` (`ApiResult` → status/json, `null` = ya respondió).
 *    La sección **M** (contrato Express ↔ funciones Vercel, MEJ-01) es la
 *    excepción a propósito: levanta Express por HTTP real e invoca las
 *    funciones `api/*.ts` con `req`/`res` falsos para exigir que respondan
 *    idéntico (incluidos los tests de BUG-01 y BUG-03, que ahí sí usan un
 *    cliente Supabase de mentira apuntando al stub del `fetch` global).
 *  - **Sin tocar la BD**: el cliente de Supabase solo se crea en
 *    `initSupabase()` (via `server/bootstrap.ts`), que este script **no**
 *    importa — todo corre contra la caché en memoria. Además se fuerzan
 *    `SUPABASE_* = ''` por si alguna ruta llegara a arrastrar el bootstrap.
 *  - **Sin red**: el `fetch` global está interceptado. Las verificaciones
 *    de JWT de Clerk buscan el JWKS en `api.clerk.com/v1/jwks`: el stub
 *    devuelve la clave pública de un par RSA generado aquí, y los «JWT de
 *    prueba» se firman localmente con la privada correspondiente.
 *    `GEMINI_API_KEY=''` deja el chat en `source: 'local'` determinista.
 *
 * La parte cliente monta `AppProvider` en jsdom (mismo patrón que
 * `scripts/test-authmodal.mjs`) con un stub de `@clerk/clerk-react` para
 * poder encender/apagar la sesión y así ejercitar `ensureIdentity` y la
 * cola `pendingWrite` (T5-T8: 0 tests hasta ahora).
 *
 * Nota (T6): los ~15 checks de `test-authmodal.mjs` que son regex sobre el
 * fuente NO se convirtieron aquí a aserciones de comportamiento — se anota
 * en el log del agente para T17.
 */
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/* ------------------------------------------------------- 0. Entorno seguro */
// Nunca contra la BD real: el cliente solo se construye con initSupabase()
// (no importado), y estos `''` ganan incluso si dotenv volviera a leer .env.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
// Chat determinista: sin clave, el núcleo responde `source: 'local'`.
process.env.GEMINI_API_KEY = '';
// Clave de verificación forzada: el stub de JWKS responde a cualquier
// secretKey, así el resultado no depende del .env de quien ejecute.
process.env.CLERK_SECRET_KEY = 'sk_test_test-nucleos';
process.env.VERCEL ??= '1';

/* ------------------------------- 1. Clave de prueba + stub del fetch global */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'test-nucleos-key',
  alg: 'RS256',
  use: 'sig',
};

const b64 = (value) => Buffer.from(value).toString('base64url');

/** JWT firmado por «Clerk» de prueba (RS256, kid conocido por el stub). */
function mintJwt({ sub, expInSeconds = 300, tamper = false }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-nucleos-key' };
  const payload = {
    sub,
    iss: 'https://test-nucleos.clerk.accounts.dev',
    aud: 'https://test-nucleos.clerk.accounts.dev',
    azp: 'https://test-nucleos.clerk.accounts.dev',
    iat: now,
    nbf: now - 60,
    exp: now + expInSeconds,
    name: 'Tester Nucleos',
  };
  const data = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  let signature = cryptoSign('sha256', Buffer.from(data), privateKey);
  if (tamper) signature = Buffer.from(signature).reverse(); // firma basura
  return `${data}.${b64(signature)}`;
}

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Fetch nativo, guardado ANTES del stub: lo usa la sección M contra Express. */
const realFetch = globalThis.fetch;

/**
 * Falso Supabase de la sección M (fases «con BD»): `initSupabase()` apunta
 * el cliente a esta URL y el stub de `globalThis.fetch` responde en su
 * nombre.
 *
 *  - `down` → la RPC de apoyos LANZA `fetch failed` (error transitorio
 *    agotado): escenario del BUG-01 (BD configurada + escritura no
 *    confirmada).
 *  - `missing-rpc-write-down` → la RPC responde 404 `PGRST205` (esquema
 *    anterior) PERO el respaldo directo (`upsert`) también falla: la otra
 *    reproducción del BUG-01.
 *  - `missing-rpc` → la RPC responde 404 `PGRST205` y el respaldo directo
 *    funciona: activa el conteo exacto (BUG-03).
 */
const SUPABASE_TEST_URL = 'http://supabase.test';
let supabaseScenario = 'down';
/** Recuento «real» de la BD falsa: > 10 000 para demostrar que ya no se trunca. */
const EXACT_COUNT = 12_345;

/** Respuestas del falso PostgREST (solo se usa tras `initSupabase()`). */
function supabaseStub(url, init) {
  const method = String(init?.method ?? 'GET').toUpperCase();

  if (url.includes('/rest/v1/rpc/toggle_need_support')) {
    if (supabaseScenario === 'down') throw new TypeError('fetch failed');
    return jsonResponse(
      {
        code: 'PGRST205',
        message: 'Could not find the function public.toggle_need_support(p_need_id, p_user_id, p_action)',
      },
      404,
    );
  }

  if (url.includes('/rest/v1/need_supporters')) {
    // El respaldo directo del BUG-01 también caído (RPC ausente + upsert roto).
    if (method === 'POST' && supabaseScenario === 'missing-rpc-write-down') throw new TypeError('fetch failed');
    // Conteo exacto (BUG-03): HEAD con `content-range` como PostgREST.
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: { 'content-range': `0/${EXACT_COUNT}` } });
    }
    // Viejo camino `.limit(10_000)`: solo 2 filas → el truncado saldría en rojo.
    if (method === 'GET' && url.includes('limit=10000')) {
      return jsonResponse([{ need_id: 'legacy-1' }, { need_id: 'legacy-2' }]);
    }
    // Sondas de esquema y el respaldo directo con `.select()` (upsert/delete).
    return jsonResponse([]);
  }

  if (url.includes('/rest/v1/help_needs')) {
    if (method === 'PATCH') return new Response(null, { status: 204 });
    if (method === 'POST') return new Response(null, { status: 201 });
    return jsonResponse([]);
  }

  // Cualquier otra tabla del esquema (sondeos incluidos): OK vacío.
  return jsonResponse([]);
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  // JWKS de Clerk para verifyToken (auth.ts) — sin salir de la máquina.
  if (url.includes('api.clerk.com') && url.includes('/jwks')) return jsonResponse({ keys: [jwk] });
  // BD falsa de la sección M (antes de los casos del cliente: no se solapan).
  if (url.startsWith(`${SUPABASE_TEST_URL}/`)) return supabaseStub(url, init);
  // Apoyo del cliente (`POST /api/needs/<id>/support`): recuento del servidor.
  // El stub exige además el método y el Bearer: si la app dejara de mandar
  // identidad, el check de recuento fallaría en vez de dar un falso positivo.
  if (/\/needs\/[^/?]+\/support(?:\?|$)/.test(url)) {
    const auth = init?.headers?.Authorization ?? '';
    if (init?.method !== 'POST' || !auth.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Stub: apoyo sin método POST o sin Bearer.' }, 400);
    }
    return jsonResponse({ success: true, count: 99, supported: true });
  }
  // El resto de llamadas del cliente (config, listados, support/mine…):
  // `{}` deja a los efectos sin cambios (mismo criterio que test-authmodal).
  return jsonResponse({});
};

/* ------------------------------------- 2. Vite (carga TS + stub de Clerk) */
// En SSR Vite externaliza `@clerk/clerk-react` a `import()` nativo: un
// plugin `resolveId` no llega (se probó), así que el alias de Vite sí
// intercepta, y apunta a un stub escrito en un tmpdir (fichero real, sin
// externalizar). El stub controla la sesión con `globalThis.__testSession`.
const clerkStubDir = mkdtempSync(join(tmpdir(), 'test-nucleos-'));
const clerkStubPath = join(clerkStubDir, 'clerk-stub.mjs');
writeFileSync(
  clerkStubPath,
  `
if (!globalThis.__testSession) {
  globalThis.__testSession = { isSignedIn: false, userId: null, openSignInCalls: 0 };
}
const getToken = async () => (globalThis.__testSession.isSignedIn ? 'test-session-token' : null);
export function useAuth() {
  const s = globalThis.__testSession;
  return { isLoaded: true, isSignedIn: s.isSignedIn, userId: s.userId, sessionId: s.isSignedIn ? 'sess_test' : null, getToken };
}
export function useClerk() {
  return {
    openSignIn: () => { globalThis.__testSession.openSignInCalls += 1; },
    signOut: async () => {},
  };
}
export function useUser() {
  const s = globalThis.__testSession;
  return { isLoaded: true, isSignedIn: s.isSignedIn, user: s.userId ? { id: s.userId } : null };
}
export function ClerkProvider({ children }) { return children ?? null; }
export function UserButton() { return null; }
`,
);

const vite = await createServer({
  root,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@clerk/clerk-react': clerkStubPath } },
});

/* --------------------------------------------------------- 3. Utilidades */
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${name}${detail ? `  :: ${detail}` : ''}`);
};

/** Réplica de `fakeRes` de los harnesses del log 19 (JsonResponder mínimo). */
function fakeRes() {
  const headers = new Map();
  return {
    headersSent: false,
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
      return value;
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
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

/**
 * Invoca un núcleo como lo haría `mount()` de `server/app.ts`.
 *
 * Ojo (lección del log 19): `body` va **siempre** definido — los núcleos
 * leen `input.body` directamente y `{}` es el equivalente de `express.json`
 * sin cuerpo.
 */
async function call(handler, { method = 'GET', path, query = {}, body, headers = {}, clientIp = '203.0.113.7', rewritten = false }) {
  const res = fakeRes();
  const input = { method, path, headers, query, body: body ?? {}, clientIp, rewritten };
  const result = await handler(input, res);
  if (result && !res.headersSent) {
    res.status(result.status).json(result.body);
  }
  return { status: res.statusCode, body: res.body, res };
}

const sameText = (got, want) => (got ?? null) === want;

let rootEl = null;
let expressServer = null;
try {
  /* ------------------------------------------------ 4. Carga de núcleos */
  const { getSupabaseClient, initSupabase, respondWriteFailure } = await vite.ssrLoadModule('/server/supabase.ts');
  const { memory, getSupporterSet } = await vite.ssrLoadModule('/server/store.ts');
  const { clientIp } = await vite.ssrLoadModule('/server/http.ts');
  const { needsHandler } = await vite.ssrLoadModule('/server/handlers/needs.ts');
  const { pointsHandler } = await vite.ssrLoadModule('/server/handlers/points.ts');
  const { needsSupportHandler } = await vite.ssrLoadModule('/server/handlers/needsSupport.ts');
  const { supportMineHandler } = await vite.ssrLoadModule('/server/handlers/supportMine.ts');
  const { chatHandler } = await vite.ssrLoadModule('/server/handlers/chat.ts');

  const JWT_AUTHOR = mintJwt({ sub: 'user_nuc_author' });
  const JWT_OTHER = mintJwt({ sub: 'user_nuc_other' });
  const JWT_EXPIRED = mintJwt({ sub: 'user_nuc_author', expInSeconds: -3_600 });
  const JWT_TAMPERED = mintJwt({ sub: 'user_nuc_author', tamper: true });

  /* ------------------------------------------------- A. Aislamiento BD */
  check('A1 el cliente de Supabase queda sin construir (sin bootstrap → nada toca la BD)', getSupabaseClient() === null);

  /* -------------------------------------------- B. Paginación (T3 · GET) */
  const IP_PAGE = '198.51.100.10';
  const page1 = await call(needsHandler, { path: '/needs', query: { page: '1', limit: '2' }, clientIp: IP_PAGE });
  const total = page1.body?.total;
  check(
    'B1 GET /needs?page=1&limit=2 responde metadatos de página',
    page1.status === 200 && page1.body?.page === 1 && page1.body?.limit === 2
      && Array.isArray(page1.body?.needs) && page1.body.needs.length === Math.min(2, total ?? 0)
      && typeof total === 'number' && page1.body?.totalPages === Math.ceil(total / 2)
      && page1.body?.source === 'memory_cache',
    `status=${page1.status} total=${total} items=${page1.body?.needs?.length}`,
  );
  const page2 = await call(needsHandler, { path: '/needs', query: { page: '2', limit: '2' }, clientIp: IP_PAGE });
  const idsPage1 = new Set((page1.body?.needs ?? []).map((n) => n.id));
  const idsPage2 = (page2.body?.needs ?? []).map((n) => n.id);
  check(
    'B2 la página 2 sigue sin solaparse con la 1',
    page2.status === 200 && Array.isArray(page2.body?.needs)
      && page2.body.needs.length === Math.max(0, (total ?? 0) - 2)
      && idsPage2.length > 0 && idsPage2.every((id) => !idsPage1.has(id)),
    `items=${page2.body?.needs?.length}`,
  );
  const plain = await call(needsHandler, { path: '/needs', clientIp: IP_PAGE });
  check(
    'B3 GET /needs sin paginación no lleva metadatos (compat con el cliente)',
    plain.status === 200 && Array.isArray(plain.body?.needs) && !('page' in plain.body) && !('total' in plain.body),
  );
  const pointsPage = await call(pointsHandler, { path: '/points', query: { page: '1', limit: '2' }, clientIp: IP_PAGE });
  check('B4 GET /points paginado responde 200 con metadatos', pointsPage.status === 200 && pointsPage.body?.page === 1 && typeof pointsPage.body?.total === 'number');

  /* ------------------------------------------- C. readLimiter (T3 · 429) */
  const IP_LIMIT = '198.51.100.11';
  let limitedStatus = 0;
  let firstReadHeaders = null;
  for (let i = 1; i <= 121; i += 1) {
    const r = await call(needsHandler, { path: '/needs', clientIp: IP_LIMIT });
    if (i === 1) {
      firstReadHeaders = r.res.getHeader('RateLimit-Limit');
      limitedStatus = r.status;
    }
    if (i === 121) limitedStatus = r.status;
  }
  check('C1 las lecturas anuncian RateLimit-Limit: 120', sameText(firstReadHeaders, '120'), `got=${firstReadHeaders}`);
  check('C2 la lectura 121 para en 429 con el aviso del limitador', limitedStatus === 429, `status=${limitedStatus}`);

  /* ------------------------------------------------- D. X-Forwarded-For */
  // Cadena de decisión FAL-06: sin `req.ip`, manda el último salto válido
  // (el primero hacia el cliente); una entrada forjada a la izquierda no
  // cambia la clave; `::ffff:` cuenta igual que su IPv4.
  const xff = (headers, socketIp = '127.0.0.1') => clientIp({ headers, socket: { remoteAddress: socketIp } });
  check('D1 XFF forjada a la izquierda no cambia la clave', xff({ 'x-forwarded-for': '198.51.100.99, 192.0.2.55' }) === '192.0.2.55');
  check('D2 la misma clave con la XFF «verdadera» sola', xff({ 'x-forwarded-for': '192.0.2.55' }) === '192.0.2.55');
  check('D3 ::ffff:192.0.2.55 normaliza a 192.0.2.55', xff({ 'x-forwarded-for': '::ffff:192.0.2.55' }) === '192.0.2.55');
  check('D4 una entrada corrupta se salta, no rompe la clave', xff({ 'x-forwarded-for': 'no-es-ip, 203.0.113.9' }) === '203.0.113.9');
  check('D5 sin XFF cae al socket normalizado', xff({}, '::ffff:127.0.0.1') === '127.0.0.1');
  check('D6 sin nada (sin XFF ni socket) la clave es «unknown»', clientIp({ headers: {}, socket: {} }) === 'unknown');
  // Integraión con el limitador: mismo salto real → misma cuenta, aunque la
  // XFF mandada a mano diga lo contrario.
  const sharedKey = xff({ 'x-forwarded-for': '198.51.100.99, 192.0.2.55' });
  const otherKey = xff({ 'x-forwarded-for': '192.0.2.56' });
  const rXff1 = await call(needsHandler, { path: '/needs', clientIp: sharedKey });
  const rXff2 = await call(needsHandler, { path: '/needs', clientIp: sharedKey });
  const rXff3 = await call(needsHandler, { path: '/needs', clientIp: otherKey });
  const rem = (r) => Number(r.res.getHeader('RateLimit-Remaining'));
  check(
    'D7 las dos peticiones con la misma XFF real comparten contador…',
    rem(rXff1) === 119 && rem(rXff2) === 118,
    `remaining=${rem(rXff1)},${rem(rXff2)}`,
  );
  check('D8 otro salto real tiene cuenta propia', rem(rXff3) === 119, `remaining=${rem(rXff3)}`);

  /* ------------------------------ E. Necesidades: auth, autoría, ciclo de vida (T1/T2) */
  const IP_NEEDS = '198.51.100.20';
  const e1 = await call(needsHandler, { method: 'POST', path: '/needs', body: { title: 'Necesidad de prueba', barrio: 'El Poblado 2' }, clientIp: IP_NEEDS });
  check('E1 POST /needs sin sesión → 401 con el aviso exacto', e1.status === 401 && sameText(e1.body?.error, 'Debes iniciar sesión para publicar una necesidad.'), `status=${e1.status}`);

  const e2 = await call(needsHandler, {
    method: 'POST',
    path: '/needs',
    headers: { authorization: `Bearer ${JWT_AUTHOR}` },
    body: { id: 'nuc-test-1', title: 'Necesidad de prueba con JWT', barrio: 'El Poblado 2' },
    clientIp: IP_NEEDS,
  });
  check(
    'E2 POST con JWT de prueba → 201 y autoría solo del JWT',
    e2.status === 201 && e2.body?.need?.id === 'nuc-test-1' && e2.body?.need?.authorId === 'user_nuc_author' && e2.body?.need?.supportersCount === 0,
    `status=${e2.status} author=${e2.body?.need?.authorId}`,
  );

  const e3 = await call(needsHandler, {
    method: 'POST',
    path: '/needs',
    headers: { authorization: `Bearer ${JWT_AUTHOR}` },
    body: { id: 'nuc-test-bad', title: 'ab', barrio: 'X' },
    clientIp: IP_NEEDS,
  });
  check('E3 POST con datos inválidos → 400 con detalles (nunca corrige en silencio)', e3.status === 400 && sameText(e3.body?.error, 'Datos de necesidad inválidos.') && Array.isArray(e3.body?.details) && e3.body.details.length > 0, `status=${e3.status}`);

  const e4 = await call(needsHandler, {
    method: 'PATCH',
    path: '/needs/nuc-test-1',
    headers: { authorization: `Bearer ${JWT_AUTHOR}` },
    body: { status: 'resuelta' },
    clientIp: IP_NEEDS,
  });
  check('E4 el autor hace PATCH → 200 y el cambio persiste', e4.status === 200 && e4.body?.need?.status === 'resuelta', `status=${e4.status}`);

  const e5 = await call(needsHandler, {
    method: 'PATCH',
    path: '/needs/nuc-test-1',
    headers: { authorization: `Bearer ${JWT_OTHER}` },
    body: { status: 'activa' },
    clientIp: IP_NEEDS,
  });
  check('E5 otro usuario hace PATCH → 403 solo-autor', e5.status === 403 && sameText(e5.body?.error, 'Solo quien publicó la necesidad puede modificarla.'), `status=${e5.status}`);

  const e6 = await call(needsHandler, {
    method: 'PATCH',
    path: '/needs/nuc-test-1',
    headers: { authorization: `Bearer ${JWT_AUTHOR}` },
    body: { status: 'reventada' },
    clientIp: IP_NEEDS,
  });
  check('E6 estado fuera del enum → 400 (rechazado, no corregido)', e6.status === 400 && sameText(e6.body?.error, 'Datos de necesidad inválidos.'), `status=${e6.status}`);

  const e7 = await call(needsHandler, { method: 'DELETE', path: '/needs/nuc-test-1', headers: { authorization: `Bearer ${JWT_OTHER}` }, clientIp: IP_NEEDS });
  check('E7 DELETE de otro usuario → 403', e7.status === 403 && sameText(e7.body?.error, 'Solo quien publicó la necesidad puede modificarla.'), `status=${e7.status}`);

  const e8 = await call(needsHandler, { method: 'DELETE', path: '/needs/nuc-test-1', headers: { authorization: `Bearer ${JWT_AUTHOR}` }, clientIp: IP_NEEDS });
  check('E8 DELETE del autor → 200 con el id', e8.status === 200 && e8.body?.success === true && e8.body?.id === 'nuc-test-1', `status=${e8.status}`);

  const e9 = await call(needsHandler, { method: 'PATCH', path: '/needs/nuc-test-1', headers: { authorization: `Bearer ${JWT_AUTHOR}` }, body: { status: 'activa' }, clientIp: IP_NEEDS });
  check('E9 PATCH tras borrar → 404', e9.status === 409 || e9.status === 404 ? e9.status === 404 : false, `status=${e9.status}`);

  const e10 = await call(needsHandler, { method: 'POST', path: '/needs', headers: { authorization: `Bearer ${JWT_EXPIRED}` }, body: { title: 'Caducada de prueba', barrio: 'San Antonio' }, clientIp: IP_NEEDS });
  check('E10 JWT caducado → 401', e10.status === 401, `status=${e10.status}`);
  const e11 = await call(needsHandler, { method: 'POST', path: '/needs', headers: { authorization: `Bearer ${JWT_TAMPERED}` }, body: { title: 'Firma rota de prueba', barrio: 'San Antonio' }, clientIp: IP_NEEDS });
  check('E11 JWT con firma alterada → 401', e11.status === 401, `status=${e11.status}`);

  /* ------------------------------------------- F. Puntos: mismo tratamiento */
  const IP_POINTS = '198.51.100.21';
  const f1 = await call(pointsHandler, {
    method: 'POST',
    path: '/points',
    headers: { authorization: `Bearer ${JWT_AUTHOR}` },
    body: { id: 'puc-test-1', name: 'Punto de prueba', lat: 3.45, lng: -76.55, address: 'Calle 1 # 2-3', barrio: 'El Poblado 2' },
    clientIp: IP_POINTS,
  });
  check('F1 POST /points con JWT → 201 y nace sin verificar', f1.status === 201 && f1.body?.point?.id === 'puc-test-1' && f1.body?.point?.verified === false && f1.body?.point?.authorId === 'user_nuc_author', `status=${f1.status}`);

  const f2 = await call(pointsHandler, { method: 'POST', path: '/points', body: { name: 'sin sesion', lat: 3, lng: -76, address: 'x 1', barrio: 'y' }, clientIp: IP_POINTS });
  check('F2 POST /points sin sesión → 401', f2.status === 401 && sameText(f2.body?.error, 'Debes iniciar sesión para reportar un punto de ayuda.'), `status=${f2.status}`);

  const f3 = await call(pointsHandler, { method: 'PUT', path: '/points/puc-test-1', headers: { authorization: `Bearer ${JWT_OTHER}` }, body: { name: 'Ajeno' }, clientIp: IP_POINTS });
  check('F3 PUT de otro usuario → 403 solo-autor', f3.status === 403 && sameText(f3.body?.error, 'Solo quien publicó el punto puede modificarlo.'), `status=${f3.status}`);

  const f4 = await call(pointsHandler, { method: 'PUT', path: '/points/puc-test-1', headers: { authorization: `Bearer ${JWT_AUTHOR}` }, body: { name: 'Punto renombrado' }, clientIp: IP_POINTS });
  check('F4 PUT del autor → 200 y renombra', f4.status === 200 && f4.body?.point?.name === 'Punto renombrado', `status=${f4.status}`);

  const f5 = await call(pointsHandler, { method: 'PUT', path: '/points/puc-test-1', headers: { authorization: `Bearer ${JWT_AUTHOR}` }, body: {}, clientIp: IP_POINTS });
  check('F5 PUT sin campos editables → 400', f5.status === 400 && sameText(f5.body?.error, 'Datos de punto inválidos.'), `status=${f5.status}`);

  const f6 = await call(pointsHandler, { method: 'DELETE', path: '/points/puc-test-1', headers: { authorization: `Bearer ${JWT_AUTHOR}` }, clientIp: IP_POINTS });
  check('F6 DELETE del autor → 200', f6.status === 200 && f6.body?.success === true, `status=${f6.status}`);

  const f7 = await call(pointsHandler, { method: 'PUT', path: '/points/puc-test-1', headers: { authorization: `Bearer ${JWT_AUTHOR}` }, body: { name: 'Otra' }, clientIp: IP_POINTS });
  check('F7 PUT tras borrar → 404', f7.status === 404 && sameText(f7.body?.error, 'Punto de ayuda no encontrado.'), `status=${f7.status}`);

  /* --------------------------------------- G. Apoyos (needs/:id/support) */
  const IP_SUPPORT = '198.51.100.22';
  const seedList = await call(needsHandler, { path: '/needs', clientIp: IP_SUPPORT });
  const seedNeed = seedList.body?.needs?.[0];
  check('G0 el listado de partida trae necesidades de la semilla', Array.isArray(seedList.body?.needs) && seedList.body.needs.length > 0, `n=${seedList.body?.needs?.length}`);
  const seedCount = seedNeed?.supportersCount;

  const g1 = await call(needsSupportHandler, { method: 'POST', path: `/needs/${seedNeed?.id}/support`, body: { action: 'add' }, clientIp: IP_SUPPORT });
  check('G1 apoyar sin sesión → 401', g1.status === 401 && sameText(g1.body?.error, 'Debes iniciar sesión para apoyar una necesidad.'), `status=${g1.status}`);

  const g2 = await call(needsSupportHandler, { method: 'POST', path: `/needs/${seedNeed?.id}/support`, headers: { authorization: `Bearer ${JWT_AUTHOR}` }, body: { action: 'add' }, clientIp: IP_SUPPORT });
  check('G2 apoyo con JWT → 200, sube el contador y marca supported', g2.status === 200 && g2.body?.supported === true && g2.body?.count === seedCount + 1, `status=${g2.status} count=${g2.body?.count} (semilla ${seedCount})`);

  const g3 = await call(needsSupportHandler, { method: 'POST', path: `/needs/${seedNeed?.id}/support`, headers: { authorization: `Bearer ${JWT_AUTHOR}` }, body: { action: 'add' }, clientIp: IP_SUPPORT });
  check('G3 repetir «add» es idempotente (no duplica)', g3.status === 200 && g3.body?.supported === true && g3.body?.count === seedCount + 1, `count=${g3.body?.count}`);

  const g4 = await call(needsSupportHandler, { method: 'POST', path: `/needs/${seedNeed?.id}/support`, headers: { authorization: `Bearer ${JWT_AUTHOR}` }, body: { action: 'borrar' }, clientIp: IP_SUPPORT });
  check('G4 acción desconocida → 400', g4.status === 400 && sameText(g4.body?.error, 'Acción no válida: usa "add" o "remove".'), `status=${g4.status}`);

  const g5 = await call(needsSupportHandler, { method: 'POST', path: `/needs/${seedNeed?.id}/support`, headers: { authorization: `Bearer ${JWT_AUTHOR}` }, body: { action: 'remove' }, clientIp: IP_SUPPORT });
  check('G5 «remove» retira el apoyo y devuelve el contador', g5.status === 200 && g5.body?.supported === false && g5.body?.count === seedCount, `count=${g5.body?.count}`);

  const g6 = await call(needsSupportHandler, { method: 'POST', path: '/needs-support', query: { id: seedNeed?.id }, headers: { authorization: `Bearer ${JWT_AUTHOR}` }, body: { action: 'add' }, clientIp: IP_SUPPORT });
  check('G6 espejo /needs-support sin rewrite → 404 como Express', g6.status === 404 && sameText(g6.body?.error, 'Ruta no encontrada: POST /needs-support'), `status=${g6.status} ${JSON.stringify(g6.body)}`);

  /* ------------------------------------------- H. 404 de espejos y rutas */
  const h1 = await call(needsHandler, { path: '/needs/nuc-test-1', clientIp: IP_SUPPORT });
  check('H1 GET con id (método no soportado) → 404 canónico', h1.status === 404 && sameText(h1.body?.error, 'Ruta no encontrada: GET /needs/nuc-test-1'), `${JSON.stringify(h1.body)}`);
  const h2 = await call(needsHandler, { method: 'PUT', path: '/needs', clientIp: IP_SUPPORT });
  check('H2 PUT /needs → 404 canónico', h2.status === 404 && sameText(h2.body?.error, 'Ruta no encontrada: PUT /needs'));
  const h3 = await call(pointsHandler, { method: 'DELETE', path: '/points', clientIp: IP_SUPPORT });
  check('H3 DELETE /points → 404 canónico', h3.status === 404 && sameText(h3.body?.error, 'Ruta no encontrada: DELETE /points'));
  const h4 = await call(supportMineHandler, { path: '/support-mine', clientIp: IP_SUPPORT });
  check('H4 espejo GET /support-mine → 404 canónico', h4.status === 404 && sameText(h4.body?.error, 'Ruta no encontrada: GET /support-mine'), `${JSON.stringify(h4.body)}`);
  const h5 = await call(supportMineHandler, { path: '/support/mine', clientIp: IP_SUPPORT });
  check('H5 GET /support/mine sin sesión → 401', h5.status === 401 && sameText(h5.body?.error, 'Debes iniciar sesión para ver tus apoyos.'), `status=${h5.status}`);
  const h6 = await call(supportMineHandler, { path: '/support/mine', headers: { authorization: `Bearer ${JWT_AUTHOR}` }, clientIp: IP_SUPPORT });
  check('H6 GET /support/mine con JWT → 200 con la lista de apoyos', h6.status === 200 && Array.isArray(h6.body?.needIds), `status=${h6.status} ${JSON.stringify(h6.body)}`);
  const h7 = await call(chatHandler, { path: '/chat', clientIp: IP_SUPPORT });
  check('H7 GET /chat → 404 canónico', h7.status === 404 && sameText(h7.body?.error, 'Ruta no encontrada: GET /chat'));

  /* ------------------------------------------------ I. Chat local (T5) */
  const IP_CHAT = '198.51.100.30';
  const i1 = await call(chatHandler, { method: 'POST', path: '/chat', body: { message: '¿Dónde hay agua cerca de Siloé?' }, clientIp: IP_CHAT });
  check('I1 sin GEMINI_API_KEY el chat responde 200 con source local', i1.status === 200 && i1.body?.source === 'local' && typeof i1.body?.reply === 'string' && i1.body.reply.length > 0, `status=${i1.status} source=${i1.body?.source}`);
  const i2 = await call(chatHandler, { method: 'POST', path: '/chat', body: { message: '' }, clientIp: IP_CHAT });
  check('I2 mensaje vacío → 400', i2.status === 400 && sameText(i2.body?.error, 'Mensaje inválido.'), `status=${i2.status}`);
  const IP_CHAT2 = '198.51.100.31';
  let chat429 = 0;
  for (let i = 1; i <= 16; i += 1) {
    const r = await call(chatHandler, { method: 'POST', path: '/chat', body: { message: `pregunta ${i}` }, clientIp: IP_CHAT2 });
    if (r.status === 429) chat429 = i;
  }
  check('I3 el límite de chat corta en la pregunta 16 (429)', chat429 === 16, `cortó en=${chat429}`);

  /* ---------------------------------- J. Fallo de escritura: 503 y 409 */
  const res503 = fakeRes();
  respondWriteFailure(res503, 'la necesidad', { message: 'connection refused' });
  check('J1 BD caída → 503 con mensaje accionable', res503.statusCode === 503 && sameText(res503.body?.error, 'La base de datos no está disponible. Inténtalo de nuevo en unos segundos.'), `${res503.statusCode}`);
  const res409 = fakeRes();
  respondWriteFailure(res409, 'la necesidad', { code: '23505', message: 'duplicate key value violates unique constraint' });
  check('J2 id duplicado → 409', res409.statusCode === 409 && sameText(res409.body?.error, 'Ya existe la necesidad con ese identificador. Recarga la página y vuelve a intentarlo.'), `${res409.statusCode}`);

  /* --------------------------------------------- K. Cliente: sync puro */
  const { mergeById, countPending } = await vite.ssrLoadModule('/src/utils/sync.ts');
  const seedIds = new Set(['seed-x']);
  const k1 = mergeById([{ id: 'a', title: 'local' }], [{ id: 'a', title: 'servidor' }], seedIds);
  check('K1 mergeById: lo remoto gana por id', k1.length === 1 && k1[0].title === 'servidor', JSON.stringify(k1));
  const k2 = mergeById(
    [{ id: 'pend', pending: true }, { id: 'yo' }, { id: 'seed-x' }],
    [{ id: 'rem' }],
    seedIds,
  );
  check('K2 mergeById: el pendiente va primero, el seed se descarta', k2.map((x) => x.id).join(',') === 'pend,rem,yo', k2.map((x) => x.id).join(','));
  const localList = [{ id: 'x' }];
  const k3 = mergeById(localList, undefined, seedIds);
  check('K3 mergeById: sin remoto se conserva lo local', k3.length === 1 && k3[0].id === 'x');
  check('K4 countPending cuenta solo los pendientes', countPending([{ id: 'a', pending: true }, { id: 'b' }, { id: 'c', pending: true }]) === 2);

  /* ----------------------------------- L. Cola offline y ensureIdentity */
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000/',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.matchMedia ??= (media) => ({
    matches: false, media, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  });
  win.scrollTo ??= () => {};
  if (!win.ResizeObserver) win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!win.IntersectionObserver) {
    win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  }
  const defineGlobal = (key, value) =>
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  for (const key of [
    'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
    'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLButtonElement',
    'HTMLFormElement', 'HTMLAnchorElement', 'SVGElement', 'Element', 'Node', 'DocumentFragment',
    'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'MutationObserver', 'FileReader',
    'DOMParser', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
  ]) {
    if (key in win) defineGlobal(key, win[key]);
  }
  defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { AppProvider, useApp } = await vite.ssrLoadModule('/src/context/AppContext.tsx');

  let appCtx = null;
  const Probe = () => {
    appCtx = useApp();
    return null;
  };

  rootEl = createRoot(document.getElementById('root'));
  await act(async () => {
    rootEl.render(React.createElement(AppProvider, null, React.createElement(Probe)));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  check('L1 monta con sesión cerrada y modal de registro cerrado', appCtx !== null && appCtx.isAuthModalOpen === false && appCtx.supportedNeedIds.length === 0);

  // ensureIdentity: sin sesión, la escritura se encola y se abre el modal
  // con el mensaje de la acción (T8 · nunca se escribe sin identidad).
  const targetNeed = 'need-1';
  const beforeCount = appCtx.helpNeeds.find((n) => n.id === targetNeed)?.supportersCount;
  await act(async () => {
    await appCtx.supportNeed(targetNeed, 'add');
  });
  check('L2 sin sesión: no se apoya y se encola…', appCtx.supportedNeedIds.length === 0, `supported=${JSON.stringify(appCtx.supportedNeedIds)}`);
  check(
    'L3 …y se abre el modal con el mensaje de la acción (ensureIdentity)',
    appCtx.isAuthModalOpen === true
      && appCtx.authModalMessage === 'Inicia sesión con tu cuenta para apoyar esta necesidad.',
    `modal=${appCtx.isAuthModalOpen} msg="${appCtx.authModalMessage}"`,
  );
  check('L4 el contador local no se movió en la cola', appCtx.helpNeeds.find((n) => n.id === targetNeed)?.supportersCount === beforeCount);

  // completeAuthModal: cierra el modal PERO conserva la escritura en cola.
  await act(async () => {
    appCtx.completeAuthModal();
  });
  check('L5 completeAuthModal cierra el modal y conserva la cola', appCtx.isAuthModalOpen === false);

  // Entra la sesión → el efecto reanuda la escritura pendiente y el
  // servidor (stub) manda el recuento real.
  globalThis.__testSession = { isSignedIn: true, userId: 'user_front_1', openSignInCalls: 0 };
  await act(async () => {
    appCtx.openFaq(); // un cambio de estado cualquiera fuerza el re-render
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  check(
    'L6 al entrar la sesión se reanuda la cola: apoyo aplicado y recuento del servidor',
    appCtx.supportedNeedIds.includes(targetNeed) && appCtx.helpNeeds.find((n) => n.id === targetNeed)?.supportersCount === 99,
    `supported=${JSON.stringify(appCtx.supportedNeedIds)} count=${appCtx.helpNeeds.find((n) => n.id === targetNeed)?.supportersCount}`,
  );
  check('L7 no se llamó a openSignIn (el perfil local no estaba registrado)', globalThis.__testSession.openSignInCalls === 0);

  // closeAuthModal: cancelar DESCARTA la cola (no debe publicarse después).
  globalThis.__testSession = { isSignedIn: false, userId: null, openSignInCalls: 0 };
  await act(async () => {
    appCtx.closeFaq();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const discardNeed = 'cali-acopio-2';
  await act(async () => {
    await appCtx.supportNeed(discardNeed, 'add');
  });
  check('L8 segunda escritura sin sesión vuelve a encolarse', appCtx.isAuthModalOpen === true && !appCtx.supportedNeedIds.includes(discardNeed));
  await act(async () => {
    appCtx.closeAuthModal(); // cancelar: descarta la acción pendiente
  });
  globalThis.__testSession = { isSignedIn: true, userId: 'user_front_1', openSignInCalls: 0 };
  await act(async () => {
    appCtx.openFaq();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  check(
    'L9 closeAuthModal descarta la cola: al entrar no se apoya nada',
    !appCtx.supportedNeedIds.includes(discardNeed) && appCtx.isAuthModalOpen === false,
    `supported=${JSON.stringify(appCtx.supportedNeedIds)}`,
  );

  /* --------------- M. Contrato Express ↔ funciones Vercel (MEJ-01 + BUGs) */
  // Escenarios idénticos ejecutados contra LOS DOS adaptadores: Express
  // (HTTP real contra `server/app.ts`) y las funciones de Vercel (`api/*.ts`
  // con el adaptador `server/vercel.ts`, usando las URLs que producen los
  // rewrites de `vercel.json`). El contrato exige el MISMO status y el MISMO
  // cuerpo. Aquí viven también los tests de BUG-01 (503 con BD configurada;
  // caché intacta) y BUG-03 (respaldo con conteo exacto sin truncar).
  const IP_M = '198.51.100.40';
  const AUTH_AUTHOR = { authorization: `Bearer ${JWT_AUTHOR}` };
  const AUTH_OTHER = { authorization: `Bearer ${JWT_OTHER}` };
  const SIN_SESION_APOYO = 'Debes iniciar sesión para apoyar una necesidad.';
  const BD_CAIDA = 'La base de datos no está disponible. Inténtalo de nuevo en unos segundos.';
  const contratoNeed = 'contrato-need-1';
  const contratoNeedRef = () => memory.needs.find((item) => item.id === contratoNeed);
  const authorInSupporters = () => getSupporterSet(contratoNeed).has('user_nuc_author');

  const { app: expressApp } = await vite.ssrLoadModule('/server/app.ts');
  expressServer = http.createServer(expressApp);
  await new Promise((resolve) => expressServer.listen(0, '127.0.0.1', resolve));
  const expressBase = `http://127.0.0.1:${expressServer.address().port}`;

  // Cada función de Vercel se invoca con la URL que su rewrite le entrega
  // (o con la del espejo filesystem, cuando no hay rewrite).
  const vercelRoutes = {
    '/api/needs-support': (await vite.ssrLoadModule('/api/needs-support.ts')).default,
    '/api/needs': (await vite.ssrLoadModule('/api/needs.ts')).default,
    '/api/support-mine': (await vite.ssrLoadModule('/api/support-mine.ts')).default,
  };

  /** Petición HTTP real al servidor Express de esta sección. */
  async function callExpress({ method = 'GET', path, headers = {}, body }) {
    const finalHeaders = { ...headers };
    let payload;
    if (body !== undefined) {
      finalHeaders['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await realFetch(`${expressBase}${path}`, { method, headers: finalHeaders, body: payload });
    const text = await response.text();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* sin JSON se compara el texto crudo */
    }
    return { status: response.status, body: parsed };
  }

  /**
   * Petición a una función de Vercel: `req` con la URL que le deja el rewrite
   * (`_orig` + `id`) o la del espejo filesystem, cuerpo ya pre-parseado (como
   * el runtime) y la misma `res` falsa del resto del harness.
   */
  async function callVercel({ method = 'GET', vurl, headers = {}, body }) {
    const pathname = new URL(vurl, 'http://vercel.local').pathname;
    const handler = vercelRoutes[pathname];
    if (!handler) return { status: -1, body: { error: `sin función registrada para ${pathname}` } };
    const res = fakeRes();
    const req = { method, url: vurl, headers: { ...headers }, socket: { remoteAddress: '127.0.0.1' } };
    if (body !== undefined) {
      req.headers['content-type'] = 'application/json';
      req.body = body;
    }
    await handler(req, res);
    return { status: res.statusCode, body: res.body };
  }

  /**
   * Ejecuta el mismo escenario en ambos adaptadores: el contrato exige el
   * MISMO status y el MISMO cuerpo (JSON idéntico). `expectativa(result)`,
   * si se pasa, debe cumplirse en LAS DOS respuestas (devuelve `true` o un
   * detalle del fallo).
   */
  async function contrato(name, spec, expectativa) {
    const viaExpress = await callExpress(spec);
    const viaVercel = await callVercel(spec);
    let ok =
      viaExpress.status === viaVercel.status &&
      JSON.stringify(viaExpress.body) === JSON.stringify(viaVercel.body);
    let detail = `express=${viaExpress.status} vercel=${viaVercel.status}`;
    if (typeof expectativa === 'function') {
      for (const [side, result] of [
        ['express', viaExpress],
        ['vercel', viaVercel],
      ]) {
        const failure = expectativa(result);
        if (failure !== true) {
          ok = false;
          detail += ` · ${side}: ${failure}`;
        }
      }
    }
    check(name, ok, `${detail} :: ${JSON.stringify(viaExpress.body)}`);
    return { viaExpress, viaVercel };
  }

  // Semilla de la sección: creada en caché (sin BD) para que los dos
  // adaptadores lean exactamente la misma fila en memoria.
  const m0 = await call(needsHandler, {
    method: 'POST',
    path: '/needs',
    headers: AUTH_AUTHOR,
    body: { id: contratoNeed, title: 'Necesidad del contrato Express ↔ Vercel', barrio: 'El Poblado 2' },
    clientIp: IP_M,
  });
  check(
    'M0 semilla: POST /needs crea la necesidad de la sección (201)',
    m0.status === 201 && m0.body?.need?.id === contratoNeed,
    `status=${m0.status} ${JSON.stringify(m0.body)}`,
  );

  // --- BUG-01 · modo sin BD: el toggle en caché sigue documentado y verde ---
  const m1 = await call(needsSupportHandler, {
    method: 'POST',
    path: `/needs/${contratoNeed}/support`,
    headers: AUTH_AUTHOR,
    body: { action: 'add' },
    clientIp: IP_M,
  });
  check(
    'M1 BUG-01 sin BD → 200 de caché (modo sin cliente Supabase)',
    m1.status === 200 && m1.body?.success === true && m1.body?.count === 1 && m1.body?.supported === true,
    `status=${m1.status} count=${m1.body?.count}`,
  );
  const m2 = await call(needsSupportHandler, {
    method: 'POST',
    path: `/needs/${contratoNeed}/support`,
    headers: AUTH_AUTHOR,
    body: { action: 'remove' },
    clientIp: IP_M,
  });
  check(
    'M2 …y «remove» vuelve a 0 (toggle idempotente sin BD)',
    m2.status === 200 && m2.body?.count === 0 && m2.body?.supported === false,
    `status=${m2.status} count=${m2.body?.count}`,
  );

  // --- Contrato sin BD: 401 / 403 / 404 canónico / 404 espejo / éxitos ---
  await contrato(
    'M3 contrato 401 sin sesión: canónico vs rewrite `_orig`+`id` (pierde el id → sería 404)',
    {
      method: 'POST',
      path: `/api/needs/${contratoNeed}/support`,
      vurl: `/api/needs-support?_orig=needs/${contratoNeed}/support&id=${contratoNeed}`,
      body: { action: 'add' },
    },
    (r) =>
      r.status === 401 && sameText(r.body?.error, SIN_SESION_APOYO)
        ? true
        : `401 esperado, llegó ${r.status} ${JSON.stringify(r.body)}`,
  );
  await contrato(
    'M4 contrato: la función ve SOLO `_orig` (URL de destino) y aún así llega el id',
    {
      method: 'POST',
      path: `/api/needs/${contratoNeed}/support`,
      vurl: `/api/needs-support?_orig=needs/${contratoNeed}/support`,
      body: { action: 'add' },
    },
    (r) =>
      r.status === 401 && sameText(r.body?.error, SIN_SESION_APOYO)
        ? true
        : `401 esperado, llegó ${r.status} ${JSON.stringify(r.body)}`,
  );
  await contrato(
    'M5 contrato: espejo filesystem `/api/needs-support?id=` → 404 como Express',
    {
      method: 'POST',
      path: `/api/needs-support?id=${contratoNeed}`,
      vurl: `/api/needs-support?id=${contratoNeed}`,
      headers: AUTH_AUTHOR,
      body: { action: 'add' },
    },
    (r) =>
      r.status === 404 && sameText(r.body?.error, 'Ruta no encontrada: POST /needs-support')
        ? true
        : `404 canónico esperado, llegó ${r.status} ${JSON.stringify(r.body)}`,
  );
  await contrato(
    'M6 contrato: PATCH de quien NO es autor → 403 en ambos',
    {
      method: 'PATCH',
      path: `/api/needs/${contratoNeed}`,
      vurl: `/api/needs?_orig=needs/${contratoNeed}&id=${contratoNeed}`,
      headers: AUTH_OTHER,
      body: { status: 'resuelta' },
    },
    (r) =>
      r.status === 403 && sameText(r.body?.error, 'Solo quien publicó la necesidad puede modificarla.')
        ? true
        : `403 esperado, llegó ${r.status} ${JSON.stringify(r.body)}`,
  );
  await contrato(
    'M7 contrato: GET con id (método no soportado) → 404 canónico en ambos',
    {
      method: 'GET',
      path: `/api/needs/${contratoNeed}`,
      vurl: `/api/needs?_orig=needs/${contratoNeed}&id=${contratoNeed}`,
    },
    (r) =>
      r.status === 404 && sameText(r.body?.error, `Ruta no encontrada: GET /needs/${contratoNeed}`)
        ? true
        : `404 canónico esperado, llegó ${r.status} ${JSON.stringify(r.body)}`,
  );
  await contrato(
    'M8 contrato: espejo GET `/api/support-mine` → 404 como Express',
    { method: 'GET', path: '/api/support-mine', vurl: '/api/support-mine' },
    (r) =>
      r.status === 404 && sameText(r.body?.error, 'Ruta no encontrada: GET /support-mine')
        ? true
        : `404 espejo esperado, llegó ${r.status} ${JSON.stringify(r.body)}`,
  );
  await contrato(
    'M9 contrato: apoyo con sesión (canónico vs rewrite) → 200 y mismo recuento',
    {
      method: 'POST',
      path: `/api/needs/${contratoNeed}/support`,
      vurl: `/api/needs-support?_orig=needs/${contratoNeed}/support&id=${contratoNeed}`,
      headers: AUTH_AUTHOR,
      body: { action: 'add' },
    },
    (r) =>
      r.status === 200 && r.body?.success === true && r.body?.count === 1 && r.body?.supported === true
        ? true
        : `200/count=1 esperados, llegó ${r.status} ${JSON.stringify(r.body)}`,
  );
  await contrato(
    'M10 contrato: retirar el apoyo en ambos adaptadores → 200 y vuelve a 0',
    {
      method: 'POST',
      path: `/api/needs/${contratoNeed}/support`,
      vurl: `/api/needs-support?_orig=needs/${contratoNeed}/support&id=${contratoNeed}`,
      headers: AUTH_AUTHOR,
      body: { action: 'remove' },
    },
    (r) =>
      r.status === 200 && r.body?.count === 0 && r.body?.supported === false
        ? true
        : `count=0 esperado, llegó ${r.status} ${JSON.stringify(r.body)}`,
  );

  // --- BUG-01 · con BD: escritura NO confirmada → 503, nunca caché ---
  // El cliente de Supabase se crea apuntando al stub del fetch global
  // (`supabaseStub`): la RPC de apoyos lanzará `fetch failed` (transitoria).
  process.env.SUPABASE_URL = SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  initSupabase();
  check('M11 la fase «con BD» instala el cliente de Supabase', getSupabaseClient() !== null);

  const intactCount = contratoNeedRef()?.supportersCount;
  const m12 = await call(needsSupportHandler, {
    method: 'POST',
    path: `/needs/${contratoNeed}/support`,
    headers: AUTH_AUTHOR,
    body: { action: 'add' },
    clientIp: IP_M,
  });
  check(
    'M12 BUG-01 BD configurada + fallo transitorio → 503, sin success: true',
    m12.status === 503 && m12.body?.success === undefined && sameText(m12.body?.error, BD_CAIDA),
    `status=${m12.status} body=${JSON.stringify(m12.body)}`,
  );
  check(
    'M13 BUG-01 el 503 NO muta la caché ni el set de supporters',
    contratoNeedRef()?.supportersCount === intactCount && !authorInSupporters(),
    `count=${contratoNeedRef()?.supportersCount} (esperado ${intactCount})`,
  );

  await contrato(
    'M14 contrato: el 503 de persistencia (BUG-01) es idéntico en ambos adaptadores',
    {
      method: 'POST',
      path: `/api/needs/${contratoNeed}/support`,
      vurl: `/api/needs-support?_orig=needs/${contratoNeed}/support&id=${contratoNeed}`,
      headers: AUTH_AUTHOR,
      body: { action: 'add' },
    },
    (r) =>
      r.status === 503 && r.body?.success === undefined && sameText(r.body?.error, BD_CAIDA)
        ? true
        : `503 esperado, llegó ${r.status} ${JSON.stringify(r.body)}`,
  );
  check(
    'M15 BUG-01 tras el 503 en Express y en Vercel la caché sigue intacta',
    contratoNeedRef()?.supportersCount === intactCount && !authorInSupporters(),
    `count=${contratoNeedRef()?.supportersCount} (esperado ${intactCount})`,
  );

  // BUG-01 · la OTRA reproducción: RPC ausente (esquema antiguo) pero el
  // respaldo directo (`upsert`) también falla → sigue sin confirmarse nada.
  supabaseScenario = 'missing-rpc-write-down';
  const m16 = await call(needsSupportHandler, {
    method: 'POST',
    path: `/needs/${contratoNeed}/support`,
    headers: AUTH_AUTHOR,
    body: { action: 'add' },
    clientIp: IP_M,
  });
  check(
    'M16 BUG-01 respaldo directo con write.error → 503, sin success y sin tocar la caché',
    m16.status === 503 &&
      m16.body?.success === undefined &&
      sameText(m16.body?.error, BD_CAIDA) &&
      contratoNeedRef()?.supportersCount === intactCount &&
      !authorInSupporters(),
    `status=${m16.status} count=${contratoNeedRef()?.supportersCount} body=${JSON.stringify(m16.body)}`,
  );

  // --- BUG-03 · sin RPC (esquema antiguo): respaldo con conteo EXACTO ---
  supabaseScenario = 'missing-rpc';
  const m17 = await call(needsSupportHandler, {
    method: 'POST',
    path: `/needs/${contratoNeed}/support`,
    headers: AUTH_AUTHOR,
    body: { action: 'add' },
    clientIp: IP_M,
  });
  check(
    'M17 BUG-03 respaldo sin RPC → 200 con el conteo EXACTO (12 345 > 10 000, sin truncar)',
    m17.status === 200 &&
      m17.body?.success === true &&
      m17.body?.count === EXACT_COUNT &&
      m17.body?.supported === true,
    `status=${m17.status} count=${m17.body?.count} (esperado ${EXACT_COUNT})`,
  );

  await contrato(
    'M18 contrato: el respaldo con conteo exacto responde igual en ambos adaptadores',
    {
      method: 'POST',
      path: `/api/needs/${contratoNeed}/support`,
      vurl: `/api/needs-support?_orig=needs/${contratoNeed}/support&id=${contratoNeed}`,
      headers: AUTH_AUTHOR,
      body: { action: 'add' },
    },
    (r) =>
      r.status === 200 && r.body?.count === EXACT_COUNT && r.body?.supported === true
        ? true
        : `count=${EXACT_COUNT} esperado, llegó ${r.status} ${JSON.stringify(r.body)}`,
  );

  expressServer.closeAllConnections?.();
  expressServer.close();
  expressServer = null;
} catch (error) {
  failures += 1;
  console.log(`FALLO excepción  :: ${error?.stack ?? error}`);
} finally {
  try {
    if (expressServer) {
      expressServer.closeAllConnections?.();
      await new Promise((resolve) => expressServer.close(resolve));
    }
  } catch { /* el cierre del servidor de la sección M es best-effort */ }
  try {
    if (rootEl) await act(async () => rootEl.unmount());
  } catch { /* el desmontaje es best-effort */ }
  await vite.close();
  rmSync(clerkStubDir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nTODO OK' : `\n${failures} FALLO(S)`);
process.exit(failures === 0 ? 0 : 1);
