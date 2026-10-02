# Decisiones tomadas

> Formato: **fecha · decisión · alternativa descartada · por qué**. Si quieres
> cambiar algo de esta lista, anótalo en tu log y déjalo como `🔁 en revisión`.

**2026-09-28 · Identidad única = sesión de Clerk.**
La identidad de quien escribe (apoyos, reportes, comentarios) es el JWT de
Clerk verificado en servidor (`server/auth.ts:70-91`). El registro local del
`AuthModal` (perfil: nombre, barrio, rol) **no** valida por sí solo.
*Descartado:* confiar en `authorId`/`userId` enviados por el cliente (hoy en
`server/validation.ts:169,220`), que permite falsificar autoría.
*Por qué:* los apoyos ya funcionan así y es lo único verificable.

**2026-09-28 · `verified` nace en `false` y se gana por separado.**
Hoy se fuerza `verified: true` al crear (`server.ts:246`) y todos los datos
semilla están verificados: el badge de «verificados» no significa nada.
*Descartado:* seguir poniéndolo en `true` «para que el mapa se vea bien».
*Por qué:* es la base de la confianza en una app de emergencias; el proceso
de verificación (coordinador/oficial) será una tarea posterior.

**2026-09-28 · Comentarios en su propia tabla, RLS sin políticas.**
`point_comments` con RLS habilitado y **cero políticas** (mismo patrón que
`need_supporters`, `supabase/schema.sql:148-152`): solo el servidor, con
`service_role`, escribe o lee.
*Descartado:* políticas `TO authenticated` con `auth.uid()`, porque el IdP es
Clerk y `auth.uid()` de Supabase nunca será esa identidad (por eso esas
políticas actuales son inalcanzables).
*Por qué:* coherente con cómo funciona ya la autenticación.

**2026-09-28 · El contador de apoyos sale de la BD, nunca de la caché.**
Recuento atómico en Postgres (RPC/`count(*)`), con la caché solo como
respuesta de último recurso.
*Descartado:* `supporters_count = target.supportersCount` desde memoria
(`server.ts:464-468`), que sobrescribe valores reales bajo concurrencia.
*Por qué:* un like perdido o inflado destruye la prueba social.

**2026-09-29 · Imágenes desde Cloudinary, secretos solo en `.env`.**
El *cloud name* `z2t43npi` es público y vive en `src/config/images.ts`; la
`CLOUDINARY_URL` (API key + secreto) solo en `.env` y solo la usa
`npm run cdn:upload`.
*Por qué:* las URLs de entrega son públicas por diseño; los secretos jamás
en el bundle ni en `/api/config`.

**2026-09-29 · Las tipografías de terceros se cargan con consentimiento.**
Google Fonts se inyecta desde JS solo si el usuario aceptó las cookies
opcionales (`src/utils/consent.ts`); sin aceptar, pila de fuentes del sistema.
*Descartado:* `<link>` bloqueante en el head (era la situación anterior).
*Por qué:* privacidad + rendimiento a la vez.

**2026-09-29 · Sin enrutador, la 404 la sirve el servidor.**
La SPA no usa rutas: cualquier URL que no sea un archivo devuelve
`404.html` con estado real 404 (dev y prod).
*Descartado:* seguir devolviendo el shell con 200 (mal SEO y enlaces rotos
invisible).
*Por qué:* todavía no necesitamos rutas; cuando las haya (landings por
barrio), será el momento de introducir un router.

**2026-09-29 · Destino de despliegue: Vercel Hobby (gratis).**
La app Express se comparte en `server/app.ts`; `api/index.ts` la exporta como
*default* (guía oficial de Vercel) y `vercel.json` fija `framework: vite`,
`buildCommand: vite build`, `outputDirectory: dist`, el rewrite
`/api/:path* → /api` y las cabeceras de caché de `/assets`. `server.ts`
sigue siendo la entrada de local/Docker/Cloud Run **sin ningún cambio de
comportamiento**.
*Descartado:* seguir en Cloud Run, que se encareció (contenedor + egress +
balanceador superan con creces lo que cuesta el plan gratis).
*Por qué:* misma BD (Supabase) e IdP (Clerk) sin tocar datos ni identidad,
CDN con compresión, `404.html` con estado 404 y límites de sobra (100 GB de
tráfico, 1 M invocaciones, 4 CPU-h, 100 builds/día). *Aviso:* el plan Hobby
es **no comercial**: si el proyecto monetiza, toca pasar a Pro (o volver a
un contenedor).

**2026-09-30 · La API de Vercel pasa a una función por ruta (T10).**
Los cuerpos de ruta de `server/app.ts` se extrajeron a **núcleos
framework-agnósticos** (`server/handlers/*.ts`): reciben un `ApiRequest`
normalizado y responden `{status, body}` (o `null` si ya escribieron en el
`res`). Express (`server/app.ts`, router montado en `/api`) y las funciones
`api/*.ts` (vía `createApiRoute` de `server/vercel.ts`) ejecutan el mismo
código con el mismo orden — cabeceras → cuerpo máx 1 MB → límite de tasa →
auth → núcleo — y la misma respuesta. `api/index.ts` ya **no** exporta la
app: es el fallback 404 JSON (`Ruta no encontrada: <MÉTODO> <ruta sin /api>`).
Los rewrites específicos de `vercel.json` (antes del catch-all `/api/:path*`)
aportan `_orig=<ruta canónica>` para que los mensajes 404 y la extracción del
id coincidan con los de Express en cualquier semántica de URL tras rewrite.
*Descartado:* mantener la única función Express (funcionaba, pero concentraba
toda la API en una instancia y no daba escalado ni aislamiento por ruta) y
fijar `maxDuration` (sin `functions`/`maxDuration` en `vercel.json`, como
acordado: 300 s por defecto del plan).
*Por qué:* paridad verificada con una matriz de 43 peticiones (byte a byte
salvo la compresión local y el texto no determinista del chat) + 4
escenarios del emulador de routing de Vercel. *Aviso:* Hobby limita a
**12 funciones por deployment**; con 10 hay 2 de margen, y los espejos de
filesystem (`/api/sql`, `/api/support/mine`) responden en Vercel como su
ruta canónica (Express responde 404 en esos espejos): no los usa el cliente.

**2026-09-30 · El `id` del apoyo viaja explícito en el rewrite (T13).**
`/api/needs/:id/support → /api/needs-support?_orig=needs/:id/support&id=:id`:
el `id` se escribe a mano en el query además de dejar que
`@vercel/routing-utils` lo deduzca, y `resolveNeedId()` es *path primero*,
usando `query.id` solo cuando la petición trae `_orig` (`req.rewritten`).
*Descartado:* confiar en la expansión implícita (caso KO-4 de T12: si el
runtime no expande el query ni autoinyecta el parámetro, «apoyar» devolvía
404 en el primer deploy) y pasar el id por cabecera (rompe la paridad con
Express).
*Por qué:* es una línea más de configuración a cambio de eliminar la única
dependencia no probada del routing de Vercel.

**2026-09-30 · Los espejos de filesystem se bloquean con 404 (T13).**
`/api/support-mine` y `/api/needs-support` coinciden con un fichero de
`api/`, así que Vercel los sirve sin rewrites; ahora los núcleos exigen su
ruta canónica (flag `rewritten` de `server/vercel.ts`) y responden
`404 Ruta no encontrada: …`, idéntico a Express (KO-1/KO-2 de T12).
*Descartado:* borrar los ficheros de `api/` (rompe «una función por fichero»
y obliga a reescribir `vercel.json`) y aceptar el 401 del espejo (paridad
rota).
*Por qué:* el cliente solo usa las rutas canónicas, así que el cambio es
invisible para la app y solo afecta a quien adivine el nombre del fichero.

**2026-09-30 · El rate limit de Vercel es por función y así se documenta (T13).**
El `writeLimiter` (60/min por IP) es una cuenta única en Express y **cuatro**
cuentas en Vercel (240/min efectivos); el `chatLimiter` (15/min) es igual en
ambos. Se anota en la tabla del README en vez de tocar `server/limiters.ts`.
*Descartado:* endurecer el `max` para compensar (haría 429 a IPs que en
Express no lo recibirían) y moverlo a Redis/KV de un golpe (coste y plan
Hobby gratis).
*Por qué:* el multiplicador es **más permisivo, nunca restrictivo**, así que
nadie que funcionaba en Express deja de funcionar; el hardening exterior es
una decisión de producto cuando haya presupuesto.

**2026-09-30 · Imports relativos con `.js` explícito en `api/` y `server/`
(fix del primer deploy).** Todos los imports relativos con valor llevan la
extensión resolutiva (`'../server/vercel.js'`, `'../src/types/index.js'`),
que es lo que Node ESM exige en el lambda de Vercel: el build de
`@vercel/node` emite los `.ts` como `.js` ESM (`"type": "module"`) y **no
reescribe** los especificadores, de modo que un `'../server/bootstrap'`
acababa en `ERR_MODULE_NOT_FOUND` al cargar → *todas* las funciones
`FUNCTION_INVOCATION_FAILED` en el primer deploy (reproducido con el build
real de `@vercel/node` en local: compila, extrae el lambda e invoca).
*Descartado:* compilar a CommonJS (exige `import.meta` opcional y un
`package.json` del lambda en contradicción con `"type": "module"`) y
bundle experimental de funciones (no probado en plan Hobby).
*Por qué:* es la solución documentada por Vercel para paquetes ESM, TS la
resuelve a `.ts` en el typecheck, tsx la resuelve en local y Vite no toca
`server/**`; coste: una regla fija para futuros imports — **siempre `.js`
explícito en `api/` y `server/`** (los *type-only* no importan pero se
dejan igual por coherencia).

**2026-10-02 · `/api/v1` es un alias compatible, no una bifurcación.**
Las rutas versionadas llaman a los mismos handlers que `/api`: Express monta
el mismo router y Vercel reescribe cada alias a la función existente, con
`_orig` preservando la ruta canónica. Los listados públicos comparten
`page`, `limit` y metadatos; la omisión de parámetros en las rutas legacy y
versionadas conserva la respuesta histórica sin paginar.
*Descartado:* duplicar handlers o crear funciones de Vercel por versión (se
desincronizarían contratos y consumirían el límite Hobby).
*Por qué:* permite adoptar `/api/v1` sin cambiar clientes ni elevar el coste
operativo; una futura v2 podrá definir cambios separados.
