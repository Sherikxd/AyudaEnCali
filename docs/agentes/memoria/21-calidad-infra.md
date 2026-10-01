# Log — calidad/infra (2026-09-30 y 2026-10-01)

Área propia: `.github/**`, `vercel.json`, `package.json`, `Dockerfile`,
`.dockerignore`, `scripts/**` (solo lectura, compartido con backend) y este
fichero. **No** toqué `src/**`, `server/**`, `api/**`, `supabase/**`,
`server.ts`, `index.html`, `README.md` ni los documentos de tablero.

## En qué trabajé

- **T17 · CI como puerta de despliegue** (FAL-12 + FEAT-09).
- **T18 · Cabeceras de seguridad y CSP en estáticos** (FAL-13).
- **T20 · Higiene del paquete** (FAL-15), parcial: solo lo que es mío
  (`package.json`); `index.html` es de agente-frontend y sigue pendiente.

## Cambios realizados

### `vercel.json` (T17 + T18)

- **Puerta de despliegue**: `buildCommand` pasa de `vite build` a
  `npm run lint && VITE_CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-pk_test_…}" npm run test:ui && vite build`.
  Un push con `tsc` rojo o tests rojos **no llega a Production** (falla el
  build y Vercel se queda en la versión anterior).
  - No usé `ignoreCommand` (sí existe en el schema, pero su semántica de
    código de salida es contraintuitiva y no *falla* el build: solo lo
    salta). Con `&&` el fallo es explícito y auditable en el log del build.
  - El `VITE_CLERK_PUBLISHABLE_KEY=\"${…:-pk_test_…}\"` **solo** envuelve el
    `test:ui` (el script aborta si no hay clave; es la misma clave falsa que
    usa la CI de GitHub, con el fetch mockeado). `vite build` corre **sin**
    esa variable, así que una clave de mentira jamás se hornea en el bundle.
  - `buildCommand` mide 138 de los 256 caracteres que permite el schema.
- **Cabeceras en `/`** (el único HTML que sirve la app, al no haber router):
  `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy:
  strict-origin-when-cross-origin` y `Permissions-Policy
  camera=(), microphone=(), geolocation=(self), payment=(), usb=()`
  (el valor de `geolocation` es el mismo que ya usa el backend en
  `server/http.ts:75`).
- **`/assets/:path*` y el bloque de imágenes**: además de la caché, ahora
  llevan `nosniff` (+ `Referrer-Policy` en `/assets`).
- **Sin CSP en `/api/*`**: las funciones ya ponen sus cabeceras en
  `setSecurityHeaders` (aviso al backend más abajo).

CSP final (una línea, en `vercel.json:22`):

```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self';
form-action 'self' https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com;
script-src 'self' https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' data: https://fonts.gstatic.com;
img-src 'self' data: blob: https://res.cloudinary.com https://*.tile.openstreetmap.org
  https://server.arcgisonline.com https://img.clerk.com https://*.clerk.com
  https://*.clerk.accounts.dev https://*.clerk.dev;
connect-src 'self' https://nominatim.openstreetmap.org https://fonts.googleapis.com
  https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com https://clerk-telemetry.com;
frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com;
worker-src 'self' blob:; manifest-src 'self'; media-src 'self' blob: data:
```

### `.github/workflows/ci.yml` (T17)

- **`verify:rls` ya bloquea**: se quitó `continue-on-error: true`. El paso
  solo corre si cambió `supabase/schema.sql`, y en ese caso un RLS rojo para
  el pipeline.
- **Detección arreglada**: antes usaba `github.event.before`, que **no
  existe en eventos `pull_request`** → en un PR nunca se ejecutaba RLS.
  Ahora: push → sha anterior · PR → `pull_request.base.sha` · sin base
  comparable (primer push, `workflow_dispatch`, sha podado) → **se ejecuta**
  (ante la duda, validar es más seguro que saltárselo).
- **PostgreSQL en el runner**: si falta `initdb`, instala `postgresql` y
  añade `/usr/lib/postgresql/<v>/bin` al `PATH` (paso actual y siguientes);
  comprueba `initdb`, `pg_ctl` y `psql` antes de continuar.
- **Paso nuevo `test:server`** con `if: hashFiles('scripts/test-nucleos.mjs') != ''`
  → sale como *skipped* hasta que agente-backend entregue T6; después pasa a
  bloquear sin tocar más el workflow (y sin duplicar ningún step).
- Comentario de cabecera actualizado a los 6 pasos reales.
- `lint`, `vite build`, `test:ui` y `smoke:vercel` ya estaban: **no los
  dupliqué**.

### `package.json` (T20)

- Quitadas `motion`, `autoprefixer` y `esbuild` con
  `npm rm … --package-lock=false` (el flag evita crear `package-lock.json`,
  que **no** se puede añadir sin consenso).
- Añadido `test:server` (lo pide T6):
  `node --env-file-if-exists=.env scripts/test-nucleos.mjs`.
- `bun.lock` **no** está actualizado (es de la persona y está congelado).

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| Validación de `vercel.json` con `@vercel/routing-utils` (`getTransformedRoutes`, el validador real del build de Vercel) | ✅ `error: null`, 8 rutas generadas |
| Validación contra el schema oficial (`https://openapi.vercel.sh/vercel.json`, `additionalProperties: false`, ajv draft-04) | ✅ **VÁLIDO** · fuera de schema: ninguna clave · `buildCommand` 138/256 |
| YAML de `.github/workflows/ci.yml` | ✅ (`yaml.safe_load`) |
| `npm run lint` | ❌ **por cambios de OTROS agentes** (`server/handlers/comments.ts:78` TS2739: le faltan `userName`/`userRole` a `PointComment`; backend está en medio de T1-T3). Relanzado al final → ver «Re-verificación final» |
| `npx vite build` | ✅ (`built in 466ms`; esbuild sigue resolviendo tras quitar la dep directa) |
| `npm run test:ui` | ✅ **TODO OK** (40/40) |
| `npm run smoke:vercel` | ✅ **35/35 · TODO OK** |
| `npm run verify:rls` | ✅ 10 pasos, `RESULTADO: … [OK]` (no toqué el schema; lo lancé igual porque la CI ahora lo bloquea y el backend lo ha modificado) |
| Auditoría de CSP en Chromium headless contra el build de producción | ✅ **0 violaciones**, 0 peticiones fallidas (mapa, tablón, chat, Clerk, tiles, Cloudinary, fuentes, Nominatim) |

### Cómo se verificó la CSP sin desplegar

1. `NODE_ENV=production PORT=3125 node --import tsx server.ts` sirve `dist/`.
2. Un proxy en `/tmp/opencode/csp-proxy.mjs` reescribe las respuestas con
   **exactamente** los `headers` de `vercel.json` (mismo motor de rutas:
   source exacto, prefijo `/assets/` y regex de imágenes).
3. `/tmp/opencode/csp-audit.mjs` y `/tmp/opencode/csp-probe.mjs` (Chromium
   headless + CDP, sin dependencias) recorren la app y recogen consola,
   peticiones bloqueadas y orígenes reales.
4. Resultado final: `violaciones de CSP: NINGUNA`; fuente `.woff2` de
   `fonts.gstatic.com` descargada, `<img>` de ArcGIS/Cloudinary/OSM cargadas,
   Nominatim → 200, Clerk (JS + API + telemetría) cargando.

Dos fallos reales aparecieron y se corrigieron **antes** de dar por buena la
CSP: el SDK de Clerk descarga `clerk-js` desde su propio dominio (faltaba en
`script-src`) y su telemetría va a `clerk-telemetry.com` (faltaba en
`connect-src`). Ambos scripts viven en `/tmp/opencode/`, fuera del repo.

### Segunda opinión (GitHub Copilot CLI)

`copilot -p "$(cat …)" -s` sobre el `buildCommand` y la CSP. Resumen y qué
hice con cada punto:

- *«La puerta es razonable; `lint` aquí es solo `tsc` (no hay ESLint) y el
  fallback de la clave puede ocultar que falta `VITE_CLERK_PUBLISHABLE_KEY`
  en Vercel»* → **cierto**: la clave hace falta igualmente en el panel
  (README ya la lista como ✅ Build y ✅ Runtime); el fallback solo evita
  que un proyecto recién creado sin clave no pueda desplegar **nunca**.
  Anotado como comprobación de T0.
- *«Aplica la CSP también al HTML de fallback y asegura una ruta de
  callback»* → `public/404.html` no tiene ni un `<script>` (solo enlaces):
  añadir CSP ahí no protege nada, porque la página es estática y la
  petición no es de la raíz; lo dejo anotado en lugar de añadir un bloque
  catch-all que metería la CSP en `/api/*`. Sobre el *callback*: comprobé
  que **no** hay flujos de redirección OAuth en el código (no existe
  `authenticateWithRedirect`; lo único que redirige es
  `afterSignOutUrl="/"` → raíz), así que el riesgo no existe hoy; si algún
  día se añade, el callback debe apuntar a `/`.
- *«`frame-ancestors 'self'` permite incrustarse a sí misma; usa `'none'`»*
  → lo dejo en `'self'` por coherencia con `X-Frame-Options: SAMEORIGIN`
  que ya emite el backend (`server/http.ts:73`).
- *«`blob:` en `worker-src` sobra para un SW local»* → puede ser, pero
  `blob:` es lo que usan algunos SDKs de terceros (y Clerk) para workers
  internos; al no costar nada medible y poder romper algo, se queda.
- *«Los comodines de Clerk son amplios: restringe a los orígenes
  documentados»* → aceptado como **endurecimiento futuro**: hoy no puedo
  saber qué dominio usará la instancia de producción (ver riesgos).

## Decisiones tomadas (y por qué)

- **Puerta en `buildCommand` y no en `ignoreCommand`**: `ignoreCommand`
  *salta* el build en vez de fallarlo; con `&&` un tipo roto o un test rojo
  **falla** el deploy, que es lo que pide FAL-12. Coste: un push rojo gasta
  un build del límite de 100/día del plan Hobby (y lo deja en rojo, que es
  el objetivo).
- **CSP permisiva con Clerk en `script-src`/`connect-src`/`frame-src`** y no
  una CSP estricta de librería: se midió en navegador real que sin esos
  orígenes **no carga el login**. Prioricé «no romper» sobre pureza y dejé
  el recorrido de login con OAuth como verificación pendiente en T0.
- **`Permissions-Policy` con `geolocation=(self)`** (mismo valor que el
  backend) en vez de desactivarla: la app usa `navigator.geolocation` para
  «cerca de mí» y para el reporte.
- **Ante la duda de si correr `verify:rls`, se corre.** Es local
  (clúster desechable en `/tmp`), no consume la BD de Supabase y tarda
  segundos.
- **No generé `package-lock.json`** y usé `--package-lock=false` en `npm rm`
  (decisión pendiente abajo).

## Riesgos y deuda que dejo

- **CSP solo en Vercel.** En local (`npm run dev`) y en Docker/Cloud Run,
  `server.ts` sirve el HTML **sin ninguna cabecera de seguridad** (la CSP
  está solo en `vercel.json`); `setSecurityHeaders` cubre `/api/*`. Aviso al
  backend más abajo.
- **Dominio de Clerk en producción.** Todo se validó con la instancia de
  desarrollo (`unbiased-mantis-7111.clerk.accounts.dev`). Si en Vercel
  clavean con un dominio propio de Clerk, hay que añadirlo a
  `script-src`/`connect-src`/`img-src`/`frame-src`. **Verificar en T0**
  abriendo la app en producción y mirando la consola.
- **Login con OAuth no probado** (no hay credenciales): la sonda cubre la
  carga de ClerkJS, su API y la telemetría, pero no un popup/redirect de
  Google. `form-action` y `frame-src` incluyen los orígenes de Clerk por
  precaución.
- **`engines.node: ">=20.0.0"` vs `test:ui` (necesita ≥22.9)**: Vercel
  resuelve `>=20` a 22.x (documentado en `memoria/04-vercel.md:180`), así
  que hoy funciona; si algún build dijera «bad option», fijar `engines.node`
  a `22.x` (package.json es mío) o *Project Settings → Node.js Version*.
- **Hoy mismo `npm run lint` está rojo** por el trabajo en curso de backend:
  eso significa que **un push a Vercel hasta que backend lo arregle NO
  desplegaría**. Es la puerta funcionando, pero conviene saberlo.
- La CI de GitHub **no protege nada por sí sola**: sin protección de rama,
  un push directo a `main` mergea con la CI en rojo.

## Avisos al backend (no he tocado nada vuestro)

- **CSP en la API y en local**: si queréis la misma
  `Content-Security-Policy` en respuestas de `/api/*` (y en el HTML que
  sirve `server.ts` en local/Docker), hay que añadirla en
  `setSecurityHeaders` (`server/http.ts:71`) — mismo string que
  `vercel.json:22`. No lo hice: es fichero vuestro. Nota: para JSON no
  aporta casi (el navegador no ejecuta JSON); el valor real es para el HTML
  de local/Docker.
- **`test:server` ya espera en `package.json`** apuntando a
  `scripts/test-nucleos.mjs` (invocación `node --env-file-if-exists=.env`,
  la que describe T6). Si T6 necesita otra invocación o variables, decídmelo
  y lo cambio; el paso de CI sale *skipped* mientras el fichero no exista.
- **`verify:rls` ahora bloquea la CI** cuando cambia `supabase/schema.sql`
  (también en PRs, cosa que antes no ocurría). Local hoy: ✅ 10 pasos.
- `scripts/**` no lo he tocado (incluido `smoke-vercel.mjs`: sigue en
  35/35 con mi `vercel.json`).

## Avisos al frontend

- **`index.html:50-56`** sigue citando `src/utils/thirdPartyFonts.ts`
  (el real es `src/utils/consent.ts`) y los `preconnect` a fuentes siguen
  ahí: es FAL-15 de T20 y **no** lo he tocado porque `index.html` es vuestro.
  Con la CSP actual los `preconnect` no molestan, pero la referencia rota
  sí confunde.
- **Si añadís un tercero nuevo** (otro mapa, CDN de imágenes, fuente,
  widget), avisad: hay que sumarlo a la CSP de `vercel.json` o el navegador
  lo bloqueará y solo se verá en consola.
- **PWA (T15)**: `worker-src 'self' blob:` + `manifest-src 'self'` + 
  `script-src 'self'` ya dejan listo el Service Worker en `/sw.js` y el
  manifest. Si queréis cabecera `no-cache` para el SW, decídmelo y la añado
  a `vercel.json`.
- **Clustering (T16)** no toca orígenes: sin cambios de CSP.

## Decisiones pendientes (requieren consenso / persona)

1. **Lockfile**: hay `bun.lock` congelado y desincronizado (le faltan 4
   dependencias) y **no** existe `package-lock.json`. Propuesta: o regenerar
   `bun.lock` con bun, o pasar el repo a `package-lock.json` + `npm ci`
   en CI y en `installCommand` (más reproducible; la CI ya hace
   `npm ci || npm install` y el Dockerfile detecta el lockfile). **No lo hago
   sin acuerdo.**
2. **Protección de rama `main`** exigiendo CI verde: es configuración de
   GitHub, alguien con permisos tiene que activarla.
3. Si se quiere **endurecer la CSP en el futuro** (quitar `unsafe-inline`
   de estilos con hash/noce, añadir `report-uri`/`report-to`), primero haría
   falta un receptor de reportes; hoy no lo hay.
4. `engines.node` → `22.x` solo si el build de Vercel se queja (arriba).

## Re-verificación final (última pasada, 2026-10-01)

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ❌ **3 errores, todos en `server/**` de agente-backend en pleno cambio** (T1-T3 en curso): `server/handlers/comments.ts:78` TS2739 (a `PointComment` le faltan `userName`/`userRole`), `server/supabase.ts:23` TS6192 y `:24` TS6196 (imports sin usar). **No lo he tocado** (área backend); lo lancé 3 veces durante la sesión con el mismo resultado. Nada de lo mío aparece en la lista de errores. |
| `npx vite build` | ✅ (`built in 449ms`) |
| `npm run test:ui` | ✅ `TODO OK` (40/40) |
| `npm run smoke:vercel` | ✅ `35 comprobaciones · 0 fallos · TODO OK` |
| `npm run verify:rls` | ✅ `RESULTADO: esquema y politicas RLS correctas [OK]` — n/a para mí (no toqué `supabase/schema.sql`); lo corrí igual porque la CI **ahora lo bloquea** y el fichero lo tiene modificado backend. |
| Auditoría CSP (Chromium headless + proxy con las cabeceras de `vercel.json`) | ✅ 0 violaciones, 0 peticiones fallidas |
| `getTransformedRoutes` + schema oficial sobre el `vercel.json` final | ✅ `error: null` · **VÁLIDO** |

**Bloqueo heredado:** hasta que agente-backend deje `tsc` en verde, el build
de Vercel fallará a propósito (esa es la puerta de T17) y T0 no puede
cerrarse. Volver a lanzar `npm run lint` cuando eso pase; el resto de la
batería ya está en verde con mis cambios.

## Para el siguiente agente

- `vercel.json` tiene **dos** zonas sensibles: el `buildCommand` (puerta) y
  el bloque `headers` de `/` (CSP). Cualquier cambio en ambos se valida en
  2 minutos con `getTransformedRoutes` + schema oficial (receta en
  `memoria/15-correccion-vercel-json.md` y en «Cómo se verificó la CSP»
  arriba) **sin gastar un deploy**.
- Los scripts de auditoría de CSP (proxy + 2 sondas CDP) están en
  `/tmp/opencode/`: `csp-proxy.mjs`, `csp-audit.mjs`, `csp-probe.mjs`. Úsalos
  antes de tocar la CSP o al revés: si alguien cambia la CSP, que los pase.

