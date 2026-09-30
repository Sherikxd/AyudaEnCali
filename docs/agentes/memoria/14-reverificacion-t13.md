# Log — verificación (2026-09-30) · T14 · Re-verificación acotada de los deltas de T13

## En qué trabajé

- **T14 · agente-verificacion**: re-verificación **independiente** de los
  deltas remediados en la **T13** (`docs/agentes/memoria/08-remediacion-p1.md`),
  centrada en los hallazgos P1-1/P1-2/P1-3/P2, los KO-1…KO-4, R5 y R6 de mi
  batería T12 (`memoria/07-verificacion-t10.md`), más una pasada de
  regresión ligera. **No** he repetido las 147 comprobaciones de T12.
- **Solo lectura** de código: `server/**`, `api/**`, `scripts/**`,
  `vercel.json`, `.github/**`, `README.md`, memoria de agentes. **Único
  fichero escrito**: este log (+ una línea al final de `tareas-semana-1.md`
  T14, tal y como autoriza la misión). Sin `git add` / `git commit`.
- **No** he usado los resultados de T13 como verdad: todo lo que sale de
  «✅» abajo lo he reproducido yo, con harnesses propios en
  `/tmp/opencode/verif-t14/harness.mjs` (router y aserciones escritos desde
  cero para esta misión, sin reutilizar `scripts/smoke-vercel.mjs`).

## Cambios realizados

- `docs/agentes/memoria/14-reverificacion-t13.md` → este log (único fichero).
- `docs/agentes/tareas-semana-1.md` → **solo** la línea final
  `T14 · Re-verificación T13 — agente-verificacion — ✅`.
- **Nada de código**: no toqué `server/`, `api/`, `src/`, `scripts/`,
  `vercel.json`, `package.json` ni `.github/`.
- Harness fuera del repo: `/tmp/opencode/verif-t14/harness.mjs` (+ logs en
  `/tmp/opencode/verif-t14-express.log`).

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | ✅ exit 0 |
| `npx vite build` | ✅ `✓ built in 390ms` |
| `npm run test:ui` | ✅ **40/40** «TODO OK» (contado con `grep -c '^OK'` = 40) |
| `npm run verify:rls` | n/a (no toqué `supabase/schema.sql`) |
| Harness propio: Express **3150** ↔ funciones `api/*.ts` | ✅ **31/31** |
| `npm run smoke:vercel` (R6, versión del repo) | ✅ **35 comprobaciones · 0 fallos** · exit 0 |
| `SMOKE_BASE_URL=http://127.0.0.1:9 npm run smoke:vercel` (ruta de fallo) | ✅ **26 fallos · exit 1** (prueba de que falla con ≠0) |
| YAML de `.github/workflows/ci.yml` (parser de Python) | ✅ `YAML OK`, 10 steps |
| `git diff --cached` / `git log -1` | ✅ 0 staged · HEAD intacto (`92d6672`) |
| PID **607589** (3124) | ✅ vivo, `GET /api/health` → 200 al final |

---

## 1. Matriz de comprobaciones (T14)

| # | Grupo | Total | OK | KO |
| --- | --- | ---: | ---: | ---: |
| 1 | Regresión ligera (lint · build · test:ui) | 3 | 3 | 0 |
| 2 | P1-1 · JSON malformado + `details` + getter que lanza | 9 | 9 | 0 |
| 3 | P1-2 · `needs-support` id en path (3 modos + extras) | 8 | 8 | 0 |
| 4 | P1-3 · chat y contexto Supabase | 3 | 3 | 0 |
| 5 | KO-1/KO-2/KO-3 + espejo `sql` | 7 | 7 | 0 |
| 6 | Regresión de rutas (paridad Express ↔ funciones) | 5 | 5 | 0 |
| 7 | R5 · CI | 6 | 6 | 0 |
| 8 | R6 · smoke versionado (35 checks del repo + 3 propios) | 39 | 39 | 0 |
| 9 | Documentación (README rate limit · SMOKE_BASE_URL · decisiones) | 5 | 5 | 0 |
| 10 | Líneas rojas del repo y proceso | 4 | 4 | 0 |
| | **Total** | **89** | **89** | **0** |

**89/89 · 0 bloqueantes locales.**

---

## 2. Hallazgo → estado

| Hallazgo | Estado | Evidencia (reproducida por mí) |
| --- | --- | --- |
| **P1-1** · JSON malformado → 400 (no 500/colgado) | **CERRADO (local)** · *PENDIENTE-DEPLOY* para el getter real del runtime | `server/http.ts:188-198` envuelve `req.body` en `try/catch` (`SyntaxError` → 400 con mensaje exacto; no-`SyntaxError` → 500 genérico). `server/vercel.ts:102-104` → `readJsonBody` está **dentro** del `try/catch` de `createApiRoute` y, si `!body.ok`, hace `return` sin tocar el core. Medido: Express **y** función con `{bad json` + `content-type: application/json` → **400** `{"error":"JSON inválido en el cuerpo de la petición."}` (byte a byte); getter lanzando `SyntaxError` → 400; getter lanzando `Error('boom…')` → **500** `{"error":"Error interno del servidor."}` **sin** «boom», sin «stack» ni « at » en el cuerpo (el detalle solo va al log) |
| **P1-2** · id de `/api/needs/:id/support` | **CERRADO (local)** · *PENDIENTE-DEPLOY* (expansión real de `:id` por el router de Vercel) | `vercel.json:10-13` → `destination: /api/needs-support?_orig=needs/:id/support&id=:id` (**`&id=:id` explícito**); orden: `supabase/sql` → `support/mine` → `needs/:id/support` → `:path*` catch-all **último**; 10 funciones ≤ 12. `resolveNeedId()` (`needsSupport.ts:32-38`): **path primero** (regex `/^\/needs\/([^/]+)\/support\/?$/`), `query.id` **solo si `input.rewritten`**. 3 modos medidos: Express `/api/needs/abc123/support` → **401**; función `?_orig=needs/abc123/support&id=abc123` → **401**; función con `_orig` **literal sin expandir** (`needs/:id/support`) + `id=abc123` → **401**; solo `_orig` sin `?id=` → **401** (path primero); espejo `POST /api/needs-support?id=abc123` → **404** idéntico en ambos |
| **P1-3** · chat con caché semilla | **CERRADO (local)** · *PENDIENTE-DEPLOY* (frío real con BD viva) | `server/context.ts`: `CONTEXT_TTL_MS = 30_000` ✅, **solo lectura** (importa `getSupabaseClient/mapNeedRow/mapPointRow/withSupabaseRetry`; `grep maybeVerifySchema` → 0 usos en `context.ts` ni en `chat.ts`) ✅, `warmContext()` en el arranque de `api/chat.ts:14` ✅. `handlers/chat.ts:201` `await ensureContextFresh()` **antes** de `buildSystemInstruction` (línea 203) ✅. En local: `POST /api/chat` válido sin sesión → **200** con `reply` (Express y función); `POST /api/chat {}` → **400** `details:["El mensaje es obligatorio."]`; sin `content-type` → **400** con `details` **idénticos** byte a byte en ambos (P2 cerrado) |
| **KO-1** · espejo `/api/support-mine` | **CERRADO** | Express **404** `{"error":"Ruta no encontrada: GET /support-mine"}` = función **404** mismo cuerpo (`supportMine.ts:20` exige `/^\/support\/mine\/?$/`) |
| **KO-2** · espejo `POST /api/needs-support?id=` | **CERRADO** | Express **404** = función **404** `{"error":"Ruta no encontrada: POST /needs-support"}` (`query.id` solo cuenta con `rewritten`) |
| **KO-3** · `GET /api` exacto | **CERRADO** | Ambos **404** `{"error":"Ruta no encontrada: GET /"}` (`_orig=''` → `/` en `originalPath()`) |
| **KO-4** · «las 3 condiciones a la vez» | **CERRADO por construcción** · *PENDIENTE-DEPLOY* | El caso deja de existir: el id viaja **explícito** en el query del rewrite, así que aunque el runtime no autoinyecte parámetros el `?id=` está escrito a mano. Solo un deploy puede confirmar la interpolación real del router |
| **P2** · `details` sin `content-type` | **CERRADO** | `readJsonBody` devuelve `{}` (no `undefined`) sin cabecera JSON (`http.ts:170`): chat sin `content-type` → `400 {"details":["El mensaje es obligatorio."]}` **idéntico** Express ↔ función |
| **R5** · CI | **CERRADO** | YAML parsea (parser de Python): `on: push [main] + pull_request [main] + workflow_dispatch` ✅; 10 steps; Node **22** (≥20) ✅; secuencia `npm ci \|\| npm install` → `lint` → `vite build` → `test:ui` → `smoke:vercel` ✅; `verify:rls` en 2 steps con `if: steps.rls.outputs.cambio == 'true'` (detecta `supabase/schema.sql` con `git diff` o `workflow_dispatch`) + `continue-on-error: true` ✅. **Único workflow del repo** (glob oculto `**/*.{yml,yaml}` → solo `.github/workflows/ci.yml`): sin duplicados rotos |
| **R6** · smoke versionado | **CERRADO (local)** · *PENDIENTE-DEPLOY* (falta la corrida con `SMOKE_BASE_URL` real) | Ejecutado por mí: **35/35 · 0 fallos · exit 0**. Hermético: **0** referencias a `/tmp`, sin `child_process`, servidor propio en puerto **0**, lee `vercel.json` **real** del repo (`smoke-vercel.mjs:71`), fuerza `VERCEL=1` (no lee `.env`) salvo `SMOKE_WITH_ENV=1`. Falla con **exit 1**: sin sabotear código (misión: no editar `scripts/`), lo he probado por la ruta de entrada `SMOKE_BASE_URL=http://127.0.0.1:9` → 26 fallos → `exit 1`; el código también hace `process.exit(fallos+errores===0?0:1)` (línea 486) y `exit(1)` si un `api/*.ts` no exporta handler (línea 60). `SMOKE_BASE_URL` documentado en `README.md:439-440` (y el gate del CI en `README.md:446-448`) |
| **Rate limits documentados** | **CERRADO** | `README.md:493-496`: tabla con Express **1 cuenta** de 60/min (4 rutas) vs Vercel **4 cuentas** → 240/min, y `chatLimiter` **15/min** idéntico en ambos ✅. `decisiones.md` → **3 entradas nuevas T13** (líneas 96, 108, 119): id explícito en el rewrite · espejos bloqueados · rate limit por función ✅ |

### Qué sigue siendo **solo verificable en un deploy real**

1. **Expansión real de `:id`** (y de `:path*`) por el router de Vercel en
   `destination` → solo `SMOKE_BASE_URL=https://<app>.vercel.app npm run
   smoke:vercel` (ojo: mi router y el de `smoke-vercel.mjs` son
   emuladores; si Vercel cambia la semántica, ambos seguirían en verde).
2. **Getter `request.body` real** de `@vercel/node` ante JSON malformado
   (las docs dicen que lanza; yo lo simulo con un getter que lanza).
3. **`warmContext()` en frío con BD viva**: que la primera pregunta del
   chat anuncie los puntos/necesidades reales (y que el TTL de 30 s haga
   su efecto con tráfico).
4. **El propio humo R6 contra el deploy** (`smoke:vercel` con
   `SMOKE_BASE_URL`) y **R1** (variables en Production *y* Preview) — de la
   persona.

---

## Decisiones tomadas (y por qué)

1. **Harness propio en vez de re-ejecutar solo `smoke:vercel`**: el humo
   de R6 lo ha escrito agente-backend; para re-verificar P1-1/P1-2/KO tengo
   que medir con aserciones independientes (el humo del repo se ejecutó
   **además**, como corroboración: 35/35).
2. **No he saboteado ninguna aserción del script** (la misión lo
   permitía «o leyendo el código»): editar `scripts/**` está fuera de mis
   reglas, así que probé la ruta de fallo por `SMOKE_BASE_URL` inválido,
   que es entrada pública del script y demuestra el `exit 1` sin tocar nada.
3. **Express en 3150, PID propio terminado con `SIGTERM`** (+ su hijo
   `tsx`): el 3124/PID 607589 **no se tocó** y sigue respondiendo 200.
4. **No he tocado `verify:rls`** (sin cambios en `schema.sql`) ni
   `git add`/`git commit` (prohibidos); `git diff --cached` → vacío.

## Riesgos y deuda que dejo

- **Todos los P1/KO quedan «CERRADO en local»**: la semántica del runtime
  y del router reales siguen pendientes de `SMOKE_BASE_URL` (ver arriba).
- **Validación visual pendiente**: sin navegador, la revisión de la UI
  queda para un `npm run dev` manual (misma deuda que en T12).
- **Emulador compartido**: tanto mi router como el de `smoke-vercel.mjs`
  reproducen `@vercel/routing-utils` por lectura de código, no ejecutándolo;
  coinciden entre sí, pero los dos podrían coincidir en un error.
- **`console.*` en `scripts/`**: `smoke-vercel.mjs` usa `console.log/error`
  (7 usos), igual que los CLI preexistentes (`test-authmodal.mjs`,
  `seed-db.ts`, `upload-cloudinary.ts`). En `server/`, `api/` y `src/` el
  recuento fuera de los dos loggers permitidos es **0** ✅. Lo dejo como
  **observación, no bloqueante** (convención CLI ya existente), pero si la
  persona quiere la regla literal de `AGENTS.md` también en `scripts/`,
  hay que decidirlo como tarea.
- El `X-Forwarded-For` no valida la IP (preexistente de antes de T10)
  sigue ahí: cualquiera puede eludir el límite de tasa con cabeceras
  falsas. No es de T13.
- **O2 sin tocar** (`SUPABASE_ACCESS_TOKEN` en Vercel + N procesos → N
  sondas de DDL): sigue pendiente y es de la persona.

## Para el siguiente agente

- **Estado**: T14 cierra **89/89 con 0 bloqueantes locales**; los deltas de
  T13 están remediados y verificados de forma independiente. Lo único que
  falta para cerrar del todo es **desplegar** y correr
  `SMOKE_BASE_URL=https://<app>.vercel.app npm run smoke:vercel` (R6) —
  con eso se confirman P1-1, P1-2, KO-3 y el KO-4 «por construcción».
- **Recomendación a la persona**: **sí, listo para subir a GitHub e
  importar en Vercel**, con el checklist **R1-R3 en mano** (R1: variables en
  Production **y** Preview; R2: `npm run db:setup` + `db:seed`; R3:
  `SMOKE_BASE_URL=… npm run smoke:vercel` post-deploy) y la revisión
  visual (`npm run dev`) antes de dar el enlace por bueno.
- Si alguien toca `server/http.ts` / `server/vercel.ts`, el contrato
  sigue siendo: `rewritten === true` ⇒ vino de rewrite (vale `query.id`);
  `false` ⇒ espejo de filesystem ⇒ **404**. Y `readJsonBody` debe
  permanecer **dentro** del `try/catch` de `createApiRoute`.
