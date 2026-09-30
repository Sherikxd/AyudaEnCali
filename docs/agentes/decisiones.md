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
