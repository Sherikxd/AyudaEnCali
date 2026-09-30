# Log — backend (2026-09-30) · T13 · Remediación P1/P2 de la verificación T12

- **T13 · agente-backend**: cerrar los hallazgos P1/P2 de la batería
  independiente de T12 (`memoria/07-verificacion-t10.md`) manteniendo la
  paridad Express ↔ funciones, y cubrir los gaps **R5** (gate de CI) y **R6**
  (humo post-deploy versionado) más la nota de límite de tasa del README.

## En qué trabajé

- Hallazgos atacados: **P1-1** (JSON malformado → 500/colgado en Vercel),
  **P1-2** (`POST /api/needs/:id/support` podía 404 en el primer deploy),
  **P1-3** (el chat servía la semilla, nunca la BD), **P2** (delta de
  `details` al ir sin `content-type`), **R5**, **R6** y la nota de rate limit.
- También cerré de paso **KO-1/KO-2** (espejos de filesystem) y **KO-3**
  (`GET /api` exacto), que eran los otros KO deterministas de T12.

## Cambios realizados

### P1-1 · JSON malformado → 400 (paridad con body-parser)

- `server/http.ts` → `readJsonBody()` envuelve el acceso a `req.body` en su
  propio `try/catch`: `SyntaxError` (o cualquier error de parseo) responde
  **400** `{"error":"JSON inválido en el cuerpo de la petición."}`; cualquier
  otro error responde **500** genérico (misma respuesta que el `errorHandler`
  de Express). Nuevo helper `isMalformedJsonError()`.
- `server/vercel.ts` → `readJsonBody()` se movió **dentro** del `try/catch`
  de `createApiRoute` (antes estaba fuera: la excepción escapaba al runtime).
  Doble red de seguridad: si algún día el `catch` externo atrapara el error,
  respondería 500 en vez de colgar.

### P1-2 · El `id` de `/api/needs/:id/support` llega siempre

- `vercel.json` → el rewrite es ahora
  `/api/needs/:id/support → /api/needs-support?_orig=needs/:id/support&id=:id`
  (el `id` va **explícito** en el query, no depende de la expansión implícita
  de parámetros).
- Evidencia de por qué es seguro: leí el código abierto de
  `@vercel/routing-utils` (`packages/routing-utils/src/superstatic.ts`): los
  valores del query de destino **sí** se interpolan con las capturas del
  `source`, y los parámetros del `source` que no aparecen en el path de
  destino se añaden solos al query. Con la línea explícita, da igual cuál de
  las dos rutas siga el runtime.
- `server/handlers/needsSupport.ts` → `resolveNeedId()` es **path primero**
  (regex `/^\/needs\/([^/]+)\/support\/?$/`), y solo mira `query.id` si
  `input.rewritten` es `true`.

### KO-1/KO-2 · espejos de filesystem → 404 como Express

- `server/http.ts` → `ApiRequest.rewritten?: boolean`.
- `server/vercel.ts` → `toApiRequest()` lo marca `true` cuando la petición
  lleva `_orig` (o sea, vino de un rewrite) y `false` cuando llega por el
  nombre del fichero (`/api/support-mine`, `/api/needs-support`).
- `server/handlers/supportMine.ts` → exige la ruta canónica
  `/^\/support\/mine\/?$/`; el espejo responde **404**
  `{"error":"Ruta no encontrada: GET /support-mine"}` (igual que Express).
- `server/handlers/needsSupport.ts` → `query.id` solo cuenta si `rewritten`;
  sin rewrite, 404 `Ruta no encontrada: POST /needs-support`.
- `GET /api` exacto (**KO-3**): ya lo resolvía `originalPath()` de
  `server/vercel.ts` (`_orig=''` → `/`), ahora cubierto por el humo.

### P1-3 · El chat carga el contexto de Supabase (nunca la semilla)

- **Nuevo** `server/context.ts` → `ensureContextFresh()` con TTL de 30 s y
  `warmContext()` para precalentar. Solo lectura: dispara el mismo
  refresco que ya usaban el resto de núcleos, **sin** `maybeVerifySchema`
  (el throttle de DDL no se multiplica por invocación).
- `server/handlers/chat.ts` → llama a `await ensureContextFresh()` tras la
  validación del mensaje y **antes** de `buildSystemInstruction`, de modo que
  el system prompt y el fallback local (`buildLocalReply`) anuncian los
  puntos/necesidades reales de la BD, no los 5/3 de la semilla.
- `api/chat.ts` → `warmContext()` en la importación del módulo: el *cold
  start* de esa función ya arranca con contexto fresco.

### P2 · `details` idénticos cuando no hay `content-type: json`

- `server/http.ts` → `readJsonBody()` devuelve **`{}`** (no `undefined`) si
  el `content-type` no es JSON, y normaliza `''` → `{}`, imitando a
  body-parser. Ahora `POST /api/chat` sin cabecera responde
  `400 {"details":["El mensaje es obligatorio."]}` en **ambos** entornos
  (antes Vercel decía `«El cuerpo de la petición debe ser un objeto JSON.»`).

### R5 · gate antes de desplegar

- **Nuevo** `.github/workflows/ci.yml` (el repo no tenía `.github/`):
  push/PR a `main` + `workflow_dispatch`, `fetch-depth: 0`, Node 22 (para
  `--env-file-if-exists` de `npm run test:ui`) y la secuencia
  `npm ci || npm install` → `npm run lint` → `npx vite build` →
  `npm run test:ui` → `npm run smoke:vercel`.
  `npm run verify:rls` corre **solo** si cambió `supabase/schema.sql`
  (detectado con `git diff … -- supabase/schema.sql`, o a mano vía
  `workflow_dispatch`) y con `continue-on-error: true` (necesita red y
  binarios de PostgreSQL). YAML validado con el parser de Python: 10 steps.
- Sin `package-lock.json` (solo hay `bun.lock`, congelado y de la persona),
  por eso `npm ci || npm install` y **sin** `cache: npm` de setup-node.

### R6 · humo post-deploy versionado

- **Nuevo** `scripts/smoke-vercel.mjs` (**35 comprobaciones**) +
  `"smoke:vercel"` en `package.json` (la única línea que añadí allí).
  Emula la precedencia real de Vercel leyendo los `rewrites` de `vercel.json`
  (no una copia hardcodeada), levanta los `server/handlers/*` **fuera** del
  entorno Express y comprueba: espejos → 404, `_orig` y `?id=`, JSON malformado
  → 400 (incluido `req.body` lanzando `SyntaxError` simulando el getter de
  Vercel), `req.body` no-JSON → `details: {}`, chat → mismos `details`,
  límite de 1 MB, cabeceras `RateLimit-*` y de seguridad, 404 por método,
  `GET /api` exacto y `GET /api/a/b/c`.
- Modos: por defecto fuerza `VERCEL=1` (**hermético**, no lee `.env`);
  `SMOKE_WITH_ENV=1` usa tus variables; `SMOKE_BASE_URL=<deploy>` ejecuta la
  misma batería contra un despliegue real (esto es lo que cierra P1-1/P1-2 de
  verdad) y `SMOKE_BASE_URL` + `SMOKE_WITH_ENV=1` para un deploy de Preview.

### README (sección Vercel)

- Tabla de **rate limit**: Express = **una** cuenta de 60/min por IP para
  las 4 rutas de escritura; Vercel = **4 cuentas** (60/min por ruta →
  240/min efectivos). Chat 15/min igual en ambos. Nunca *más* restrictivo.
- Espejos: ya **no** se documentan como «responden su ruta canónica», sino
  como bloqueados → 404 como Express.
- Humo: comandos `npm run smoke:vercel` y `SMOKE_BASE_URL=… npm run
  smoke:vercel`, con la lista de comprobaciones del paso 4 ampliada
  (`POST /api/needs/<id>/support` → 401, espejos → 404).
- Aviso de que `.github/workflows/ci.yml` es el gate (Vercel solo corre
  `vite build`).

## Verificación ejecutada (resultados reales)

| Comando | Resultado |
| --- | --- |
| `npm run lint` (`tsc --noEmit`, estricto) | ✅ exit 0 |
| `npx vite build` | ✅ `✓ built in 392ms` |
| `npm run test:ui` | ✅ **40/40** · `TODO OK` |
| `npm run smoke:vercel` | ✅ **35 comprobaciones · 0 fallos** · `TODO OK (smoke vercel)` |
| `node /tmp/opencode/verif-t10/t12-schema.mjs` (schema oficial de Vercel) | ✅ `VALIDO (sin errores)` · 4 rewrites en orden · 10 funciones ≤ 12 |
| `npm run verify:rls` | n/a (no toqué `supabase/schema.sql`) |
| YAML de `.github/workflows/ci.yml` | ✅ `YAML OK, steps: 10` |

**Smoke de Express en local (producción, puerto 3140, PID propio):**

```bash
NODE_ENV=production PORT=3140 node --import tsx server.ts   # y kill de MI pid
```

| Caso | Resultado |
| --- | --- |
| `POST /api/needs` con `{bad json` | **400** `{"error":"JSON inválido en el cuerpo de la petición."}` |
| `POST /api/needs/abc123/support` sin sesión | **401** `Debes iniciar sesión para apoyar una necesidad.` |
| `POST /api/chat` sin sesión (payload válido) | **200** con `reply` (mismo que antes: el chat no exige sesión) |
| `POST /api/chat` sin `content-type` | **400** `details:["El mensaje es obligatorio."]` |
| `GET /api/xyz` | **404** `{"error":"Ruta no encontrada: GET /xyz"}` |
| `GET /api/support-mine` (espejo) | **404** `Ruta no encontrada: GET /support-mine` |
| `POST /api/needs-support?id=abc123` (espejo) | **404** `Ruta no encontrada: POST /needs-support` |
| `GET /api/health` | **200** |

Los mismos casos, ejecutados contra las funciones `api/*.ts` por
`smoke:vercel`, dan **idéntico status y cuerpo**.

Servidores: el mío (3140) terminado con `SIGTERM` limpio; **PID 607589
(puerto 3124) no se tocó** y sigue respondiendo `200`.

## Decisiones tomadas (y por qué)

1. **El espejo se bloquea, no se elimina.** Quitar `/api/support-mine` y
   `/api/needs-support` de `api/` habría sido más limpio, pero rompe el
   contrato de «una función por fichero» que ya documentó T10 y obligaría a
   mover `vercel.json`. El flag `rewritten` es una línea en cada núcleo y
   deja la paridad exacta. *Descartado:* redirigir con `redirect` (cambia el
   status) y devolver 401 en el espejo (paridad rota).
2. **El `id` va explícito en el rewrite.** Duplicar `&id=:id` cuesta un
   carácter y elimina la dependencia de la semántica de expansión de query
   (el caso KO-4 «las tres condiciones a la vez» deja de existir).
3. **El contexto del chat es de solo lectura y con TTL.** Reutilicé el
   refresco existente en vez de un esquema nuevo; `warmContext()` solo
   precarga, **no** verifica/aplica esquema, para no multiplicar las
   sondas de DDL por invocación (el item O2 del checklist sigue pendiente y
   es de la persona, no mío).
4. **`readJsonBody` distingue 400 de 500.** JSON roto → 400 (paridad con
   body-parser); cualquier otra excepción → 500 genérico, con el detalle
   solo en el log (`server/logger.ts`, nunca `console.*`).
5. **CI hermético y sin secretos.** `smoke:vercel` no lee `.env` por
   defecto: el gate no debe depender de variables que GitHub no tiene.
   `verify:rls` va condicionado y con `continue-on-error` para no bloquear
   el pipeline por falta de PostgreSQL en el runner.
6. **Rate limit documentado, no «arreglado».** Multiplicar el límite por
   función es *más* permisivo, nunca restrictivo; endurecerlo (Redis/KV)
   cuesta dinero y toca `server/limiters.ts`, que es de la semana 1.
   Anotado en `decisiones.md`.

## Riesgos y deuda que dejo

- **P1-1, P1-2 y KO-3 solo están cerrados «en local»**: la semántica real de
  `request.body` y de los rewrites se confirma con un deploy. El comando ya
  existe: `SMOKE_BASE_URL=https://<app>.vercel.app npm run smoke:vercel`.
- **El emulador del humo es mío**, no el runtime de Vercel: lee
  `vercel.json` y replica la precedencia (filesystem → rewrites), pero si
  Vercel cambia el orden, el humo seguiría en verde. Por eso `SMOKE_BASE_URL`
  es obligatorio en el checklist de T0.
- **O2 sin tocar** (`SUPABASE_ACCESS_TOKEN` en Vercel + N procesos → N
  sondas de DDL): lo dejé fuera a propósito; pertenece al panel de la
  persona.
- **El chat sigue sin sesión**: igual que antes (paridad), pero es una ruta
  que consume tokens de Gemini; el `chatLimiter` (15/min por IP) es lo único
  que la frena.
- No hice `git add`/`git commit` (lo gestiona la persona) y no toqué
  `src/**`, `supabase/**` ni `bun.lock`.

## Para el siguiente agente

- La fila **T13** está en `tareas-semana-1.md` y las decisiones 1-3 en
  `decisiones.md`; el detalle de T12 sigue en `memoria/07-verificacion-t10.md`.
- Si alguien toca `server/http.ts` o `server/vercel.ts`, el contrato es:
  `rewritten === true` ⇒ la petición vino de un rewrite (puede usar
  `query.id` / ruta canónica); `false` ⇒ espejo de filesystem ⇒ 404.
- Si se añade una ruta nueva en `api/`, añade su caso al humo
  (`scripts/smoke-vercel.mjs`, array `CASES`) y su rewrite **antes** del
  catch-all en `vercel.json`.
