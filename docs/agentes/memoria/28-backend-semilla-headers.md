# Log — backend: semilla única + cabeceras local/Docker (2026-10-02)

## En qué trabajé

- **Grupo 2 de la auditoría de objetivos (OBJ-02/OBJ-01), secuencial:**
- **T29 · Semilla única (T11 heredada) — parte servidor.** `server/seedData.ts`
  pasó de 5 puntos / 3 necesidades (contadores `18/34/22` sin filas que los
  respaldaran) a los **32 puntos / 6 necesidades / 4 comentarios** que pinta
  `src/data/initialData.ts`, con la siembra de `need_supporters` que hace
  falta para que ningún contador sea imposible.
- **T32 · Paridad de seguridad local/Docker.** La CSP y las cabeceras de
  seguridad que hoy solo mandaban `vercel.json` (estáticos de Vercel) ahora
  las emite también el servidor local/Docker (Express) y el adaptador de API,
  **carácter a carácter** idénticas.
- Área propia tocada: `server/**`, `scripts/**`, `server.ts` (más las dos
  ejecuciones sobre la BD de `.env`, abajo). No toqué `src/**`, `index.html`,
  `public/**`, `README.md`, `vercel.json`, `.github/**`, `package.json` ni
  `supabase/schema.sql`.

## Cambios realizados

### T29 · semilla única (parte servidor)

- `server/seedData.ts` → ahora contiene los **32 puntos / 6 necesidades / 4
  comentarios**, copia verbatim de `src/data/initialData.ts` (mismos ids
  `cali-*`, `need-1..6`, `comm-1..4`, mismo orden, mismos campos). La
  cabecera explica **por qué es copia y no import** (ver decisiones abajo) y
  el camino para pasar a import literal.
- `server/seedSupporters.ts` (**nuevo**, reglas puras sin BD):
  `supporterRowsToSeed(needId, target, existingCount)` siembra exactamente
  `supportersCount` filas con ids deterministas
  (`seed-supporter-<needId>-<n>`) **solo** si la necesidad no tiene ninguna
  fila; nunca infla una base con apoyos reales; `supporterSeedId` para
  reproducción exacta.
- `scripts/seed-db.ts` → además de puntos y necesidades (upsert idempotente
  `ON CONFLICT … DO NOTHING`), por cada necesidad: recuento real de
  `need_supporters`, siembra del plan y **escritura final del recuento** en
  `help_needs.supporters_count` (el contador materializado siempre acaba
  igual que las filas, pase lo que pase).
- `scripts/test-nucleos.mjs` → sección **S1–S11**: paridad carácter a
  carácter de los 3 datasets servidor↔cliente (`vite.ssrLoadModule` de
  ambos ficheros + `JSON.stringify` igual), contrato 32/6/4 en los dos
  lados, contadores enteros ≥ 0, caché en memoria con los mismos números,
  contrato `[18,34,22,45,15,52]` (186 filas en BD nueva) y las reglas de
  siembra (exactamente `target` filas, ids únicos y deterministas, nunca
  con apoyos existentes, nada con contador 0).
- `server/handlers/chat.ts`, `server/context.ts` → comentarios que seguían
  hablando de «3 necesidades, 5 puntos» actualizados (misma área).

### T32 · cabeceras local/Docker = Vercel

- `server/http.ts` →
  - `CONTENT_SECURITY_POLICY` (923 caracteres): **copia textual** del bloque
    `/` de `vercel.json` (Cloudinary, tiles OSM/ArcGIS, Clerk, Google
    Fonts, Nominatim, `frame-ancestors`, `worker-src blob:`, etc.);
  - `PERMISSIONS_POLICY` idéntica a la de `vercel.json`;
  - `setSecurityHeaders(res)` ahora pone las **5 cabeceras** de `vercel.json`
    (CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
    `Referrer-Policy: strict-origin-when-cross-origin`,
    `Permissions-Policy`) + `Cross-Origin-Opener-Policy: same-origin` (solo
    el adaptador de API, como en Vercel);
  - `relaxCspForViteDev` / `enableViteDevCsp` / `contentSecurityPolicy`: la
    **única** relajación posible es el HTML de `npm run dev`, que Vite
    envuelve en un `<script type="module">` inline (preamble de
    react-refresh) y cuyo HMR usa `ws:` — solo en ese proceso; humo,
    tests y producción mandan la copia textual.
- `server.ts` → llama `enableViteDevCsp()` justo al montar el middleware de
  Vite (solo arranque en desarrollo).
- `server/middleware.ts`, `server/app.ts`, `server/vercel.ts` → **sin
  cambios necesarios**: ya delegaban todos en `setSecurityHeaders`
  (`app.use(securityHeaders)` en Express montado antes de rutas y
  estáticos; `setSecurityHeaders(res)` en el adapter de funciones), así que
  la expansión cubre API **y** HTML local con el mismo alcance.
- `scripts/test-nucleos.mjs` → sección **S12–S19**: CSP carácter a carácter
  vs `vercel.json`, las 5 cabeceras con mismo valor en `setSecurityHeaders`,
  el middleware `securityHeaders` de Express, **respuesta HTTP real**
  `GET /api/health` con las 5 + COOP, y que `relaxCspForViteDev` solo toca
  `script-src` (preamble) y `connect-src` (HMR).
- `scripts/smoke-vercel.mjs` → 5 comprobaciones nuevas sobre
  `/api/health`: CSP, `Permissions-Policy`, `Referrer-Policy`,
  `X-Frame-Options` y `Cross-Origin-Opener-Policy` (51 checks en total).

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ (0 errores, TS estricto) |
| `npx vite build` | ✅ (`✓ built in 429ms`) |
| `npm run test:ui` | ✅ (40/40 · `TODO OK`) |
| `npm run test:server` | ✅ (**140/140** · `TODO OK`; S1–S19 nuevas) |
| `npm run smoke:vercel` | ✅ (**51/51** · `TODO OK`) |
| `npm run verify:rls` | n/a (no toqué `supabase/schema.sql`) |
| Humo local `NODE_ENV=production PORT=3124 node --import tsx server.ts` | ✅ `/api/health` 200 · `/` 200 · `/ruta-inexistente` 404 |

**Evidencia de paridad (`curl -I` local, servidor de esta sesión):**

- `/api/health` y `/` responden `Content-Security-Policy` **idéntica
  byte a byte** a la del bloque `/` de `vercel.json` (verificado con
  diff de cadenas: «CSP IDENTICA (923 caracteres)»), más
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=(self),
  payment=(), usb=()` y `Cross-Origin-Opener-Policy: same-origin`.

**Sabotajes (rojo deliberado, restaurado después; `diff` contra backup = 0):**

1. T29 — cambié un nombre de punto en la copia de `server/seedData.ts` →
   `test:server` → **`FALLO S1`** (1 fallo, exit 1). Restaurado → verde.
2. T32 — borré `https://res.cloudinary.com` de la CSP del servidor →
   `test:server` → **`FALLO S12 + S13 + S16`** (3 fallos) y
   `smoke:vercel` → **1 fallo** en «CSP de la API = la del bloque `/`».
   Restaurado → verdes.

**Semilla real contra Supabase (`.env` de la persona):**

| Paso | Resultado |
| --- | --- |
| Estado antes | 5 puntos · 4 necesidades · **1** fila en `need_supporters` y contadores 23/35/22 (inflados: sin filas que los respalden) |
| `npm run db:setup` | ✅ `esquema aplicado con la Management API (HTTP 201)` — la BD real **no tenía** `help_needs.author_id` (T1); sin eso `db:seed` fallaba con «Could not find the 'author_id' column» |
| `npm run db:seed` (1.ª) | ✅ 32 puntos · 6 necesidades · `need-1=18 · need-2=1 · need-3=22 · need-4=45 · need-5=15 · need-6=52` |
| `npm run db:seed` (2.ª) | ✅ salida **idéntica** (upsert `DO NOTHING` + recuento final: nada crece) |
| Estado después | 32 puntos · 7 necesidades (6 semilla + 1 comunitaria intacta) · 153 filas de apoyo · **contador = filas en las 6 necesidades semilla** |

## Decisiones tomadas (y por qué)

- **Fuente de verdad = `src/data/initialData.ts` (lo que pinta el cliente);
  el servidor la consume como copia verbatim con paridad garantizada por
  test — no por import.** El import literal **rompería el build de Vercel**
  (decisión 2026-09-30, `decisiones.md`): `@vercel/node` emite `.ts` → `.js`
  ESM **sin reescribir especificadores**, y `src/data/initialData.ts:2`
  importa `'../config/images'` **sin extensión** → `ERR_MODULE_NOT_FOUND`
  al cargar el lambda (misma causa que el primer deploy roto, memoria 16).
  El fix sería añadir `.js` en esa línea, pero `src/**` es área del
  agente-frontend y aquí solo lectura → **no lo toco** y anoto la deuda
  (camino exacto en la cabecera de `server/seedData.ts`: cuando esa línea
  tenga `.js`, `seedData.ts` pasa a `export … from '../src/data/initialData.js'`
  y se borra la copia). Mientras, **S1–S4 dejan la suite en rojo ante la
  mínima divergencia** — la copia no puede volver a desincronizarse.
  *Descartado:* invertir la dependencia (el front importando `server/`,
  tocaría `src/**`), módulo neutral (exigiría cambiar `src/**` igualmente) y
  generar el fichero (pasos extra con el mismo riesgo de drift que ya cubre
  el test).
- **Contadores reales, no inflados:** `supportersCount` = nº de filas
  sembradas en `need_supporters` y, tras cada corrida, = `count(*)` real.
  Regla «una base con apoyos reales **nunca** se infla con filas de mentira»
  (S10): por eso `need-2` pasó de **35** (mentira: 1 fila real) a **1**
  (verdad). Es intencional: la RPC `toggle_need_support` recalcula con
  `count(*)`, así que el próximo apoyo habría hecho lo mismo.
- **Ids deterministas de apoyo** (`seed-supporter-need-1-1`…): dos corridas
  producen exactamente las mismas filas (idempotencia real, no solo
  «no rompe»).
- **CSP = copia textual de `vercel.json` dentro de `server/http.ts`**, con
  la paridad asegurada por tests (S12/S13 + humo) en vez de parsear
  `vercel.json` en tiempo de ejecución: el adaptador de Vercel no debe
  arrastrar ficheros extra al lambda y el error de drift debe salir en CI,
  no en producción.
- **`Cross-Origin-Opener-Policy` solo en el adaptador de API** (extra, no
  estaba en `vercel.json`): los estáticos de Vercel no la sirven; no se
  añade a los HTML servidos por Express para no divergir de lo que ve el
  usuario en producción.
- **Única relajación de la CSP: `npm run dev`.** El preamble inline de
  react-refresh rompería `script-src 'self'`; S18/S19 acotan que solo se
  tocan `script-src += 'unsafe-inline'` y `connect-src += ws:`.

## Riesgos y deuda que dejo

- **Unificación literal pendiente (1 línea, área agente-frontend):**
  `src/data/initialData.ts:2` → `'../config/images.js'`; entonces
  `server/seedData.ts` re-exporta y se borra la copia. Hasta entonces la
  paridad vive en S1–S4 (rojo si alguien cambia solo un lado).
- **Cabecera obsoleta en `src/data/initialData.ts`** (dice que el semillero
  del servidor es «5 puntos / 3 necesidades, copia parcial»): ya es 32/6.
  Fichero de solo lectura para mí → agente-frontend.
- **`README.md:201`** sigue diciendo «Carga los datos iniciales (5 puntos,
  3 necesidades)» → agente-calidad (T19).
- **Necesidad comunitaria `cali-need-1790651941896`: contador 1 con 0
  filas.** Dato previo de un usuario (creado con el `supportersCount: 1`
  forzado de antes de T2); el script de semilla **no** la toca a propósito
  (solo las 6 de la semilla). La RPC la corregirá en el próximo apoyo.
- **`db:setup` fue necesario** para que `db:seed` entrara: la BD real no
  tenía `author_id` (T1). Si alguien borra/repone el esquema a mano, hay
  que volver a pasarlo.
- Si algún día cambia el bloque `headers` de `vercel.json` (área
  agente-calidad), hay que replicar el cambio en `CONTENT_SECURITY_POLICY`:
  S12/S13 y el humo se pondrán solos en rojo con la instrucción exacta.
- Tras el push de esta ronda, repetir
  `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel`:
  las 5 comprobaciones T32 contra producción solo saldrán verdes con el
  deploy nuevo (los checks quedan a propósito en rojo contra un deploy
  viejo — anotado en el propio script).
- No hice `git commit` (lo gestiona la persona).

## Para el siguiente agente

- La sección **S** de `scripts/test-nucleos.mjs` (S1–S19) es la puerta de
  T29 y T32: **S1–S4** = paridad semilla, **S5–S11** = contadores/siembra,
  **S12–S19** = CSP/cabeceras. Corre después de M (M instala el Supabase
  falso); cualquier test nuevo que necesite modo caché va en el mismo sitio.
- **No «arreglar»** `need-2 = 1`: es el contador verdad de una base con 1
  apoyo real. Los números del dataset (`18/34/22/45/15/52`) son la promesa
  para una BD **vacía** (S7).
- Si se toca la CSP de `vercel.json`: sincronizar
  `server/http.ts → CONTENT_SECURITY_POLICY` y revisar que
  `relaxCspForViteDev` siga tocando solo `script-src`/`connect-src`.
- El humo de Express (S16) es HTTP real contra el servidor levantado en el
  test: sirve para verificar cabeceras locales sin levantar nada a mano;
  el `curl -I` manual queda para el cierre.
