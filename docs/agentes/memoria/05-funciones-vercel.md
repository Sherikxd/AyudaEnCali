# Log — backend (2026-09-30) · T10 · Funciones por ruta en Vercel

## En qué trabajé
- Tarea **T10** del tablero (`docs/agentes/tareas-semana-1.md`): migrar la
  API de la única función Express (`api/index.ts` exportando la app) a
  **una función por ruta** en `api/*.ts`, manteniendo intactos local, Docker
  y Cloud Run y con paridad de comportamiento obligatoria.

## Cambios realizados
- `server/http.ts` (nuevo) → primitivas framework-agnósticas: tipos
  `ApiRequest`/`ApiResult`/`ApiHandler`/`JsonResponder`, cabeceras de
  seguridad, `notFoundResult`, `effectiveMethod` (HEAD→GET para dispatch),
  `clientIp` (X-Forwarded-For con fallback) y `readJsonBody` (espejo de
  `express.json({limit:'1mb'})` para Vercel: ct no-JSON → `undefined`,
  pre-parseo del runtime, vacío → `{}`, malformado → 400, >1 MB → 500 por
  `content-length` o por tope del stream).
- `server/bootstrap.ts` (nuevo) → `dotenv.config()` solo si `!VERCEL` +
  `initSupabase()`; importado **el primero** por `server/app.ts` y por cada
  `api/*.ts`.
- `server/store.ts` (nuevo) → caché en memoria (`memory.points/needs/
  comments`), `getSupporterSet`, `allSupporters`, `pushInCache`.
- `server/limiters.ts` (nuevo) → `writeLimiter` (60/min) y `chatLimiter`
  (15/min), instancias compartidas por los núcleos.
- `server/handlers/*.ts` (nuevos: `health`, `config`, `sql`, `points`,
  `needs`, `needsSupport`, `supportMine`, `comments`, `chat`) → los cuerpos
  de ruta de `server/app.ts` movidos con el mismo orden de comprobaciones;
  `initGemini`/generación/`buildSystemInstruction`/`buildLocalReply` viven en
  `handlers/chat.ts`; `resolveNeedId` acepta id por query o por ruta.
- `server/app.ts` → ahora es **solo el adaptador Express**: router montado en
  `/api` con `mount(ruta, núcleo)` (`app.all` + promesa → `errorHandler`),
  conservando intactas `if (!process.env.VERCEL) app.use(compression());`,
  `express.json({ limit: '1mb' })`, `app.use('/api', apiNotFound)`,
  `app.use(errorHandler)` y `export { app }; export default app;`.
- `server/vercel.ts` (nuevo) → `createApiRoute(núcleo)`: cabeceras →
  `readJsonBody` → `toApiRequest` (query de la URL, `path` desde `_orig` o
  restando `/api`) → núcleo → respuesta si nadie escribió; errores → 500
  genérico en log. Exporta los tipos `VercelRequest`/`VercelResponse`.
- `server/rateLimit.ts` → `createRateLimiter` devuelve `{ enforce(key,res),
  middleware }`: `enforce` escribe cabeceras `RateLimit-*` y `429` sin
  cadena `next()`; `middleware` es el envoltorio Express.
- `server/auth.ts` → `AuthRequest = { headers }` y
  `respondUnauthorized(res: JsonResponder)`: sirve a Express y a Vercel.
- `server/supabase.ts` → `respondWriteFailure` se mudó aquí desde
  `app.ts` (409 duplicado / 503 BD caída), ahora sobre `JsonResponder`.
- `server/middleware.ts` → `securityHeaders` delega en `setSecurityHeaders`;
  se elimina `asyncHandler` (lo sustituye la promesa de `mount`).
- `api/*.ts` (nuevos, 9) → `import '../server/bootstrap'` + `createApiRoute`.
- `api/index.ts` → reescrito: **ya no exporta la app**; es el fallback 404
  JSON con el mensaje mont-relative de Express.
- `vercel.json` → 4 rewrites en orden (específicos antes del catch-all),
  cada destino con `_orig=<ruta canónica>` (`:path*` en el catch-all);
  `framework`/`build`/`headers` intactos; sin `functions` ni `maxDuration`.
- `README.md` → sección Vercel reescrita con la tabla función↔ruta↔método,
  nota de escalado/cold starts, límite de 12 funciones y espejos.
- `docs/agentes/decisiones.md` → entrada `2026-09-30 · La API de Vercel pasa
  a una función por ruta (T10)`.
- `docs/agentes/tareas-semana-1.md` → fila T10 ✅ con resultado.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ (40/40 «TODO OK») |
| `npm run verify:rls` | n/a (sin cambios en `supabase/schema.sql`) |
| Matriz de paridad Express (43 peticiones) vs línea base pre-refactor | ✅ 41/42 líneas byte a byte; 1 distinta = longitud del chat (Gemini 503 → respaldo local) y `ce=gzip` |
| Matriz `--api-only` Express vs funciones `api/*.ts` (harness Vercel) | ✅ idéntica salvo `ce=gzip` (borde) y chat |
| Harness en 4 escenarios (`destination`, `--url=original`, `--no-preparse`, `--no-auto-id`) | ✅ paridad exacta en los 4 |
| `vercel.json` vs `openapi.vercel.sh/vercel.json` | ✅ (claves permitidas, 4 rewrites) |
| `grep -r "from 'vite'\|express.static" server/ api/` | ✅ solo el comentario de advertencia |
| Humo `NODE_ENV=production` (health 200, 404 JSON, SPA 404) | ✅ |

## Decisiones tomadas (y por qué)
- **Núcleos que responden sobre `JsonResponder`** (`{setHeader,status,json}`
  que cumplen Express y Vercel): reutiliza `respondUnauthorized` y
  `respondWriteFailure` sin duplicarlos; `null` = «ya respondido en `res`».
- **Orden de la función = orden real de Express** (cabeceras → parseo →
  límite → auth → núcleo): el prompt proponía límite antes de parsear, pero
  la paridad manda; los casos de JSON malformado/>1 MB responden sin
  cabeceras `RateLimit-*`, igual que en la línea base.
- **`_orig` en cada rewrite**: da igual si Vercel entrega la URL original o
  la del destino tras el rewrite (los dos escenarios están probados); sin
  `_orig` válido se resta `/api` a la URL, que es el camino Express.
- **`sqlHandler` exige `path === '/supabase/sql'`**: así el espejo
  filesystem `/api/sql` responde 404 como Express en vez de exponer el SQL.
- **`>1 MB` → 500** (no 413) por paridad con el `errorHandler` de Express,
  que no traduce `entity.too.large`.
- Mensajes 404 mont-relative (`Ruta no encontrada: GET /xyz`, sin `/api`):
  Express los emitía desde `apiNotFound` montado en `/api`.

## Riesgos y deuda que dejo
- **Hobby: 12 funciones/deployment** → 10 usadas, 2 de margen; añadir rutas
  nuevas puede romper el límite.
- **Límite de tasa por función**: cada proceso tiene su contador (en Express
  era único); con N funciones caben N×60/min por IP en escrituras. La BD
  sigue protegida por RLS.
- **Espejos filesystem** (`/api/sql`, `/api/support-mine`, y
  `POST /api/needs-support?id=…`): en Vercel responden (200/401) donde
  Express da 404. No los usa el cliente; documentado en README y decisiones.
- **`_orig=:path*` depende de la expansión de parámetros de Vercel**: si no
  se expandiera, el fallback (restar `/api` de la URL original) produce el
  mismo resultado salvo que el runtime entregara la URL del destino *y* no
  expandiera el query (combinación no probable; cubierta por el escenario
  `--url=original` del harness).
- **JSON malformado con pre-parseo del runtime**: si Vercel dejara el stream
  consumido y `req.body` indefinido, se respondería `{}` en vez de 400; el
  emulador cubre el camino de reinyección. Pendiente de confirmar con un
  deploy real.
- El texto del chat no es determinista (Gemini con temperatura 0.4 y
  frecuentes 503 → respaldo local): en diffs de paridad normalizar.

## Para el siguiente agente
- La matriz de paridad está en `/tmp/opencode/t10-matrix.mjs` (argumento
  BASE + `--api-only`) y la línea base en `/tmp/opencode/t10-baseline.txt`;
  el emulador de routing de Vercel en `/tmp/opencode/t10-fnserver.mjs`.
- Si añades una ruta: crear `server/handlers/<nombre>.ts` + `mount()` en
  `server/app.ts` + `api/<nombre>.ts` + rewrite específico (si tiene dos
  niveles) en `vercel.json`, y sumar el caso a la matriz.
- `api/*.ts` no deben importar nada que arrastre `vite` (Vercel empaqueta su
  cadena de imports).
