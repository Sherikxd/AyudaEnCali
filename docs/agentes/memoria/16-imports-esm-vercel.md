# Log — imports ESM: fix del primer deploy roto (2026-09-30)

## En qué trabajé
- Sin ID de tablero: el **primer deploy de Vercel** (commit `a466c33`, status
  `Ready`) devolvía `FUNCTION_INVOCATION_FAILED` (500) en **todas** las
  funciones (`/api/health`, `/api/config`, `/api/points`…), y la app en
  producción enseñaba «Sin conexión con el servidor».

## Diagnóstico (reproducido, no adivinado)
1. `curl https://ayuda-en-cali.vercel.app/api/*` → **500
   `FUNCTION_INVOCATION_FAILED`** en todas; `/` (estático) → 200. Como el
   handler tiene `try/catch` que respondería JSON `{"error":…}`, el fallo es
   **anterior al handler**: al cargar el módulo.
2. Compilado local a CJS con esbuild → `fileURLToPath(import.meta.url)` de
   `server/schema.ts` revienta; a ESM → funciona. Sospecha: formato del
   bundle.
3. **Reproducido el build real**: instalado `@vercel/node` (el builder oficial)
   *fuera* del repo (`/tmp/opencode/vercel-node-check`, intacto `package.json`
   y `bun.lock`) y ejecutado su `build()` contra el repo con
   `meta:{skipDownload:true}` y `projectSettings:{installCommand:'',buildCommand:'true'}`
   (para no disparar installs ni builds). Extraídos los `output.files` del
   lambda (81 ficheros: `server/*.js` compilados con tsc, `package.json`
   con `"type":"module"`, `supabase/schema.sql` trazado, deps en
   `node_modules/`) e importado el handler…
4. **Error exacto de producción**:
   `ERR_MODULE_NOT_FOUND: Cannot find module '…/server/bootstrap' imported from …/api/health.js`.

**Causa raíz:** Node **ESM exige extensiones explícitas** en los imports
relativos; tsx/Vite/Express las resuelven solas, por eso en local nunca
falló. El build de Vercel emite `api/*.ts` → `api/*.js` ESM sin reescribir
los especificadores → cada función moría al cargar.

## Cambios realizados
- `api/**` y `server/**` (34 ficheros, 130 líneas): **`.js` explícito en
  todo import relativo con valor** (`'../server/vercel.js'`,
  `'./supabase.js'`, `'../src/config/images.js'`…).
- Los imports de **directorio** necesitan el índice: `'../src/types'` →
  `'../src/types/index.js'` (11 ficheros; un `.js` suelto no resuelve a
  `index.ts`).
- Los *type-only* (`import type …`) se dejaron también con `.js` por
  coherencia: tsc los resuelve igual y se borran al emitir.
- Sin cambios en `src/**` (Vite resuelve extensionless), `server.ts`,
  `vercel.json`, `scripts/**`.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ (tras el fix de `types/index.js`) |
| `npx vite build` | ✅ `✓ built in 1.23s` |
| `npm run test:ui` | ✅ 40/40 «TODO OK» |
| `npm run smoke:vercel` | ✅ 35/35 |
| Build real `@vercel/node` + invocación de **los 10 handlers** compilados | ✅ 10/10 |

Resultados de los lambdas compilados (el entorno no tiene env, se espera
caché en memoria):
- `health` → 200 · `config` → 200 · `points` → 200 (semilla) · `needs` → 200
  · `comments` → 200
- `sql?_orig=supabase/sql` → 200 con el **SQL real** (nft sí traza
  `supabase/schema.sql` ✅)
- `needs-support?_orig=needs/abc123/support&id=abc123` → **401** (paridad)
- `support-mine?_orig=support/mine` → 401 · `support-mine` **sin** `_orig`
  → **404** (espejo bloqueado, KO-1) · `index?_orig=xyz` → **404 JSON**
  «Ruta no encontrada: GET /xyz» (P1-1)
- `chat` POST → 400 de validación (no 500: el módulo carga; la semántica
  exacta la cierra el humo contra producción)
- `npm run verify:rls` n/a (sin cambios en `supabase/schema.sql`).

## Decisiones tomadas (y por qué)
- **`.js` explícito** (la solución documentada de Vercel para ESM) frente a
  compilar a CommonJS (choca con `import.meta` y con `"type":"module"` del
  lambda) o bundling experimental. Detalle en `decisiones.md`.
- El truco de reproducir el build real con `@vercel/node` + `skipDownload`
  quedó documentado aquí: sirve para validar cualquier cambio de `api/` o
  `server/` **sin gastar un deploy**.

## Riesgos y deuda que dejo
- **Regla permanente**: todo import relativo con valor en `api/` y `server/`
  lleva `.js` (o `/index.js` si el destino es un directorio). Un import
  «a secas» compila y pasa el lint, pero **rompe solo en producción** — el
  smoke local (tsx) no lo detecta; el gate es el build real de `@vercel/node`.
- `TS2688: Cannot find type definition file for 'vite/client'` aparece en el
  build real (el tsconfig temporal vive en `/tmp` y no resuelve `types` de
  Vite). Es **no fatal** (tsc emite igual; Vercel lo pinta como error en el
  Build Log). Si algún día se quiere silenciar: `types` condicional o quitar
  `vite/client` de `compilerOptions.types` y declarar `ImportMeta.env` a
  mano — pendiente de valorar, no bloquea.
- El chat devuelve 400 con mi payload de prueba: validar el shape exacto en
  el humo post-deploy (`SMOKE_BASE_URL`).

## Para el siguiente agente
- Commits pendientes de la persona: `vercel.json` (fix de rutas), este
  cambio de imports y la documentación. Tras el push, comprobar en Vercel
  que las funciones responden y lanzar
  `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel`.
- Repro del build real: `/tmp/opencode/lambda-test.cjs` (requiere
  `/tmp/opencode/vercel-node-check` con `@vercel/node` instalado).
