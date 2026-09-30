# Log — despliegue en Vercel (2026-09-29)

## En qué trabajé

- **T9** · Adaptar el proyecto para desplegarlo en **Vercel (plan Hobby,
  gratis)** manteniendo intactos local, Docker y Cloud Run (Cloud Run se
  encareció: esa es la alternativa descartada).
- Ficheros tocados solo del área de backend (`server.ts`, `server/**`,
  `scripts/**`) más los nuevos `api/`, `vercel.json` y documentación
  (`README.md`, `.env.example`, `.gitignore`, `docs/agentes/**`).

## Cambios realizados

### `server/app.ts` (nuevo, 843 líneas)

- Es **todo** lo que antes estaba en `server.ts` antes del bloque
  `startServer`: clientes (`initGemini`/`initSupabase`), cachés en memoria,
  `respondWriteFailure`, creación de `app`, `securityHeaders`, `express.json`,
  los dos limitadores, **todas las rutas** de la API y
  `app.use('/api', apiNotFound)`.
- `server/app.ts:1-14` → cabecera que explica el reparto y prohíbe importar
  `vite`/`express.static` aquí (Vercel empaqueta este módulo).
- `server/app.ts:65` → `if (!process.env.VERCEL) dotenv.config();` (en Vercel
  las variables vienen del panel; local/Docker siguen con `.env`).
- `server/app.ts:207` → `if (!process.env.VERCEL) app.use(compression());`
  antes de las rutas (si no, no comprime): en Vercel se omite porque el borde
  ya comprime y así se ahorra CPU de las 4 CPU-h del plan.
- `server/app.ts:838-843` → `app.use(errorHandler)` al **final** de la cadena
  (lo exige la guía de Vercel) + `export { app }` y `export default app`.
- Rutas relativas reescritas (`./server/middleware` → `./middleware`,
  `./src/types` → `../src/types`). **Ni una respuesta, ruta o cabecera
  cambiada**: el cuerpo de las rutas es byte a byte el anterior.
- `trust proxy` sin cambios (`server/app.ts:199`): Vercel declara
  `NODE_ENV=production`, así que se activa solo; sin él, el limitador de tasa
  vería una sola IP tras el proxy.

### `server.ts` (reescrito, 118 líneas)

- Se queda solo con lo que exige un proceso con `listen`: `createViteServer`
  (**el único import de `vite` del repo server-side**), `path`/`fileURLToPath`,
  `isProduction`, `PORT`, `sleep` local, `maybeVerifySchema(true)` al arrancar,
  el 404 de desarrollo, `vite.middlewares`, `express.static` con sus cabeceras
  de caché (`immutable` en `/assets`), `app.get('*')` → `404.html`,
  `app.use(errorHandler)` final, `app.listen` y el shutdown ordenado.
- Importa `app` desde `./server/app` (dotenv se ejecuta al evaluar ese módulo,
  antes de leer `PORT`/`NODE_ENV`, igual que antes).
- Doble `errorHandler`: el de `server/app.ts` cubre la API (y es el que usa
  Vercel); el de `server.ts` se registra tras los estáticos y la 404, que se
  montan después. Un middleware de errores solo salta cuando hay error, así
  que no cambia ninguna respuesta.

### `api/index.ts` (nuevo)

- `import app from '../server/app'; export default app;` con comentario del
  patrón oficial de Vercel. `tsc` no se queja: basta con el export (no hace
  falta ningún cast ni `any`).

### `vercel.json` (nuevo, JSON **estricto**)

- `framework: "vite"` (sin él la detección podría confundirse con Express por
  el `server.ts` de la raíz y no construir el frontend), `buildCommand:
  "vite build"`, `outputDirectory: "dist"`,
  `rewrites: [{ "source": "/api/:path*", "destination": "/api" }]` (la
  función recibe la ruta original, así que `/api/supabase/sql`, de dos
  niveles, llega entera) y dos `headers` con la misma caché que hoy da
  `express.static` (1 año `immutable` para `/assets`, 1 semana para
  imágenes/favicon/fuentes).
- **Sin comentarios**: verificado que `vercel.json` es RFC 8259 estricto (la
  documentación oficial y el foro de Vercel lo confirman: un `//` rompe el
  build con «Invalid vercel.json file provided»). La anotación vive en
  `README.md`.
- **Sin rewrite de SPA**: `404.html` de `dist/` se sirve con estado 404 (KB
  oficial «Custom 404 Page»: *«Emit a 404.html file to your Output Directory
  and it will be served as the 404 page when a route does not match any other
  static file»*; la discusión #4892 del repo confirma que el estado es 404).
  `npx vite build` copia `public/404.html` → `dist/404.html` (comprobado).
- **`installCommand: "npm install"` (añadido al diseño)**: `bun.lock` está
  congelado y **desincronizado** — le faltan `@clerk/backend`, `compression`,
  `@types/compression` y `jsdom`. Como Vercel elegiría Bun por detectar
  `bun.lock`, un `--frozen-lockfile` rompería el build y sin `compression` la
  función no arrancaría (`server/app.ts` lo importa). Fijar npm resuelve el
  riesgo sin tocar `package.json`.
- Validado contra el schema oficial descargado (`openapi.vercel.sh/vercel.json`,
  `additionalProperties: false`): claves de primer nivel, enum de `framework`,
  `maxLength` de los comandos y la forma de `rewrites`/`headers` → **VALIDO**.

### Otros

- `scripts/test-authmodal.mjs:307-312` → la comprobación de gzip leía
  `server.ts` y exigía `app.use(compression())`; como la compresión se mudó a
  `server/app.ts` (donde debe ir, antes de las rutas), el chequeo apunta a ese
  fichero y además exige la guarda `process.env.VERCEL`. El número de
  comprobaciones sigue en **40**.
- `.gitignore` → `.vercel/` (credenciales de `vercel link`).
- `README.md:382` → sección «Despliegue en Vercel (plan Hobby, gratis)» con
  pasos GitHub → Vercel → variables, tabla build/runtime, humo post-deploy y
  avisos (Hobby no comercial, estáticos por CDN, 404, omisión de
  `compression()`, rate limit/cachés por instancia). Árbol de la arquitectura
  y Stack actualizados con `server/app.ts`, `api/index.ts` y `vercel.json`.
- `.env.example:8-10` → `PORT` no hace falta en Vercel (la `CLERK_SECRET_KEY`
  ya anticipaba Vercel, no hacía falta tocarla).
- `docs/agentes/decisiones.md` → entrada «2026-09-29 · Destino de despliegue:
  Vercel Hobby (gratis)» con Cloud Run como alternativa descartada.
- `docs/agentes/tareas-semana-1.md` → **T9 ✅**.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ 0 errores (cubre `server/app.ts` y `api/index.ts`: el tsconfig no tiene `include`) |
| `npx vite build` | ✅ «✓ built in 479ms» y `dist/404.html` presente |
| `npm run test:ui` | ✅ **TODO OK**, 40/40 |
| `npm run verify:rls` | n/a (no se tocó `supabase/schema.sql`) |

**Humo local (modo Cloud Run, `NODE_ENV=production PORT=3125`, proceso mío):**

| Petición | Resultado |
| --- | --- |
| `GET /api/health` | **200** `{"status":"ok",…}` |
| `GET /api/config` | **200** con `clerkPublishableKey` y las 4 tablas |
| `GET /ruta-que-no-existe` | **404** + `text/html` con `404.html` («AyudaEnCali», `noindex`) |
| `GET /` | **200**, `og:image` → `https://res.cloudinary.com/z2t43npi/…` |
| `GET /assets/vendor-react-*.js` | **200** + `content-encoding: gzip` + `cache-control: public, max-age=31536000, immutable` |
| `POST /api/points` (sin sesión) | **401** |
| `GET /api/supabase/sql` | **200** |
| `GET /api/xyz-inexistente` | **404** JSON |

**Humo de desarrollo** (`PORT=3127`): `/` 200 · `/ruta-inexistente` 404 con la
página · `/api/health` 200 · `POST /api/points` 401 · `/src/main.tsx` 200
(Vite en middleware intacto).

**Humo de la función de Vercel** (`VERCEL=1 NODE_ENV=production
node --env-file-if-exists=.env --import tsx /tmp/opencode/smoke-vercel.mjs`,
puerto 3126, sirviendo `mod.default` con `http.createServer`):

| Comprobación | Resultado |
| --- | --- |
| default export de `api/index.ts` | es **función** (nombre `app`) |
| `GET /api/health` · `/api/config` · `/api/points` · `/api/needs` · `/api/comments` | **200** ×5 |
| `GET /api/supabase/sql` (ruta de 2 niveles, la que obliga al rewrite) | **200** |
| `POST /api/points` · `/api/comments` sin sesión | **401** ×2 |
| `GET /api/xyz-inexistente` | **404** JSON de `apiNotFound` |
| `grep -rn "from 'vite'\|express.static" server/ api/` | **sin resultados** (solo menciones en comentarios) → la cadena de imports de la función no arrastra `vite` |

Resultado: **9/9 «TODO OK»**, con `VERCEL=1` (lo que ejercita la guarda de
`dotenv`: las variables llegaron de `--env-file` y la app las vio).

## Decisiones tomadas (y por qué)

1. **`installCommand: "npm install"`** → ver arriba: `bun.lock` desincronizado
   (falta `@clerk/backend` y `compression`). Sin tocar `package.json` ni
   regenerar lockfiles (bun no está instalado y está fuera de mis ficheros).
2. **`vercel.json` sin comentarios** → el parser de Vercel exige JSON estricto;
   la documentación de las claves vive en el README.
3. **El chequeo de gzip del test apunta a `server/app.ts`** → la compresión
   debe registrarse antes de las rutas y solo existe en la app compartida;
   mover el middleware a `server.ts` habría sido imposible (las rutas ya
   estarían montadas).
4. **Doble `errorHandler`** → el de `server/app.ts` es el que exige la guía de
   Vercel (fin de cadena) y el de `server.ts` cubre estáticos + 404; no pisan
   respuestas porque un error handler no se ejecuta en el flujo normal.
5. **No añadí `functions`/`maxDuration`** (el default del plan cubre el chat),
   **ni rewrite de SPA** (queremos la 404 real), **ni `public/` como salida**
   (`dist/` es la salida; `public/` ya se copia dentro).
6. **`trust proxy` sin tocar**: `isProduction` se activa con `NODE_ENV`, que
   la propia plataforma declara en `production`.

## Riesgos y deuda que dejo

- **No puedo ejecutar un deploy real de Vercel desde aquí** (sin cuenta ni
  `vercel link`). Lo único no verificable localmente es **qué `req.url` ve la
  función tras el rewrite**: el diseño (y el patrón de las plantillas
  oficiales de Express/Angular SSR) dice que la original (`/api/points`). Si
  Vercel pasara `/api`, **todas** las rutas de API responderían 404 JSON y se
  vería al instante en el humo post-deploy; la solución sería cambiar el
  destino del rewrite, no el código.
- **`bun.lock` congelado y desactualizado** (falta 4 dependencias): lo esquivé
  con `installCommand`, pero conviene regenerarlo cuando haya bun instalado
  (tarea de quien gestione dependencias; `package.json` no lo toqué).
- **`engines.node: ">=20.0.0"`** → Vercel lo resuelve con un aviso al
  «latest» soportado (según los tests de `build-utils`, `>=20` → 22.x). Si
  algún día diera error, se arregla en *Project Settings → Node.js Version*.
- **Rate limit y cachés por instancia**: con Fluid, las peticiones calientes
  comparten instancia (misma IP, misma caché), pero un cold start reinicia
  contadores y vacía `memoryPoints/Needs/Comments`; los datos reales no se
  pierden (fuente de verdad Supabase). Si el tráfico crece, toca pasar el
  limitador a algo externo o subir de plan.
- **`trust proxy` depende de `NODE_ENV=production`**: si Vercel no lo declarara
  en runtime, todas las peticiones compartirían IP y el límite de 60
  escrituras/min sería global (aunque las respuestas no cambiarían).
- **`compression()` no corre en Vercel**: las respuestas JSON dependen de la
  compresión del borde (Vercel comprime por `Accept-Encoding`); si algún día
  se desactivara, solo afectaría al peso, no a la función.
- **Límites del plan Hobby**: 100 GB de tráfico, 1 M peticiones de borde,
  1 M invocaciones, 4 CPU-h, 300 s por función y ~100 builds/día, y **uso no
  comercial**: si el proyecto monetiza, hay que pasar a Pro.
- `scripts/test-authmodal.mjs` (área mía por `AGENTS.md`, pero es un fichero
  de test): cambié **una** línea de comprobación; si el agente de verificación
  vuelve a auditar, que sepa por qué la compresión ya no está en `server.ts`.

## Para el siguiente agente

- **Orden de humo tras cualquier cambio de servidor**: `npm run lint` ·
  `npx vite build` · `npm run test:ui` (40) · `NODE_ENV=production PORT=3125
  node --import tsx server.ts` y los `curl` de siempre. El proceso huérfano
  del **puerto 3124 (PID 607589)** sigue vivo y **es de otra sesión**: no lo
  uses ni lo mates.
- Para simular la función de Vercel en local:
  `VERCEL=1 NODE_ENV=production node --env-file-if-exists=.env --import tsx
  <script>` sirviendo el default de `api/index.ts` con `http.createServer`
  (el script que usé está en `/tmp/opencode/smoke-vercel.mjs`).
- Si añades una ruta de API, ponla en **`server/app.ts`** y no en `server.ts`:
  en Vercel solo se ejecuta la app compartida.
- Si necesitas un `app.get` de página o estáticos, va en `server.ts` (Vercel
  los sirve el CDN desde `dist/`).
- Nunca importes `vite` desde `server/**` ni `api/**`; el build de Vercel
  arrastraría el bundler completo.
