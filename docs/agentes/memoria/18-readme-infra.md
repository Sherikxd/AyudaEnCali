# Log — README / infraestructura (2026-09-30)

## En qué trabajé
- Subagente «AGENTE DE README» spawnado por otra sesión. Ficheros tocados:
  **solo** `README.md` (raíz) y este log.
- Objetivo: cerrar FAL-14 (README desincronizado del código), dejar la
  infra documentada (árbol real, despliegues, CI, calidad) y la parte
  documental de FAL-15 (que el README no describa mecanismos inexistentes).

## Cambios realizados
- `README.md` · **Stack**: la fila «Backend» decía «en Vercel, la función
  `api/index.ts`» → ahora «una función por ruta (`api/*.ts`) sobre
  `server/handlers/`»; fila Auth ampliada (`@clerk/backend` verifica el
  JWT), fila Datos con las **4 tablas**; nuevas filas «Despliegue» y
  «Calidad».
- `README.md` · **Arquitectura**: árbol reescrito contra el repo real
  (`server/` con `handlers/`, `vercel.ts`, `http.ts`, `limiters.ts`,
  `auth.ts`, `store.ts`, `context.ts`, `bootstrap.ts`; `api/` con sus 10
  ficheros; `scripts/` con los 6; `src/config/`, `public/404.html`,
  `docs/agentes/`, `.github/workflows/ci.yml`).
  → corrige FAL-14: `middleware.ts` ya **no** cita `asyncHandler` (los
  exports reales son `securityHeaders`, `apiNotFound`, `errorHandler`) y
  `api/index.ts` ya **no** «exporta la app como default» (es el fallback
  404), coherente con la sección de Vercel.
  Flujo de datos actualizado: ya no termina en `server.ts`, pasa por el
  adaptador del entorno → `server/handlers/` → Supabase.
- `README.md` · **Variables de entorno**: `CARTO_API_KEY` ya no dice «capa
  base del mapa» (solo la lee `server/handlers/config.ts` y la expone como
  `cartoConfigured`; las capas de `MAP_LAYERS` son OSM/ArcGIS sin clave);
  añadida la fila `APP_URL` (solo en `.env.example`, el código no la lee);
  `CLERK_SECRET_KEY` ahora indica que sin ella **todas** las rutas con
  sesión responden 401 (antes solo citaba apoyos).
- `README.md` · **Scripts**: añadidos `typecheck`, `smoke:vercel` y la nota
  de red de `verify:rls` (FAL-14).
- `README.md` · **Nueva sección `## Verificación y CI`**: tabla de los 5
  comandos (`lint`/`typecheck`, `vite build`, `test:ui`, `smoke:vercel` 35
  checks, `verify:rls`), pipeline de `.github/workflows/ci.yml` en orden
  (lint → build → test:ui → smoke → verify:rls condicionado a
  `schema.sql` y `continue-on-error`), Node 22, `npm ci || npm install`,
  `fetch-depth: 0`. El «Gate» de la sección de Vercel ahora enlaza aquí.
- `README.md` · **API**: `POST /api/points`, `POST /api/needs` y
  `POST /api/comments` marcados como *exige sesión* (los cuatro `POST`
  exigen JWT, verificado en los handlers); párrafo de sesión con la lista
  explícita y con `verifyToken` de `@clerk/backend`; el `curl` de ejemplo
  lleva `Authorization`; los límites indican que en Vercel son **por
  función** con enlace a la sección.
- `README.md` · **Base de datos**: «tres tablas» → **cuatro**
  (`help_points`, `help_needs`, `need_supporters`, `point_comments`, las 4
  `CREATE TABLE` de `supabase/schema.sql`) y «cualquiera de las tres» →
  «de las cuatro»; la tabla RLS gana la fila de `point_comments` (RLS activo
  sin políticas) y concreta el alcance de INSERT/UPDATE/DELETE.
- `README.md` · **Despliegue**: tabla nueva de destinos (local, Node,
  Docker/Cloud Run, Vercel) con la entrada de cada uno.
- `README.md` · **Vercel**: el bloque de humo incluye ya
  `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel`;
  nuevo bullet «Imports ESM con `.js` explícito» (regla de
  `docs/agentes/decisiones.md`, verificable en `api/*.ts` y `server/*.ts`);
  fila `CARTO_API_KEY` de la tabla de variables corregida.
- `README.md` · **Docker**: nuevo bullet con la base `node:24-slim`.
- `README.md` · **Enlaces** (FAL-14): separa el deploy de Vercel
  (`https://ayuda-en-cali.vercel.app`, el que sirve producción) del dominio
  propio `https://ayudaencali.lat` (alias: 308 → `www`, `server: Vercel`,
  etag idéntico al del `*.vercel.app`, `/api/health` 200 en ambos) y deja
  **el humo pendiente** contra producción.
- `README.md` · **FAL-15 (solo documental)**: el mecanismo de tipografías
  se cita con su fichero real `src/utils/consent.ts` (el que inyecta el
  `<link id="third-party-fonts">` condicionado al consentimiento). El README
  no contenía ninguna referencia a `thirdPartyFonts.ts`.
- `README.md` · Características: consentimiento reversible «desde el perfil
  y el FAQ» (los dos tienen control, `FaqModal` y `ProfileView`).
- `README.md` · **Tres precisiones más, comprobadas en vivo contra el
  deploy**: (a) la fila de `GET /api/supabase/sql` indica que es **pública**
  (el handler no exige sesión); (b) el bullet de cabeceras de seguridad
  acota que aplican a las respuestas de la API —en `server/app.ts` y en
  `server/vercel.ts`— y añade un bullet en la sección de Vercel diciendo
  que los estáticos del CDN solo llevan `Cache-Control` (verificado con
  `curl -I`: `/api/health` → `nosniff`/`X-Frame-Options`/`Referrer-Policy`/
  `Permissions-Policy`, `/` → solo `cache-control`).

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ⏭️ no ejecutado (orden del padre: sin builds ni tests) |
| `npx vite build` | ⏭️ no ejecutado (ídem) |
| `npm run test:ui` | ⏭️ no ejecutado (ídem) |
| `npm run smoke:vercel` | ⏭️ no ejecutado (ídem); el de producción sigue **pendiente** |
| Revisión estática | ✅ árbol, scripts, tablas, rutas y límites cotejados con `server/`, `api/`, `scripts/`, `supabase/schema.sql`, `package.json`, `vercel.json`, `ci.yml`, `Dockerfile` |
| Comprobación de referencias | ✅ `grep` de rutas/ficheros citados en el README: todos existen (los falsos positivos son nombres basa o `package-lock.json` hipotético) |
| Comprobación de tablas Markdown | ✅ todos los bloques de tabla con número de columnas constante |
| HTTP en vivo | ✅ `ayudaencali.lat` → 308 → `www.ayudaencali.lat` (server: Vercel), `/` con el mismo etag que `ayuda-en-cali.vercel.app` y `GET /api/health` → 200 en ambos |

## Decisiones tomadas (y por qué)
- Dejar **ambos** dominios en «Enlaces» y no borrar `ayudaencali.lat`
  (canonical y `og:url` de `index.html` lo usan): existe y apunta al mismo
  deploy; lo que faltaba era distinguirlo del deploy de Vercel.
- Documentar «35 checks» del humo: coincide con la auditoría (35/35) y con
  el recuento estático de `scripts/smoke-vercel.mjs` (5 estáticos + 27
  casos + 3 de `req.body`).
- Corregir en el README la descripción de `CARTO_API_KEY` en vez de
  tocar `.env.example`/código: fuera de mi área, anotado abajo.
- No cifrar ni prometer nada del humo de producción: queda como paso
  abierto en «Enlaces».

## Riesgos y deuda que dejo
- **No ejecuté ningún check** (`lint`, `build`, `test:ui`, `smoke:vercel`,
  `verify:rls`) por orden explícita. El diff es solo Markdown, pero el gate
  de CI lo confirmará en el próximo push.
- **Humo de producción sin lanzar**:
  `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel`.
  No hay registro en `docs/agentes/memoria/` de que se haya corrido nunca
  contra el deploy real.
- `server.ts` (cabecera, ~línea 6) sigue diciendo que «`api/index.ts` la
  exporta como default»: comentario obsoleto en código **backend**, no tocado.
- `docs/agentes/decisiones.md` (entrada 2026-09-29) también lo dice; está
  corregido por la entrada posterior (2026-09-30) y es histórico: no lo
  he modificado por ser de sólo-lectura.
- `.env.example` describe `APP_URL` como «URL pública… callbacks» y
  `CARTO_API_KEY` como «capa base del mapa»; el código no lee la primera y
  las capas no usan la segunda. Convendría alinear ese fichero.
- `index.html` sigue citando `src/utils/thirdPartyFonts.ts` (FAL-15) y
  manteniendo `preconnect` a fuentes: fuera de mi alcance.
- FAL-05 (`/api/supabase/sql` sin autenticación) y FAL-13/FAL-09 (sin
  cabeceras de seguridad en los estáticos de Vercel) **siguen abiertos**: el
  README ahora los describe con exactitud en vez de prometer lo que no pasa,
  pero cerrarlos es tarea de backend/infra, no mía.
- Las cifras históricas de rendimiento (~408 → ~108 kB, ≈2,9 → ≈0,6 MB)
  no se han podido recomprobar sin build; se dejan como estaban.

## Para el siguiente agente
- Si tocas `api/` o `server/`, recuerda la regla de los imports `.js` y
  actualiza la tabla de funciones del README si añades/quitas una (límite
  Hobby: **12**).
- Al cerrar el humo de producción, borra el «Humo pendiente» de la sección
  **Enlaces** y anótalo en tu log.
