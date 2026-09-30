# Log — revisión de la migración a Vercel Functions (T11) (2026-09-30)

## En qué trabajé

- **T11 · agente-revision**: encontrar los puntos a tener en cuenta para la
  **migración de la infraestructura a Vercel Functions** y entregarlos como
  checklist accionable y priorizado.
- **Solo lectura** del repo (`server/**`, `api/**`, `src/**`, `scripts/**`,
  `supabase/**`, `vercel.json`, `README.md`, memoria de agentes) + documentación
  oficial de Vercel, Clerk y Supabase. **T10 está en curso en paralelo**
  (función por ruta), así que las conclusiones están ancladas al **diseño**
  (rutas, cachés, límites), no a líneas concretas que puedan moverse.

## Cambios realizados

- **`docs/agentes/memoria/06-checklist-migracion.md`** (este fichero) → único
  fichero escrito. No toqué `api/**`, `server/**`, `vercel.json`, `src/**`,
  `README.md`, `decisiones.md`, `tareas-semana-1.md` ni nada más.
- **Sin `git add` / `git commit`** y sin borrar nada.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ⛔ **no ejecutado a propósito** (T10 editando a mitad de tarea) |
| `npx vite build` | ⛔ **no ejecutado a propósito** |
| `npm run test:ui` | ⛔ **no ejecutado a propósito** |
| `npm run verify:rls` | ⛔ **no ejecutado a propósito** |
| Análisis de código/config/doc | ✅ Tareas T1–T11 leídas, inventario de `process.env` y de rutas hecho |

> La verificación la hará **agente-verificacion** cuando T10 cierre.

---

## 1. Resumen ejecutivo

T9 dejó el puente funcionando (`api/index.ts` exporta la app de
`server/app.ts` + rewrite `/api/:path* → /api` en `vercel.json`) y T9 ya
validó el humo de la función en local con `VERCEL=1` (9/9). **El despliegue
unitario es técnicamente posible hoy**; lo que falta es todo lo que convierte
un «funciona en local» en «funciona en producción de verdad». Los puntos más
críticos: **(1)** las variables del panel de Vercel, porque sin ellas la API
responde **200 con datos de mentira** (caché semilla) — fallo silencioso e
inaceptable en una app de emergencias; **(2)** la **paridad de estado** con
T10: cada `api/*.ts` será un módulo aislado con su propia `memoryPoints`,
su propio limitador y su propio throttle de esquema, y hay rutas que hoy leen
lo que otra ruta escribió (chat ← puntos/necesidades, apoyos ←
`memoryNeedSupporters`); **(3)** el **pipeline sin red de seguridad**: el
build de Vercel no ejecuta `lint` ni `test:ui`, así que se puede desplegar
roto; **(4)** las **claves de Clerk** (`pk_test_/sk_test_` → instancia
producción con dominio propio, con rebuild porque la clave va horneada en el
bundle) y la rotación pendiente de la API secret de Cloudinary; **(5)** la
**operación en Hobby**: logs de runtime con **1 hora** de retención, sin
alerts, rate limit y cachés por instancia, plan **no comercial** y ~100
deploys/día.

---

## 2. Checklist priorizado

Leyenda de **quién**: `BACK` = agente-backend · `FRONT` = agente-frontend ·
`VERIF` = agente-verificacion · `PERSONA` = la persona (cuenta, panel, claves).

### 🔴 Bloqueante antes del primer deploy real

---

**R1 · Variables de entorno completas en Production **y** Preview + humo anti-degradación silenciosa**

- **Qué**: crear en *Project → Settings → Environment Variables* las 11
  variables de la tabla del `README.md:407-421`, marcadas **Production y
  Preview**. Añadir al humo post-deploy dos aserciones duras:
  `GET /api/points` → `"source":"supabase"` (nunca `memory_cache`) y
  `GET /api/config` → `supabaseConnected:true`, `supabaseTablesReady:true`,
  `clerkPublishableKey` empezando por `pk_`.
- **Por qué**: si falta `SUPABASE_URL`/`SERVICE_ROLE_KEY`, la app no rompe:
  devuelve **200 con `INITIAL_HELP_POINTS`** y las escrituras se pierden en el
  siguiente cold start. Es el único fallo que el humo «de humo» (200/404) no
  detecta. Con Preview sin variables, cada PR de verificación mostraría datos
  falsos.
- **Cómo comprobarlo**: `curl -s https://<dom>/api/points | grep -o
  '"source":"[a-z_]*"'` → `supabase`; `curl -s https://<dom>/api/config` →
  `supabaseConnected:true` y `tablesReady:true`; repetir en un deploy de
  Preview.
- **Fichero/entorno**: panel de Vercel (Production + Preview) ·
  `server/app.ts` (`/api/config`, `GET /api/points`) · `.env.example`
  (tabla de referencia).
- **Quién**: `PERSONA` (crear proyecto y variables) + `VERIF` (humo).

---

**R2 · Decisión y rotación de claves de Clerk (test → live) y sus dominios**

- **Qué**: decidir instancia de Clerk para el despliegue:
  - Sobre `*.vercel.app` **solo** caben claves de desarrollo
    (`pk_test_`/`sk_test_`): la documentación de Clerk dice literalmente que
    «no es posible usar claves de producción con el dominio de preview del
    host» y que las claves `pk_live_` solo valen para el dominio de producción
    configurado.
  - Al conectar dominio propio (`APP_URL=https://ayudaencali.lat`): crear
    instancia de **producción**, publicar `pk_live_/sk_live_`, configurar los
    registros DNS de Clerk y **añadir los dominios** a *Allowed origins /
    Redirect URLs* (dominio raíz, `www` y el `*.vercel.app` si se sigue
    usando en Preview).
  - Rotación pendiente: la **API secret de Cloudinary quedó expuesta en un
    chat** → rotarla (y revisar la API key asociada). No afecta al runtime
    (solo `npm run cdn:upload`), pero sí a la cuenta.
- **Por qué**: con claves `test` en un dominio «producción» Clerk rechaza el
  origen (*«Production Keys are only allowed for domain …»*) o autentica con
  la postura relajada de dev (token de sesión en querystring
  `__clerk_db_jwt`), que no sirve para producción. Una rotación sin
  **rebuild** deja en el bundle la clave vieja (ver R3).
- **Cómo comprobarlo**: en el navegador del deploy: sign-in → sign-out →
  apoyo con sesión (200) → `401` en una pestaña anónima; en el dashboard de
  Clerk, *Domains* sin avisos; `grep -o 'pk_live_[a-z0-9]*'
  dist/assets/*.js` coincide con la clave del panel.
- **Fichero/entorno**: dashboard de Clerk · panel de Vercel ·
  `src/config/clerk.ts`, `src/main.tsx`, `.env` local.
- **Quién**: `PERSONA` + `FRONT` (prueba de login/logout en el deploy).

---

**R3 · `VITE_CLERK_PUBLISHABLE_KEY` es de BUILD: cualquier rotación exige rebuild**

- **Qué**: definir la variable **también en el entorno de build** y añadir a
  la rutina de rotación de claves: *cambiar la env → **redeploy***. Mantener
  el fallback de `resolveClerkPublishableKey()` (bundle → `/api/config`) y
  comprobar que no quede **una clave vieja horneada** (el bundle «gana» sobre
  `/api/config`: `src/config/clerk.ts:43-45`).
- **Por qué**: Vite inlina `import.meta.env.VITE_*` en el JS. Si el bundle
  trae `pk_test_` y el servidor sirve `pk_live_`, el navegador usa la vieja y
  Clerk falla en el dominio de producción. La env de **runtime** por sí sola
  no corrige eso.
- **Cómo comprobarlo**: tras rotar, `curl -s <dom>/assets/*.js | grep -o
  'pk_[a-z]*_' | sort -u` → solo el prefijo nuevo; login funcional.
- **Fichero/entorno**: panel de Vercel (build + runtime) · `src/config/clerk.ts` ·
  `src/main.tsx` (fallback a `/api/config` si el bundle no trae nada).
- **Quién**: `PERSONA` (env) + `FRONT` (verificación).

---

**R4 · Paridad T10: el estado en memoria NO se comparte entre funciones**

- **Qué**: verificar (y si hace falta rediseñar en `server/handlers/**`) el
  destino de todo el estado de módulo cuando haya una función por ruta:
  `memoryPoints/Needs/Comments`, `memoryNeedSupporters`, `status` de
  Supabase, `lastVerifyAt`/`applyAttempts`, `warnedMissingKey`,
  `lastTokenWarnAt` y **los dos limitadores**. Rutas con dependencia cruzada:
  - `POST /api/chat` → `buildSystemInstruction()` serializa
    `memoryPoints`/`memoryNeeds` (**si esa función no las ha cargado, el
    modelo recibe `[]` y el fallback local anuncia «0 puntos»**).
  - `POST /api/needs/:id/support` → busca en `memoryNeeds` y escribe en
    `memoryNeedSupporters`.
  - `GET /api/support/mine` → mezcla BD + `memoryNeedSupporters`.
  - `GET /api/*` → si la caché de esa instancia está vacía y Supabase falla,
    devuelve la semilla.
- **Por qué**: en Express (hoy) todo es **un solo proceso**: lo que escribe
  `/api/points` lo lee `/api/chat`. Con N funciones hay N copias aisladas y N
  limitadores → el límite efectivo de escrituras pasa de 60/min globales a
  60/min **por ruta por instancia**, y la caché de respaldo se vuelve
  inconsistente entre funciones.
- **Cómo comprobarlo**: con las funciones desplegadas, **sin llamar antes a
  nada**: `POST /api/chat` («centros de acopio») debe devolver datos reales y
  no «0 puntos activos»; `POST /api/needs/<id>/support` con Supabase caído y
  después `GET /api/support/mine`; repetir `POST /api/points` 61 veces en un
  minuto y comprobar el 429 esperado (y anotar cuál es el límite real).
- **Fichero/entorno**: `api/*.ts` (T10) · `server/handlers/**` (T10) ·
  `server/app.ts` (fuentes de verdad del diseño) · `server/rateLimit.ts`.
- **Quién**: `BACK` (diseño) + `VERIF` (prueba de paridad).

---

**R5 · Red de seguridad en el pipeline: el build de Vercel no valida nada**

- **Qué**: añadir un gate antes de desplegar: GitHub Actions con
  `npm run lint` + `npx vite build` + `npm run test:ui` (+ `verify:rls` cuando
  cambie `supabase/schema.sql`), o en su defecto anteponerlos al
  `buildCommand` de `vercel.json`. Hoy `buildCommand` es solo `vite build`.
- **Por qué**: `tsc --noEmit` estricto (`noUnusedLocals/Parameters`) es la
  principal red del proyecto y **no corre en el deploy**. T10 reescribe rutas
  ahora mismo: un `POST` mal tipado o un import roto llega a producción y,
  con 1 h de logs (ver O4), ni siquiera se puede investigar después.
- **Cómo comprobarlo**: subir una rama que rompa tipos → el deploy debe
  quedarse en rojo; en verde, evidencia del check en el historial de GitHub.
- **Fichero/entorno**: `.github/workflows/*.yml` (nuevo) o `vercel.json`
  (`buildCommand`) · `package.json` (scripts ya existentes).
- **Quién**: `PERSONA` (habilitar GitHub/App de Vercel) + `BACK` (workflow).

---

**R6 · Humo post-deploy automatizado (paridad Express ↔ funciones)**

- **Qué**: un script versionado (patrón ya usado en T9 con
  `/tmp/opencode/smoke-vercel.mjs`) que ejecute contra el deploy real la
  misma batería que contra `server.ts`: 200 en `health/config/points/needs/
  comments/support/mine?`…, **401** en las 5 escrituras anónimas, **400** con
  JSON malformado, **404 JSON** en `/api/xyz-inexistente`, **404 JSON** en un
  método no soportado (paridad con `app.use('/api', apiNotFound)`), ruta
  dinámica `/api/needs/<id>/support`, **límite de body 1 MB**, `404.html` con
  estado **404**, `/assets/*` `immutable`, y los smoke de R1.
- **Por qué**: es la única forma de detectar el riesgo que dejó anotado T9
  (qué `req.url` ve la función tras el rewrite), los 404/405 que T10 puede
  cambiar sin querer, y las degradaciones silenciosas. Sin él, el primer aviso
  lo da un usuario.
- **Cómo comprobarlo**: `node scripts/smoke-vercel.mjs <url>` → todo en verde;
  que falle con cualquier desviación de estado/contenido.
- **Fichero/entorno**: `scripts/` (nuevo, área BACK) + ejecución desde CI
  (R5) o a mano tras cada deploy.
- **Quién**: `BACK` (script) + `VERIF` (lo ejecuta y firma).

---

### 🟠 Alto

---

**O1 · Claves secretas: nada con prefijo `VITE_` y escaneo del bundle en CI**

- **Qué**: inventario confirmado (abajo, §4 de detalle). Solo
  `VITE_CLERK_PUBLISHABLE_KEY` lleva prefijo. Añadir al CI un escaneo de
  `dist/assets/*.js` buscando `sk_live|sk_test|AIza|SUPABASE_SERVICE|cloudinary://…:`.
- **Por qué**: Vite inlina **toda** variable `VITE_*`; un `VITE_GEMINI_API_KEY`
  futuro convertiría la cuota de Gemini en un regalo público. El secreto de
  Cloudinary ya se filtró una vez.
- **Cómo comprobarlo**: `grep -rE "VITE_(SUPABASE|CLERK_SECRET|GEMINI|CLOUDINARY)" .`
  vacío (solo `.env.example` como texto) y el escaneo de `dist/` en verde.
- **Fichero/entorno**: `.env.example` · panel de Vercel · workflow CI ·
  `src/config/images.ts` (solo cloud name, ya correcto).
- **Quién**: `BACK`.

---

**O2 · `SUPABASE_ACCESS_TOKEN` fuera del entorno de la función**

- **Qué**: **no** definir el Management API token en Vercel; aplicar el
  esquema con `npm run db:setup` local/CI. Si se decide mantenerlo, documentar
  por qué (hoy solo sirve para auto-crear tablas).
- **Por qué**: es un token de **cuenta completa** (leer/esquema/datos de todo
  el proyecto) viviendo en una función pública; además `autoApplySchema()`
  tiene cortocircuitos **por proceso** (`MAX_APPLY_ATTEMPTS=3`,
  `APPLY_MIN_INTERVAL_MS=10min`) → con N funciones un problema transitorio de
  esquema dispara N tormentas de DDL contra la Management API.
- **Cómo comprobarlo**: `grep SUPABASE_ACCESS_TOKEN` en el panel → ausente;
  `/api/config` sigue mostrando `tablesReady:true` tras `db:setup`.
- **Fichero/entorno**: panel de Vercel · `server/supabase.ts` · `supabase/schema.sql`.
- **Quién**: `PERSONA` (env) + `BACK`.

---

**O3 · `verify:rls` y RLS en el flujo de deploy**

- **Qué**: correr `npm run verify:rls` en CI (necesita `initdb`/`pg_ctl`/`psql`,
  PostgreSQL 14+, o un servicio `postgres` en la action) **cada vez que cambie
  `supabase/schema.sql`**, y comprobar en el deploy que `service_role` sigue
  siendo el único escritor.
- **Por qué**: la función usa `service_role` y **bypasea RLS**: si una política
  queda mal al revés, el servidor sigue funcionando y solo se ve en las
  pruebas. El script ya cubre 10 pasos (anon bloqueado, `need_supporters` y
  `point_comments` sin políticas, RPC solo `service_role`).
- **Cómo comprobarlo**: paso de CI en verde; `npm run verify:rls` en local
  «10 pasos OK».
- **Fichero/entorno**: `scripts/verify-rls.sh` · `supabase/schema.sql` · CI.
- **Quién**: `BACK` + `VERIF`.

---

**O4 · Logs en Hobby: 1 hora de retención y sin alerts**

- **Qué**: definir **cómo se investiga un error** en producción. `server/logger.ts`
  sí es suficiente para *escribir* (Vercel captura `console.*` en *Runtime
  Logs*), pero en Hobby la retención es de **1 hora** y Observability/alertas
  son de Pro. Opciones: (a) capturar incidentes importantes en una tabla
  Supabase desde el `errorHandler`, (b) un drain externo cuando haya plan, o
  (c) aceptar y dejar escrito que un error de hace 2 h ya no es investigable.
- **Por qué**: sin esto, la respuesta a «ayer falló algo» es «no hay datos».
  Y `logger` ya filtra `debug` en producción (`MIN_LEVEL = info`), con lo que
  muchos detalles ni siquiera se emiten.
- **Cómo comprobarlo**: provocar un error controlado (`POST /api/points` con
  sesión y BD apagada → 503) y localizarlo en *Runtime Logs* antes de la hora;
  o comprobar la fila en la tabla de errores.
- **Fichero/entorno**: `server/logger.ts` · `server/middleware.ts`
  (`errorHandler`) · panel de Vercel.
- **Quién**: `BACK` + `PERSONA` (decisión de plan/tercero).

---

**O5 · Rollback y entornos (Production / Preview)**

- **Qué**: documentar el procedimiento: en *Deployments* → «Promote to
  Production» del último deploy bueno (rollback instantáneo, sin rebuild) y
  probarlo una vez. Definir el uso de Preview (variables aparte, ver R1) y
  evitar que un PR llegue a Production automático sin CI (R5).
- **Por qué**: es la principal ventaja de Vercel frente a Cloud Run y hoy no
  está documentada en `README.md` (solo los pasos de subida).
- **Cómo comprobarlo**: romper a propósito un deploy de Preview, promover el
  anterior y ver la URL de producción funcionando en <30 s.
- **Fichero/entorno**: panel de Vercel · `README.md` (área BACK, edición
  puntual cuando ya haya deploy real).
- **Quién**: `PERSONA` + `BACK`.

---

**O6 · Presupuesto Hobby y techo de crecimiento**

- **Qué**: dejar anotado el techo real (documentación oficial vigente):
  **4 CPU-h activas + 360 GB-h de memoria provisionada + 1 M invocaciones +
  1 M peticiones de borde + 100 GB de transferencia + ~100 deploys/día +
  45 min de build + máx. 300 s por función + 2 GB de memoria**, y **uso no
  comercial**. Definir la señal de alarma (panel *Usage*) y el plan B (Pro, o
  volver a `server.ts` en contenedor).
- **Por qué**: si el proyecto monetiza, el plan Hobby deja de servir; y los
  recursos que primero se agotan aquí son **memoria provisionada** (se factura
  mientras la instancia espera I/O, p. ej. esperando a Gemini) y **deploys**.
- **Cómo comprobarlo**: *Usage* del equipo dentro de presupuesto tras un mes;
  nota en `README.md` con los números.
- **Fichero/entorno**: panel de Vercel · `README.md` · `decisiones.md` (ya
  tiene la entrada de Hobby).
- **Quién**: `PERSONA` + `BACK`.

---

**O7 · IDs de escritura generados en el cliente con `Date.now()`**

- **Qué**: pasar a `crypto.randomUUID()` en cliente
  (`src/context/AppContext.tsx` en los generadores `cali-point-…`,
  `cali-need-…`, `comm-…`); el servidor ya acepta ambos formatos
  (`parsed.value.id ?? …`).
- **Por qué**: en local eran «imposibles» de chocar; con la app **en
  producción con usuarios reales**, dos publicaciones en el mismo milisegundo
  → una recibe **409** y la UI ya no reintenta a ciegas (T4): el usuario ve
  un error que no puede arreglar.
- **Cómo comprobarlo**: dos sesiones publicando a la vez (o un test de
  columna que genere 50 ids rápidos) → ids únicos, ningún 409.
- **Fichero/entorno**: `src/context/AppContext.tsx`.
- **Quién**: `FRONT`.

---

**O8 · Cobertura de `test:ui` sobre T5–T8 (la migración justifica acentuarla)**

- **Qué**: añadir las 4-6 comprobaciones sugeridas por agente-verificacion
  (`signOut(`, `mergeById(`, `ensureIdentity(`, `aria-live="polite"`,
  `pendingWrite`) al patrón de regex ya usado en `scripts/test-authmodal.mjs`.
- **Por qué**: hoy hay **0 menciones** de esas funciones en el test; T10 va a
  mover el backend y alguien tocará `AppContext.tsx` de refilón: la red de
  regresión no cubre logout, merge offline, toasts ni identidad única.
- **Cómo comprobarlo**: `npm run test:ui` en verde con el contador actualizado
  y fallando si se borra `signOut(` de `AppContext.tsx`.
- **Fichero/entorno**: `scripts/test-authmodal.mjs` (área BACK, es el test).
- **Quién**: `VERIF` (propone) + `BACK` (aplica) / `FRONT` (revisa).

---

**O9 · Cabeceras de seguridad en el CDN (los estáticos hoy no las tienen)**

- **Qué**: añadir a `vercel.json` una regla `"/(.*)"` con los cinco headers
  que hoy pone Express en **todas** sus respuestas
  (`server/middleware.ts:5-12`): `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self)`,
  `Cross-Origin-Opener-Policy: same-origin`. HSTS ya lo añade Vercel. Y
  evaluar una **CSP en report-only** (hoy **no existe CSP en ninguna parte**,
  ni Express ni CDN).
- **Por qué**: en Vercel los HTML/JS/imágenes los sirve el **CDN**, no
  Express: `securityHeaders` solo alcanza a `/api/*`. El `404.html` y el shell
  quedan sin `nosniff`/anti-clickjacking, que sí tenían en Cloud Run.
- **Cómo comprobarlo**: `curl -sI https://<dom>/ | grep -iE "x-content-type|x-frame|referrer|permissions-policy"`
  (y lo mismo en `/assets/*.js` y `/404.html`); `curl -sI .../api/health`
  mantiene los mismos.
- **Fichero/entorno**: `vercel.json` · `server/middleware.ts` (referencia de
  paridad) · `index.html` (si se añade CSP, allow-list: `res.cloudinary.com`,
  `*.clerk.com`, `fonts.googleapis.com`/`fonts.gstatic.com`,
  `basemaps.carto.com`).
- **Quién**: `BACK`.

---

**O10 · Límites de función: `maxDuration`, timeout del cliente y cuota de Gemini**

- **Qué**: fijar `maxDuration` explícito en `vercel.json` (p. ej. 30 s para
  `POST /api/chat`, 10-15 s para el resto) y un **timeout interno** en
  `generateWithGemini()` (~10-12 s) que caiga al directorio local **antes**
  de que el cliente aborte a 15 s (`src/services/api.ts:5`).
- **Por qué**: el default de Hobby es 300 s: una llamada a Gemini colgada
  mantiene la instancia viva facturando **memoria provisionada** (360 GB-h/ mes)
  sin devolver nada al usuario; y hoy el reintento (`attempt < 1` + 500 ms de
  `sleep`) **duplica** la latencia máxima. El cliente aborta a 15 s → la
  respuesta tardía se tira. Además el chat es el que más invocaciones
  «caras» genera (I/O largo) con `chatLimiter` de 15/min **por instancia**
  (ver R4).
- **Cómo comprobarlo**: `POST /api/chat` cronometrado con Gemini inyectando
  fallo/latencia → responde con `source: local` dentro de 15 s; revisar
  `maxDuration` en la pestaña *Functions* del deployment.
- **Fichero/entorno**: `vercel.json` (`functions.maxDuration`) ·
  `server/app.ts` (`generateWithGemini`, `chatLimiter`).
- **Quién**: `BACK`.

---

### 🟡 Medio

---

**M1 · Supabase desde funciones: frío, sondas y pool (no hay pool, pero sí latencia)**

- **Qué**: aceptar/medir el coste de `maybeVerifySchema()` en frío: cada
  instancia nueva ejecuta 4 sondas (+ reintento de 400 ms) **antes** de
  responder, con throttle de 30 s **por instancia**; y decidir si se sigue
  `await` en las rutas de lectura. Documentar que `supabase-js` habla
  PostgREST por HTTPS (sin pool de conexiones → **no hay riesgo de agotar
  pooler**, pero sí 1 petición por consulta con timeout de 8 s).
- **Por qué**: en N funciones, N throttles y N sondas: más tráfico a Supabase
  y primer request más lento (el usuario ve el «cargando» más rato en la
  visita fría).
- **Cómo comprobarlo**: medir p50/p95 de `GET /api/points` en cold vs warm
  (Runtime Logs) y contar probes en el panel de Supabase.
- **Fichero/entorno**: `server/supabase.ts` · `api/*.ts`.
- **Quién**: `BACK`.

---

**M2 · Límite de body: 1 MB propio < 4.5 MB de Vercel**

- **Qué**: conservar `express.json({ limit: '1mb' })` (o equivalente) en
  **cada** función y comprobar la respuesta: `>1 MB` → **413/400 JSON**, JSON
  malformado → **400** `«JSON inválido en el cuerpo de la petición»`
  (paridad con `errorHandler` + `entity.parse.failed`).
- **Por qué**: Vercel acepta hasta 4.5 MB y devuelve su propio error si se
  pasa; si T10 delega el parseo, el código de error cambia y el cliente ve un
  mensaje distinto.
- **Cómo comprobarlo**: `curl -X POST --data-binary @1_5mb.json
  -H 'Content-Type: application/json'` → mismo status/mensaje que en local.
- **Fichero/entorno**: `server/app.ts` (línea del limitador global) ·
  `server/middleware.ts` (`errorHandler`) · `api/*.ts`.
- **Quién**: `BACK` + `VERIF`.

---

**M3 · Clerk: `clockSkewInMs`, `authorizedParties` y JWKS en frío**

- **Qué**: (a) documentar que el margen de 60 s existe por el **reloj local
  sin NTP** (hoy comprobado: local y `vercel.com` difieren ~1 s); en Vercel no
  hace falta, se puede dejar por prudencia o bajar a 10-15 s. (b) Añadir
  `authorizedParties` al `verifyToken()` con los dominios conocidos (recomenda
  ción explícita de Clerk contra CSRF/cookie-leaking entre subdominios).
  (c) Considerar precarga/caché de JWKS: la primera verificación por instancia
  descarga `/.well-known/jwks.json` (+latencia en frío).
- **Por qué**: sin `authorizedParties` cualquier origen emita un token válido
  se acepta; con N funciones, cada instancia paga el fetch de JWKS.
- **Cómo comprobarlo**: prueba de escritura con sesión en dominio correcto
  (200) y con token de otra app/origen (401); primera escritura en frío < X ms.
- **Fichero/entorno**: `server/auth.ts` (`CLOCK_SKEW_MS`, `verifyToken`) ·
  dashboard de Clerk (dominios).
- **Quién**: `BACK`.

---

**M4 · Región de las funciones y latencia real (Cali ↔ `iad1`)**

- **Qué**: fijar región en *Project → Settings → Functions* (default
  `iad1`) y medir; Hobby corre en **una sola región**. Coordinar con la región
  del proyecto Supabase.
- **Por qué**: la app es de Cali; +100-200 ms por petición × 5 llamadas por
  visita se nota en el mapa y en los apoyos.
- **Cómo comprobarlo**: `curl -w '%{time_total}'` desde un punto colombiano o
  p75 del panel.
- **Fichero/entorno**: panel de Vercel.
- **Quién**: `PERSONA`.

---

**M5 · Despliegue dual sin doble mantenimiento**

- **Qué**: mantener `server.ts` + `Dockerfile` intactos y que **toda** la
  lógica viva en `server/handlers/**`, consumida por `server/app.ts` (Express,
  local/Cloud Run) y por `api/*.ts` (Vercel). Regla: **una ruta, un núcleo**;
  los dos ensambladores solo registran. Mantener `api/index.ts` exportando la
  app completa como **catch-all** mientras T10 no esté cerrado (así todo
  `/api/*` sin función propia sigue respondiendo 404 JSON desde Express en
  vez del 404 HTML de Vercel).
- **Por qué**: si T10 duplica el cuerpo de las rutas, hay dos versiones que
  divergirán (métodos, estados, límites). Y borrar el puente antes de tiempo
  rompe la paridad de 404 JSON.
- **Cómo comprobarlo**: el mismo humo (R6) ejecutado contra `server.ts`
  (`NODE_ENV=production PORT=3125`) y contra la función (`VERCEL=1`) →
  respuestas idénticas; `docker build && docker run` + `curl /api/health` en
  verde; `grep -rn "from 'vite'\|express.static" api/ server/handlers/` vacío.
- **Fichero/entorno**: `server.ts` · `Dockerfile` · `server/app.ts` ·
  `api/index.ts` · `server/handlers/**`.
- **Quién**: `BACK` + `VERIF`.

---

**M6 · Fallback de apoyos con `limit(10_000)`**

- **Qué**: sustituir el recuento del respaldo
  (`server/app.ts`, `… .select('need_id').eq('need_id', …).limit(10_000)`)
  por un `count=exact` con `head:true` de PostgREST.
- **Por qué**: con >10 000 apoyos en una necesidad el contador queda
  **subestimado** y se escribe un `supporters_count` falso en BD (el RPC
  normal lo evita, pero ese es justo el camino de respaldo).
- **Cómo comprobarlo**: test unitario/integrado del respaldo con un
  recuento simulado >10 000 → `recount` exacto.
- **Fichero/entorno**: `server/app.ts` · `server/supabase.ts`.
- **Quién**: `BACK`.

---

**M7 · Deuda de esquema: autor en `help_needs` y FK en `point_comments`**

- **Qué**: migración `help_needs.author_id` (hoy la tabla **no** tiene columna
  de autor: `supabase/schema.sql`) y `FOREIGN KEY (point_id) REFERENCES
  help_points(id)`; ambos con `verify:rls` en verde (O3).
- **Por qué**: sin `author_id`, una necesidad publicada es **imposible de
  moderar/atribuir** (bloquea la semana 2); sin FK, borrar un punto deja
  comentarios huérfanos.
- **Cómo comprobarlo**: `verify:rls` 10 pasos + insert con `point_id`
  inexistente rechazado (23503).
- **Fichero/entorno**: `supabase/schema.sql` · `scripts/apply-schema.ts`.
- **Quién**: `BACK`.

---

**M8 · Cobertura del test de humo local sobre los ficheros que T10 mueve**

- **Qué**: revisar que las comprobaciones estáticas de
  `scripts/test-authmodal.mjs` sigan apuntando al sitio correcto tras T10
  (hoy exigen `app.use(compression())` + `process.env.VERCEL` en
  `server/app.ts`, `status(404)` con `404.html` en `server.ts`, `immutable:
  true` en `server.ts`).
- **Por qué**: son chequeos por regex sobre el fuente: si T10 mueve la
  compresión o la 404, el test se pone en rojo **o** (peor) se actualiza para
  pasar sin que la garantía exista.
- **Cómo comprobarlo**: `npm run test:ui` tras T10, leyendo cada regex
  cambiada y verificando que sigue midiendo lo que dice medir.
- **Fichero/entorno**: `scripts/test-authmodal.mjs`.
- **Quién**: `VERIF`.

---

### ⚪ Bajo

---

**B1 · Lockfiles: solo `bun.lock`, desactualizado y sin `package-lock.json`**

- **Qué**: regenerar `bun.lock` (faltan `@clerk/backend`, `compression`,
  `@types/compression`, `jsdom`) o generar y commitear `package-lock.json`.
- **Por qué**: T9 ya esquivó el fallo con `installCommand: "npm install"`,
  pero cada build resuelve dependencias **de cero** (builds no reproducibles).
- **Cómo comprobarlo**: `npm ci --dry-run` limpio / `bun install --frozen` limpio.
- **Fichero/entorno**: `bun.lock`, `package.json` (no tocar sin consenso).
- **Quién**: `BACK` (+ `PERSONA` si hace falta instalar bun).

**B2 · `GET /api/supabase/sql` es público**

- **Qué**: valorar protegerlo o quitarlo del despliegue público.
- **Por qué**: devuelve el DDL completo a cualquiera (información para
  modelar un ataque); hoy lo usa el humo y la guía de emergencia.
- **Cómo comprobarlo**: `curl -s https://<dom>/api/supabase/sql` → decidido.
- **Fichero/entorno**: `server/app.ts`, `server/schema.ts`.
- **Quién**: `BACK`.

**B3 · Referencias rotas en la documentación**

- **Qué**: corregir cuando toque: `src/context/ClerkSync.tsx` citado en
  `01-backend.md` y `02-frontend.md` (real: **`src/components/ClerkSync.tsx`**)
  y `src/utils/thirdPartyFonts.ts` citado en `index.html` (real:
  **`src/utils/consent.ts`**, ahí se inyectan Google Fonts bajo consentimiento).
- **Por qué**: es el tipo de referencia que un agente siguiente sigue a ciegas.
- **Cómo comprobarlo**: `grep -rn "thirdPartyFonts\|context/ClerkSync" .` vacío.
- **Fichero/entorno**: `docs/agentes/memoria/01-backend.md`, `02-frontend.md`,
  `index.html`.
- **Quién**: cada dueño de su fichero.

**B4 · `APP_URL` no la lee nadie**

- **Qué**: o bien usarla (canonical/og:url/redirects) o retirarla de
  `.env.example`; hoy está documentada como «opcional, el código no la lee».
- **Por qué**: una variable que parece necesaria y no lo es confunde al
  configurar Vercel (R1).
- **Cómo comprobarlo**: `grep -rn "APP_URL" src/ server/ scripts/` vacío.
- **Fichero/entorno**: `.env.example`, `README.md`.
- **Quién**: `BACK`.

**B5 · Vitrina suplantable (`userName`/`userRole`/`userBarrio` del cuerpo)**

- **Qué**: derivar nombre y rol del perfil de Clerk en servidor o validarlos
  contra BD (ya anotado en `03-verificacion.md`, semana 2).
- **Por qué**: la identidad `user_id`/`author_id` ya es del JWT, pero cualquiera
  puede publicarse «coordinador» en el texto visible.
- **Cómo comprobarlo**: `POST /api/comments` con `userRole:'coordinador'` en
  el cuerpo → no debería reflejarse.
- **Fichero/entorno**: `server/validation.ts`, `server/app.ts`.
- **Quién**: `BACK`.

**B6 · `og:image` y imágenes de Cloudinary**

- **Qué**: verificar tras la rotación de credenciales (R2) que
  `https://res.cloudinary.com/z2t43npi/…/og_ayudaencali` sigue devolviendo
  200 (los `public_id` están en `src/config/images.ts`).
- **Por qué**: las previsualizaciones sociales no fallan «a la vista», solo en
  WhatsApp/X/Facebook.
- **Cómo comprobarlo**: `curl -sI` de las 4 URLs de `CDN_IMAGES` + test
  existente del og en `test:ui`.
- **Fichero/entorno**: `src/config/images.ts`, `index.html`.
- **Quién**: `FRONT`.

**B7 · Google Fonts con consentimiento (comportamiento en el CDN)**

- **Qué**: comprobar que el banner de consentimiento y la inyección diferida
  siguen igual en Vercel (no cambia nada por CDN, pero es parte del checklist
  de estáticos) y que, si se añade CSP (O9), `fonts.googleapis.com` y
  `fonts.gstatic.com` están permitidos **solo tras aceptar** (o se acepta que
  las preconexiones del `<head>` siempre existan).
- **Cómo comprobarlo**: con cookies rechazadas, `grep` en Network: 0
  peticiones a `fonts.googleapis.com/css2`.
- **Fichero/entorno**: `index.html`, `src/utils/consent.ts`.
- **Quién**: `FRONT`.

---

## 3. Tabla función ↔ ruta ↔ límites Hobby

Rutas actuales de `server/app.ts` (T10 debe producir una función por fila; la
última fila es el catch-all que **debe conservarse**).

| Ruta | Método | Función propuesta (`api/…`) | Límiter | Invoc./visita (cualitativo) | Coste Hobby |
| --- | --- | --- | :-: | --- | --- |
| `/api/health` | GET | `health.ts` | – | 1 (humo/uptime) | ⚪ nulo (CPU mínima) |
| `/api/config` | GET | `config.ts` | – | 1 por arranque de app (puede cachearse en cliente) | 🟡 1ª llamada por instancia: sondas de esquema |
| `/api/supabase/sql` | GET | `supabase/sql.ts` (o solo catch-all) | – | muy raro | ⚪ nulo |
| `/api/points` | GET | `points.ts` | – | 1 por carga/refresh | 🟡 I/O Supabase (8 s timeout) + reintento |
| `/api/points` | POST | `points.ts` | 60/min | bajo | 🟢 barato (1 insert) |
| `/api/needs` | GET | `needs.ts` | – | 1 por carga | 🟡 igual que points |
| `/api/needs` | POST | `needs.ts` | 60/min | bajo | 🟢 barato |
| `/api/needs/:id/support` | POST | `needs/[id]/support.ts` | 60/min | bajo-medio (likes) | 🟡 RPC transaccional; **ojo** con su propia caché (R4) |
| `/api/support/mine` | GET | `support/mine.ts` | – | 1 con sesión | 🟡 I/O + merge en memoria |
| `/api/comments` | GET | `comments.ts` | – | 1 por mapa/refresh | 🟡 I/O |
| `/api/comments` | POST | `comments.ts` | 60/min | bajo | 🟢 barato |
| `/api/chat` | POST | `chat.ts` | 15/min | medio-alto | 🔴 **la más cara**: I/O largo a Gemini, reintento, `maxDuration` (O10); 15 s del cliente |
| `/api/*` (no match) | * | `index.ts` (rewrite) → Express `apiNotFound` | – | atascos/bots | ⚪ responde 404 JSON al instante |

**Presupuesto cualitativo del plan Hobby** (limitantes reales, por orden):

1. **~100 deploys/día** → el primero que se agota con CI/preview.
2. **4 CPU-h activas** → solo cuenta CPU de verdad; Express+JSON es trivial,
   el riesgo está en parses grandes y en el bundle frío.
3. **360 GB-h de memoria provisionada** → se consume **esperando** (Gemini,
   Supabase). 2 GB por instancia ⇒ ~180 instancias-hora/mes: el `maxDuration`
   de O10 es aquí donde ahorra.
4. **1 M invocaciones** → con ~5 por visita ≈ 200 000 visitas/mes: holgado.
5. **100 GB** de transferencia → holgado (los estáticos van por CDN con
   caché `immutable`).

---

## 4. Inventario de variables de entorno (verificado con grep)

| Variable | ¿Build? | ¿Runtime? | ¿Con `VITE_`? | Nota |
| --- | :-: | :-: | :-: | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ | ✅ | **única permitida** | va al bundle; también la sirve `/api/config` |
| `CLERK_SECRET_KEY` | – | ✅ | **jamás** | si falta → 401 en apoyos y escrituras |
| `CLERK_PUBLISHABLE_KEY` | – | ✅ | **jamás** | alias que acepta `/api/config` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | – | ✅ | **jamás** | sin ellas → caché semilla (R1) |
| `SUPABASE_ACCESS_TOKEN` | – | opcional | **jamás** | **recomendado NO llevarlo** (O2) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | – | ✅ / opcional | **jamás** | sin clave → directorio local |
| `CARTO_API_KEY` | – | opcional | **jamás** | solo se expone `cartoConfigured:boolean` |
| `CLOUDINARY_URL` | – | ❌ | **jamás** | solo local (`npm run cdn:upload`) |
| `PORT` / `NODE_ENV` / `VERCEL` | – | ❌ | – | los pone la plataforma |
| `APP_URL` | – | ❌ | – | el código no la lee (B4) |

Rotaciones pendientes: **CLOUDINARY API secret** (filtrada en un chat),
**Clerk `pk_test_`/`sk_test_` → `pk_live_`/`sk_live_`** al conectar dominio
(R2), y revisión de que `SUPABASE_SERVICE_ROLE_KEY`/`GEMINI_API_KEY` no se
hayan compartido nunca fuera de `.env` (el histórico de git está **limpio**:
`.env` jamás estuvo trackeado y solo hay placeholders en `.env.example`).

---

## 5. Riesgos residuales y qué NO hay que tocar

**Riesgos residuales (aceptar o mitigar, pero están):**

1. **Retención de logs de 1 hora** y sin alerts en Hobby (O4) → cualquier
   incidencia antigua es irrecuperable.
2. **Rate limit y cachés por instancia/función** → contadores reiniciados en
   cold start y límites efectivos multiplicados (R4). Sin Redis externo, es
   lo que hay.
3. **Degradación silenciosa a caché semilla** si alguien toca variables →
   solo la detecta el humo de R1.
4. **Cold start + región `iad1`** → primera visita más lenta desde Cali.
5. **Plan Hobby no comercial** y techos fijos (O6): si hay monetización o
   crecimiento, hay que subir de plan o volver al contenedor (el dual de M5
   es justo el seguro).
6. **T10 en curso**: este análisis se basa en el diseño; parte del detalle
   (nombres de ficheros, número de líneas) puede haber cambiado al leerlo.
7. **Doble despliegue que hay que seguir probando**: un cambio puede dejar
   verde Vercel y roto Cloud Run (o al revés) si se pierde la paridad de M5.

**Qué NO tocar (mientras T10 no cierre y sin consenso):**

- `vercel.json` `rewrites` y `framework: vite` → el rewrite es el que da el
  404 JSON de `/api/*` desconocido y da **precedencia al filesystem** (las
  funciones por ruta ganan automáticamente sobre el rewrite: si T10 añade
  `api/points.ts`, esa ruta deja de ir a `index.ts`; borrarlo rompe la red de
  seguridad).
- `api/index.ts` como puente/catch-all hasta que el humo de T10 pruebe la
  paridad completa.
- `server.ts` y `Dockerfile` (entrada de local/Docker/Cloud Run) y su doble
  `errorHandler`.
- `supabase/schema.sql` sin `npm run verify:rls` al lado.
- `src/context/AppContext.tsx`, `Toast.tsx`, `ClerkSync.tsx` sin actualizar
  antes `scripts/test-authmodal.mjs` (O8): `test:ui` no los cubre.
- Ningún fichero del área de otro agente; **sin `git add` ni `git commit`**.

---

## 6. Definición de «listo para migrar» (criterios de aceptación del primer deploy real)

1. **CI en verde obligatorio**: `npm run lint` + `npx vite build` +
   `npm run test:ui` (≥40, ahora con checks de T5–T8) y `npm run verify:rls`
   si cambió el esquema; el deploy no arranca sin eso (R5, O8, O3).
2. **Variables completas** en Production y Preview, y el humo confirma
   `source:"supabase"`, `supabaseConnected:true`, `tablesReady:true` y
   `clerkPublishableKey` con `pk_` (R1).
3. **Paridad de respuestas** idéntica a local: 200 en las 7 lecturas, 401 en
   las 5 escrituras anónimas, 400 con JSON malformado y con body >1 MB, 404
   JSON en `/api/*` desconocido **y** en método no soportado, ruta dinámica
   `/api/needs/<id>/support` funcionando, `dist/404.html` con estado 404,
   `/assets/*` `immutable`, cabeceras de seguridad en `/`, `/assets` y
   `/api/health` (R6, O9, M2).
4. **Identidad real en el dominio desplegado**: sign-in → publicar → apoyar →
   sign-out; anónimo → 401; claves de Clerk decididas y **rebuild hecho**
   (R2, R3).
5. **Chat dentro de presupuesto**: respuesta de Gemini o fallback local
   **antes** de los 15 s del cliente, `maxDuration` fijado, sin agotar cuota
   (O10).
6. **Estado entre funciones verificado**: el chat responde con datos reales
   sin llamada previa, y los apoyos son coherentes entre rutas (R4).
7. **Rollback probado**: promover el deployment anterior y volver en <1 min
   (O5).
8. **Observabilidad mínima**: un error forzado se localiza en Runtime Logs
   dentro de esa hora, o existe salida persistente (O4).
9. **Presupuesto revisado** en el panel tras el primer mes, con la vía de
   escape definida (Pro / contenedor) y el aviso de «no comercial» anotado
   (O6).
10. **Despliegue dual en verde**: `npm run dev` y
    `docker build && docker run` + humo local/Cloud Run idéntico al de
    Vercel, con la misma batería de tests (M5).

---

## Decisiones tomadas (y por qué)

1. **No he ejecutado ningún comando de verificación**: T10 está editando a
   mitad de tarea y un `lint`/`build`/`test` en rojo ahora sería ruido falso
   (lo pidió la misión: análisis, no verificación).
2. **Prioricé por «lo que falla en silencio»**: R1/R4 van primero porque no
   producen errores visibles, producen respuestas *200* falsas.
3. **Mantuve `api/index.ts` como red de seguridad** en el checklist: es la
   diferencia entre «T10 olvidó una ruta» (404 JSON) y «T10 olvidó una ruta»
   (404 HTML de Vercel).
4. **`SUPABASE_ACCESS_TOKEN` fuera de Vercel**: prefiero perder la
   auto-reparación de esquema a exponer un token de cuenta en una función
   pública con N procesos llamando a la Management API.

## Riesgos y deuda que dejo

- La fila «quién» de cada item es una **propuesta**: no puedo asignar
  tareas (el tablero `tareas-semana-1.md` es de la persona/equipo y está
  fuera de mis ficheros).
- No he podido verificar el **estado actual de T10** (si `server/handlers/**`
  ya existe): el checklist R4/M5 está redactado para que sirva de prueba tanto
  si la separación ya se hizo como si no.
- El script de humo de Vercel de T9 vive en `/tmp/opencode/smoke-vercel.mjs`
  (fuera del repo): si se quiere reutilizar en CI (R6) hay que
  **reescrito en `scripts/`**, cosa que no hago porque es fichero de BACK.

## Para el siguiente agente

- **agente-verificacion**: empieza por R6 + R1 (humo con estados y `source`)
  y por R4 (chat sin llamada previa). No valides solo «200 y 404»: aquí el
  fallo bonito es un 200 con datos de mentira.
- **agente-backend (T10)**: el checklist entero del bloque 🔴 es tu puente de
  paridad; `server/handlers/**` debe ser la **única** fuente de verdad de
  rutas, límites y mensajes.
- **agente-frontend**: O7 (ids) y O8 (cobertura de T5–T8) son los dos que
  pueden romper la experiencia de usuarios reales en producción.
- **la persona**: R1 (variables), R2/R3 (claves de Clerk y rotación de
  Cloudinary), O4/O5/O6 (logs, rollback, presupuesto) no los puede hacer
  ningún agente.
