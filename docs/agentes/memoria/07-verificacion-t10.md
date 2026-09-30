# Log — verificación (2026-09-30) · T12 · Batería independiente de la T10

## En qué trabajé

- **T12 · agente-verificacion**: batería de verificación **independiente** de
  la **T10** (migración de la API a una función de Vercel por ruta). No he
  usado los resultados de `05-funciones-vercel.md`: todo se ha reproducido
  desde cero, con harnesses propios escritos para esta misión.
- **Solo lectura** del código (`server/**`, `api/**`, `vercel.json`,
  `scripts/**`, `src/**`, memoria de agentes). Este fichero es **el único**
  que escribo. Sin `git add` / `git commit`.

## Cambios realizados

- `docs/agentes/memoria/07-verificacion-t10.md` → este log (único fichero).
- **Nada de código**: no toqué `server/`, `api/`, `vercel.json`, `src/`,
  `scripts/`, `README.md`. **No toqué `tareas-semana-1.md`** porque el
  tablero no tiene fila T12 (solo T0, ya cerrado).
- Harnesses de prueba **fuera del repo**, en `/tmp/opencode/verif-t10/`:
  `fn-server.mjs` (un proceso por función + `/__state` y `/__mutate`),
  `edge-router.mjs` (lee `vercel.json` real y emula filesystem+rewrites),
  `t12-matrix.mjs`, `t12-r4.mjs`, `t12-body.mjs`, `t12-schema.mjs`,
  `extra.mjs`, `express-smoke.sh`.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ 0 errores (exit 0) |
| `npx vite build` | ✅ «✓ built in 454ms», `dist/` completo |
| `npm run test:ui` | ✅ **40/40** «TODO OK» (contados con `grep -c '^OK'` = 40) |
| `npm run verify:rls` | n/a (no toqué `supabase/schema.sql`) |
| Humo Express `NODE_ENV=production PORT=3130` | ✅ 24/24 (ver §2) |
| Paridad Express ↔ funciones (router con `vercel.json` real) | ⚠️ 53/59 (ver §3) |
| Cuerpo en 3 modos de pre-parseo | ⚠️ 23/27 (ver §3b) |
| R4 · estado y límites en runtime | ✅ 25/25 (ver §4) |
| Cadena de imports / `any` / `console.*` | ✅ 3/3 (ver §5) |
| `vercel.json` vs `openapi.vercel.sh/vercel.json` | ✅ 4/4 (ver §6) |
| R5/R6 (pipeline de despliegue) | ❌ **0/2 → 2 gaps confirmados** (ver §7) |
| `git add` / `git commit` | ❌ no ejecutados (prohibidos) |

---

## 1. Matriz de comprobaciones

| # | Grupo | Total | OK | KO/gap |
| --- | --- | ---: | ---: | ---: |
| 1 | Paquete (lint · build · test:ui) | 3 | 3 | 0 |
| 2 | Humo local Express (:3130) | 24 | 24 | 0 |
| 3 | Paridad Express ↔ funciones | 59 | 53 | **6** |
| 4 | Cuerpo de petición (3 modos de pre-parseo) | 27 | 23 | **4** |
| 5 | R4 · estado y limitadores en runtime | 25 | 25 | 0 |
| 6 | Cadena de imports y estilo | 3 | 3 | 0 |
| 7 | `vercel.json` vs schema oficial | 4 | 4 | 0 |
| 8 | R5/R6 · pipeline y humo post-deploy | 2 | 0 | **2 gaps** |
| | **Total** | **147** | **135** | **12** |

**0 bloqueantes locales.** Los 12 rojos se descomponen así:

- **6 (grupo 3)** → 4 son los **espejos filesystem ya documentados por T10**
  (`/api/support-mine` y `/api/needs-support?id=`) y 2 son **condicionales**
  al routing real de Vercel (expansión de `_orig`, B1/B2 de §3).
- **4 (grupo 4)** → 1 colgado en el modo de runtime más hostil + **3 celdas
  del delta «sin `content-type`»** (mismo status 400, `details` distinto).
- **2 (grupo 8)** → gaps **R5** y **R6** del checklist de T11 (ya existían:
  no los creo, solo los confirmo).

**Antes del primer deploy real hay que cerrar 3 puntos** (ninguno rompe
local/Docker/Cloud Run): **P1** JSON malformado en Vercel (§3b), **P1**
expansión de `_orig` en `needs-support` (B2) y **P1** el chat con caché
semilla (§4).

---

## 2. Humo local Express (`PORT=3130`, proceso propio, ya terminado)

| # | Petición | Resultado |
| ---: | --- | --- |
| 1 | `GET /api/health` | ✅ 200 `{"status":"ok",…}` |
| 2 | `GET /api/config` | ✅ 200 con `clerkPublishableKey` (`pk_test_…`) + `supabaseConnected:true` + `supabaseTablesReady:true` |
| 3 | `GET /api/points` | ✅ 200, `n=5`, `source:"supabase"` |
| 4 | `GET /api/needs` | ✅ 200, `n=4`, `source:"supabase"` |
| 5 | `GET /api/comments` | ✅ 200 |
| 6 | `GET /api/supabase/sql` | ✅ 200 (DDL completo) |
| 7 | `POST /api/points` sin sesión | ✅ 401 |
| 8 | `POST /api/needs` sin sesión | ✅ 401 |
| 9 | `POST /api/comments` sin sesión | ✅ 401 |
| 10 | `POST /api/needs/X/support` sin sesión | ✅ 401 |
| 11 | `POST /api/chat` sin sesión | ✅ **200** (ver nota A) |
| 12 | `POST /api/points` JSON malformado | ✅ 400 `JSON inválido en el cuerpo de la petición.` |
| 13 | `POST /api/chat` JSON malformado | ✅ 400 mismo mensaje |
| 14 | `POST /api/points` body 1,2 MB | ✅ **500** (nota B) |
| 15 | `POST /api/chat` body 1,2 MB | ✅ **500** |
| 16 | `GET /api/xyz-inexistente` | ✅ 404 JSON `Ruta no encontrada: GET /xyz-inexistente` |
| 17 | `DELETE /api/points` | ✅ 404 JSON `Ruta no encontrada: DELETE /points` |
| 18 | `PUT /api/needs` | ✅ 404 JSON `Ruta no encontrada: PUT /needs` |
| 19 | `GET /api/needs/XYZ/support` | ✅ 404 JSON `Ruta no encontrada: GET /needs/XYZ/support` |
| 20 | `/ruta-inexistente` | ✅ **404** + `text/html` con `404.html` («Página no encontrada», `noindex`) |
| 21 | `/` | ✅ 200 + `og:image` (atributo en varias líneas) |
| 22 | `/assets/vendor-react-*.js` | ✅ `content-encoding: gzip` + `cache-control: public, max-age=31536000, immutable` |
| 23 | Espejos: `/api/sql` · `/api/support-mine` (guion) · `POST /api/needs-support?id=` | ✅ 404 `GET /sql` · 404 `GET /support-mine` · 404 `POST /needs-support` |
| 24 | `GET /api` exacto + cabeceras de seguridad en `/` | ✅ 404 JSON `Ruta no encontrada: GET /` + `nosniff`/`SAMEORIGIN`/`strict-origin…`/`geolocation=(self)`/`same-origin` |

**Notas:**

- **(A) `POST /api/chat` sin sesión → 200, y era 200 ANTES de T10**: en
  `HEAD:server.ts:782-784` la ruta solo monta `chatLimiter`, sin
  `getAuthenticatedUser`. El chat es público por diseño (orientación), no es
  una regresión de T10. Si el equipo quiere 401, es un **cambio funcional**
  que debe decidirse como tarea, no como fix de paridad.
- **(B) Body >1 MB → 500, no 400/413**: es lo que daba **antes** de T10 y lo
  que sigue dando Express (`server/middleware.ts:35`, el `errorHandler` no
  traduce `entity.too.large`); `readJsonBody` responde 500 idéntico por
  `content-length` → **paridad**.
- **(C) `GET /api/support/mine` sin sesión en Express → 401, no 404**: Express
  **sí** tiene montada esa ruta (`server/app.ts:98`), así que el 404 que pide
  la misión solo aplica al espejo con guion `/api/support-mine` (fila 23).
- **(D) Gzip**: los assets <1 KB (p. ej. `arrow-right-*.js`, 154 B) **no** se
  comprimen (umbral por defecto de `compression` = 1 KB). Con
  `vendor-react-*.js` (207 kB) sí: `gzip` + `immutable` ✅.

---

## 3. Simulación de las funciones (harness propio, **un proceso por función**)

- `fn-server.mjs`: un proceso por fichero `api/*.ts` (3140 index · 3141
  points · 3142 needs · 3143 needs-support · 3144 support-mine · 3145
  comments · 3146 chat · 3147 health · 3148 config · 3149 sql) con los
  helpers `status`/`json` de `@vercel/node` y pre-parseo configurable.
- `edge-router.mjs` (:3150): lee **`vercel.json` del repo** (no una copia),
  aplica precedencia del filesystem y luego los 4 rewrites en orden,
  expandiendo parámetros, y proxea a cada proceso.
- Cada caso se lanza **contra Express (:3130) y contra el router con la misma
  IP ficticia** y se comparan status + cuerpo (normalizados: timestamps y
  texto de Gemini) + cabeceras de seguridad y `RateLimit-*`.

**Resultados:**

| Suite | Total | OK | KO |
| --- | ---: | ---: | ---: |
| Paridad por el router (`vercel.json`) | 35 | 33 | 2 |
| Escenarios directos de `_orig` / espejos (función aislada) | 15 | 11 | 4 |
| Extras (métodos y rutas: `TRACE`, `HEAD`, `POST /support/mine`, `GET /needs-support`, `POST /sql`, `PUT /chat`, `DELETE /needs/:id/support`, query extra…) | 9 | 9 | 0 |
| **Total** | **59** | **53** | **6** |

En verde (paridad exacta, status + cuerpo + `RateLimit-*` + cabeceras de
seguridad): las 7 lecturas, los 401 anónimos, los 404 por método
(`DELETE/PUT/OPTIONS/HEAD/TRACE`), `HEAD`→200, `GET /api` exacto, JSON
malformado → 400, >1 MB → 500, `POST /api/chat {}` → 400, `api/index.ts` →
404 JSON **tanto con `_orig` como con la URL original**, `needs-support` con
`?id=` **y** con el id en la ruta, y `sql` vía rewrite (`_orig=supabase/sql`)
→ 200.

### Los 6 KO

**KO-1 y KO-2 · espejos filesystem (deterministas, documentados por T10):**

| Espejo | Express | Función |
| --- | --- | --- |
| `GET /api/support-mine` | **404** `Ruta no encontrada: GET /support-mine` | **401** `Debes iniciar sesión para ver tus apoyos.` |
| `POST /api/needs-support?id=XYZ` | **404** `Ruta no encontrada: POST /needs-support` | **401** `Debes iniciar sesión para apoyar una necesidad.` |

`GET /api/sql` **sí** tiene paridad (404 en ambos): `server/handlers/sql.ts:14`
exige `path === '/supabase/sql'`, así que el espejo no filtra el DDL ✅.

**KO-3 · `GET /api` exacto si el catch-all NO expande `_orig` (condicional):**
con URL destino `/api/index?_orig=:path*` la función responde
`Ruta no encontrada: GET /index` en vez de `GET /`. Solo afecta a `GET /api`
exacto (mensaje distinto, sigue siendo 404 JSON).

**KO-4 · `POST /api/needs/:id/support` si el rewrite NO expansiona `:id`
(condicional, el más grave):** con URL destino
`/api/needs-support?_orig=needs/:id/support` **sin** `id` en query → la
función responde **404** en vez de 401/200 → **se rompería «apoyar»**.
Esto ocurre **solo** si se dan a la vez las tres condiciones: (a) el
`destination` no expansiona `:id` dentro del query, (b) el runtime no pasa
`:id` como parámetro automático y (c) la función recibe la URL destino y no
la original. T10 probó (destino+expansión) y (URL original+sin auto-id), pero
**no** esa combinación; la dejaba anotada como riesgo.

**KO-5 y KO-6** → son KO-1/KO-2 repetidos en la suite de escenarios directos.

### 3b. Cuerpo de petición en 3 modos de pre-parseo (27 comparaciones)

| Caso | Express | `off` (stream intacto) | `reinject` (hipótesis de T10) | `consumed` (runtime se come el stream) |
| --- | --- | --- | --- | --- |
| JSON malformado | **400** | 400 ✅ | 400 ✅ | ❌ **SIN RESPUESTA** (colgado) |
| body >1 MB | 500 | 500 ✅ | 500 ✅ | 500 ✅ |
| válido sin sesión | 401 | 401 ✅ | 401 ✅ | 401 ✅ |
| vacío con `content-type: json` | 401 | 401 ✅ | 401 ✅ | 401 ✅ |
| chat `POST /api/chat` sin `content-type` | 400 `details:["El mensaje es obligatorio."]` | ❌ `details:["El cuerpo de la petición debe ser un objeto JSON."]` (×3 modos) |

**P1 · JSON malformado en Vercel (gap R-del, ahora con evidencia de las docs):**
la documentación oficial de Vercel
(<https://vercel.com/docs/functions/runtimes/node-js>, apartado *Request
body*) dice que `request.body` **es un getter** y que *«when the request body
contains malformed JSON, accessing `request.body` will throw an error»*.
`createApiRoute` invoca `await readJsonBody(req, res)` **fuera de su
`try/catch`** (`server/vercel.ts:96-97`), y `readJsonBody` accede a
`req.body` (`server/http.ts:148`) → la excepción **escapa del handler** → el
runtime devolvería **500** (o, si el runtime dejara el stream consumido y
`body` sin definir, la función **no respondería nunca**, como he medido: 5 s
sin respuesta y contaría). En ningún caso el **400** de paridad.
**Recomendación**: envolver `readJsonBody` en `try/catch` dentro de
`createApiRoute` y responder `400 {"error":"JSON inválido en el cuerpo de la
petición."}`; añadir el caso al humo post-deploy (R6).

**P2 · Delta de texto «sin `content-type: json`» (determinista, medido):**
Express deja `req.body = {}` (body-parser) y Vercel deja `undefined` (tabla
oficial: *No header → `undefined`*). El status **400 es igual**, pero cambia
`details`. Con sesión, en `points/needs/comments` cambiaría el mensaje de
validación. Impacto bajo.

---

## 4. R4 · Paridad de estado entre funciones (código + runtime)

### Código

Todo el estado vive en módulos que **cada `api/*.ts` empaqueta por separado**:
`server/store.ts` (`memory` + `needSupporters`), `server/limiters.ts`
(`writeLimiter`, `chatLimiter`), `server/supabase.ts` (`lastVerifyAt`,
`applyAttempts`, `warned…`), `server/auth.ts` (`warnedMissingKey`,
`lastTokenWarnAt`). No hay ningún almacén compartido (Redis/KV/Vercel Blob).

### Runtime (evidencia medida)

1. **Caché aislada**: tras cargar datos en tres funciones,
   `needs.fn` ve **4 necesidades** (BD) y las otras **nueve funciones ven 3**
   (la semilla) → cada proceso tiene su `memory`.
2. **Escritura no cruza procesos**: `POST /__mutate` en `chat.fn` → su
   respuesta pasa de *«5 puntos activos»* a *«6 puntos activos»*, mientras
   `points.fn` sigue en 5 y Express sigue en 5 (BD = 5).
3. **Rate limit por función** (misma IP ficticia):

   | Situación | Express | Funciones |
   | --- | --- | --- |
   | 61 `POST /api/points` | 429 en la 61 | 429 en la 61 |
   | `POST /api/needs` con esa misma IP | **429** (limitador compartido) | **401** (contador propio) |
   | `POST /api/comments` · `POST /api/needs/:id/support` | 429 | 401 |
   | `POST /api/chat` ×16 | 429 en la 16 | 429 en la 16 (config idéntica) |

   Cabeceras 429 idénticas en ambos: `ratelimit-limit: 60`,
   `remaining: 0`, `reset: 60`, `retry-after: 60` y el mismo mensaje.

### Impacto

| Rutas que leen lo que otra escribe | ¿Funciona en Vercel? | Impacto |
| --- | --- | --- |
| `chat` ← `memoryPoints`/`memoryNeeds` | ❌ **Nunca**: `handlers/chat.ts` no consulta Supabase y su `memory` es la semilla (5 puntos · 3 necesidades) mientras la BD tiene 4 necesidades → `buildSystemInstruction` y el fallback local **anuncian datos de semilla**, omitiendo necesidades creadas por usuarios | **Alto** (el asistente de una app de emergencias da datos desactualizados aunque la BD esté viva) |
| `GET /api/needs/:id/support` ← `memoryNeeds` | ⚠️ con BD caída usa su propia semilla; con BD viva consulta la tabla ✅ | Bajo |
| `GET /api/support/mine` ← `memoryNeedSupporters` | ⚠️ lee BD primero ✅; el merge en memoria solo suma apoyos escritos **en ese mismo proceso** | Bajo (solo con BD caída) |
| `GET /api/*` con BD caída → semilla | Cada función sirve su propia semilla → respuestas inconsistentes entre rutas | Bajo (solo con BD caída) |
| `comments` ← `points` | No hay cruce real (filtra `memory.comments` por `pointId`) ✅ | Nulo |
| Rate limit | **60/min por ruta por IP** (×4 rutas de escritura = 240/min efectivos) y 15/min de chat **por función**; los cold starts reinician contadores | Medio |
| Throttle de esquema (`lastVerifyAt`/`applyAttempts`) | **N por función**: N sondas y N cortocircuitos `autoApplySchema` | Medio (crítico si `SUPABASE_ACCESS_TOKEN` está en el panel → item O2) |

### Recomendación (para agente-backend)

1. **Chat**: cargar los puntos/necesidades desde Supabase cuando su `memory`
   esté vacía o tenga más de T (p. ej. `await ensureDataFromSupabase()` con
   TTL) **antes** de construir `buildSystemInstruction`. Es la única ruta que
   hoy **no** toca la BD nunca.
2. **Límite de tasa**: asumir y documentar el multiplicador (o moverlo a un
   almacén externo cuando haya plan); no tratarlo como si fuera único.
3. **`SUPABASE_ACCESS_TOKEN` fuera de Vercel** (O2 del checklist): con N
   procesos, el throttle por proceso dispara tormentas de DDL.

---

## 5. Cadena de imports y estilo

| Comprobación | Resultado |
| --- | --- |
| `grep -rEn "from 'vite'\|express.static\|import('vite')"` en `api/` + `server/` | ✅ **0 imports**: la única mención es el comentario de advertencia de `server/app.ts:13` |
| `any` / `as any` / `: any` en `api/` + `server/handlers/` | ✅ 0 (el único `any` de `server/` es `AbortSignal.any([...])`, una API de JS) |
| `@ts-ignore` / `@ts-nocheck` | ✅ 0 |
| `console.*` en `api/` + `server/handlers/` | ✅ 0 (solo `server/logger.ts:26-30`, el logger permitido por `AGENTS.md`) |

---

## 6. `vercel.json` (prueba 6)

- Descargué `https://openapi.vercel.sh/vercel.json` (449 kB, draft-04) y lo
  validé con un validador propio (`/tmp/opencode/verif-t10/t12-schema.mjs`)
  que **autoverifiqué**: inyectando 3 errores artificiales los detecta los 3.
- **VALIDO, sin errores**: las 7 claves usadas (`$schema`, `framework`,
  `installCommand`, `buildCommand`, `outputDirectory`, `rewrites`, `headers`)
  están todas permitidas (`additionalProperties: false`).
- **4 rewrites en orden correcto**: `supabase/sql` → `support/mine` →
  `needs/:id/support` → `:path*` (el catch-all, el último) ✅.
- **Funciones: 10 ≤ 12** del plan Hobby → **2 de margen** (`index`, `points`,
  `needs`, `needs-support`, `support-mine`, `comments`, `chat`, `health`,
  `config`, `sql`).

---

## 7. R5 y R6 (gaps confirmados, **no** los he creado)

| Item | Evidencia | Estado |
| --- | --- | --- |
| **R5 · gate antes de desplegar** | `vercel.json` → `"buildCommand": "vite build"` (sin `lint` ni `test:ui`); **no existe `.github/`** ni ningún workflow; `package.json` no tiene hook prebuild | ❌ **gap**: el deploy de Vercel puede subir con `tsc` roto |
| **R6 · humo post-deploy versionado** | `scripts/` solo tiene `apply-schema.ts`, `seed-db.ts`, `test-authmodal.mjs`, `upload-cloudinary.ts`, `verify-rls.sh`; `grep -rl "vercel\|/api/health" scripts/` → **nada**. El harness de T10 vive en `/tmp/opencode/t10-*.mjs` (fuera del repo) | ❌ **gap**: no hay forma reproducible de verificar el despliegue real |

---

## Deltas Express ↔ funciones (resumen para agente-backend)

**Deterministas (aparecerán en cualquier despliegue):**

1. **JSON malformado**: probable **500/colgado** en Vercel en vez de **400**
   → envolver `readJsonBody` en `try/catch` (P1, §3b).
2. **Sin `content-type: json`**: mismo 400, `details` distinto (P2, §3b).
3. **Espejos** `/api/support-mine` (404→401) y `/api/needs-support?id=`
   (404→401): ya documentados, no usados por el cliente.

**Condicionales al routing real (verificar con el humo de R6):**

4. `GET /api` exacto sin expansión de `_orig=:path*` → mensaje `GET /index`.
5. `POST /api/needs/:id/support` sin expansión de `:id` ni auto-id → **404**.

**Funcionales (no de paridad):**

6. **Chat con caché semilla** en su propio proceso → datos desactualizados
   (§4, el más importante en impacto real).
7. Rate limit y throttles **por función**, no globales (§4).

---

## Decisiones tomadas (y por qué)

1. **Harness propio, un proceso por función**: el de T10 carga **todas** las
   funciones en un **mismo** proceso Node, así que su matriz **no puede**
   detectar el aislamiento de estado del R4 (compartirían `memory` y
   limitadores). Mi `fn-server.mjs` levanta un proceso por fichero y expone
   `/__state`+`/__mutate` para observarlo.
2. **Router lector de `vercel.json`** (no una copia hardcodeada): así la
   prueba valida también el orden y el contenido reales de los rewrites.
3. **IPs ficticias distintas por caso** (`X-Forwarded-For`): aíslan los
   limitadores entre casos y me permiten probar 61 escrituras sin envenenar
   el resto de la batería.
4. **No he tocado el tablero** `tareas-semana-1.md`: no hay fila T12 y el
   T0 ya está cerrado.
5. **No he ejecutado `verify:rls`** (no toqué `supabase/schema.sql`) ni
   `git add`/`git commit` (prohibidos).
6. **Harnesses en `/tmp/opencode/verif-t10/`**, no en `scripts/`: crear un
   script de humo es tarea de BACK (R6) y está fuera de mi alcance.

## Riesgos y deuda que dejo

- **Nada aquí está probado contra un despliegue real de Vercel**: no hay
  cuenta ni `vercel link` en este entorno. Los puntos 4 y 5 del resumen de
  deltas **solo** se pueden cerrar con el humo post-deploy (R6).
- **`X-Forwarded-For` no valida la IP**: `clientIp()` (`server/http.ts:187`)
  se queda con la **primera** IP de la cabecera → cualquier cliente puede
  eludir el límite de tasa mandando cabeceras falsas. Es **preexistente**
  (no lo introduce T10) y afecta igual a Express y a las funciones.
- **`test:ui` (M8)**: los chequeos estáticos siguen midiendo lo que dicen
  (`compression()` + guarda `process.env.VERCEL` en `server/app.ts`,
  `status(404)`+`404.html` en `server.ts`, `immutable: true` en `server.ts`)
  y T10 no los desalineó ✅.
- **Validación visual pendiente**: sin navegador conectado, la revisión de la
  UI queda para un `npm run dev` manual.
- El texto del chat no es determinista (Gemini): en diffs hay que
  normalizarlo (ya está normalizado en mis matrices).

## Para el siguiente agente

- **agente-backend**: los 7 deltas de arriba, en este orden → (1) `try/catch`
  en `readJsonBody`, (2) chat que consulta Supabase, (3) expansión/robustez
  de `_orig` (p. ej. que `resolveNeedId` no dependa de que el rewrite
  expansione), (4) `details` sin content-type, (5) rate limit por función.
- **agente-verificacion (siguiente)**: tras el primer deploy, ejecuta el R6
  con estos mismos casos; la matriz está reproducible con
  `node /tmp/opencode/verif-t10/t12-matrix.mjs` (Express :3130 + router :3150)
  y el R4 con `node /tmp/opencode/verif-t10/t12-r4.mjs`.
- **la persona**: R1 (variables en Production **y** Preview) y R5/R6 siguen
  abiertos: sin ellos, el primer aviso de un fallo lo dará un usuario.
