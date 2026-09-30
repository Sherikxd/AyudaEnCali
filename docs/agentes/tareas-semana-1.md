# Tablero — Semana 1: deuda crítica

> Orden recomendado: T1+T2+T3+T4 (backend) y T5+T6+T7+T8 (frontend) pueden
> ejecutarse **en paralelo** por no compartir ficheros. La verificación final
> es T0 y se lanza al terminar las dos.

Leyenda de estado: `⬜ pendiente` · `🟡 en curso` · `✅ hecha` · `⛔ bloqueada`

---

## T1 · Escrituras autenticadas — **agente-backend** · ✅

`POST /api/points`, `POST /api/needs` y `POST /api/comments` no exigen sesión
(hoy solo 60/min por IP): cualquiera publica emergencias falsas.

**Hacer:**
- Llamar a `getAuthenticatedUser(req)` en las tres rutas → `401` si no hay
  sesión (usar `respondUnauthorized`, igual que `server.ts:332,381`).
- La identidad **no se acepta del cliente**: `author_id`, `user_id` y
  `verified` salen del JWT, ignorando lo que mande el cuerpo (el validador ya
  los acepta en `server/validation.ts:169,220`).
- Los reportes nuevos nacen **`verified: false`** (hoy se fuerza `true` en
  `server.ts:246`): la verificación será un paso aparte (T-verify, no esta
  semana).

**Hecho cuando:** sin sesión → 401 en las 3 rutas; con sesión → 201 y el
registro con `author_id` del usuario autenticado; ningún campo de identidad
procedente del cuerpo llega a la BD.

## T2 · Comentarios persistidos — **agente-backend** · ✅

Hoy los comentarios viven solo en RAM (`server.ts:517`) y **no existe tabla**:
se pierden en cada deploy.

**Hacer:**
- Tabla `point_comments` en `supabase/schema.sql` (id, point_id, author_id,
  author_name, body, created_at; índices por `point_id`). **RLS habilitado y
  sin políticas** (como `need_supporters`, `schema.sql:148-152`): solo el
  servidor escribe, con `service_role`.
- `scripts/apply-schema.ts` debe crearla (`CREATE TABLE IF NOT EXISTS`, como
  las demás).
- `POST /api/comments` inserta en BD y `GET /api/comments` lee de BD con
  **fallback** a la caché si Supabase falla (mismo patrón que puntos).

**Hecho cuando:** crear un comentario, reiniciar el servidor y seguir viendo
el comentario; `npm run verify:rls` en verde y `npm run db:setup` crea la
tabla en el Supabase real.

## T3 · Contador de apoyos atómico — **agente-backend** · ✅

El servidor hace una **escritura absoluta** desde la caché
(`supporters_count = target.supportersCount`, `server.ts:464-468`): bajo
concurrencia pierde apoyos y puede **sobrescribir** el valor real de BD.

**Hacer:**
- Que el contador salga siempre de la verdad de BD: RPC/función Postgres que
  haga `INSERT`/`DELETE` en `need_supporters` **y** recalcule
  `supporters_count` en la misma transacción, o en su defecto
  `UPDATE ... SET supporters_count = (SELECT count(*) …)` después del
  insert/borrado.
- Añadir la función al esquema (idempotente) y llamarla desde
  `POST /api/needs/:id/support`.
- El servidor debe devolver el **recuento real** (hoy devuelve el de su
  caché).

**Hecho cuando:** dos apoyos simultáneos no pierden el segundo, el contador
nunca queda por debajo del `count(*)` real, y `verify:rls` sigue en verde.

## T4 · Inserts con error silenciado — **agente-backend** · ✅

`server.ts:256-259` y `:313-316` no comprueban `error` → responden `201`
aunque la BD rechazó. Además los IDs son `cali-point-${Date.now()}`
(`server.ts:245,302`) → colisiones plausibles.

**Hacer:**
- Comprobar `error` en todos los inserts/updates de puntos, necesidades y
  comentarios → responder con el código adecuado (`409` colisión, `503` BD no
  disponible) y mensaje claro; nunca un 201 con la operación fallida.
- IDs con `crypto.randomUUID()` (manteniendo compatibilidad con los IDs
  semilla `cali-*` ya existentes).

**Hecho cuando:** simulado un error de BD, la respuesta **no** es 201 y el
log refleja el fallo.

---

## T5 · Cerrar sesión de verdad — **agente-frontend** · ✅

`logoutUser` solo resetea el perfil local (`AppContext.tsx:307-309`) y
`signOut` **no se usa en la app**: «Cerrar Sesión» no cierra nada para usuarios
de Clerk; además `ClerkSync.tsx:71-75` vuelve a marcar `isRegistered: true`.

**Hacer:**
- Si hay sesión de Clerk → `signOut()` (`useClerk()`), además de limpiar el
  perfil local; si no la hay → solo perfil local (como ahora).
- Limpiar también el estado derivado de la sesión (apoyos cargados, callback
  pendiente).
- Tras cerrar, `ClerkSync` no debe volver a reconstruir el perfil (no habrá
  sesión → no entra en su rama).

**Hecho cuando:** con sesión abierta, «Cerrar Sesión» deja `isSignedIn=false`
y el botón vuelve a ofrecer entrar.

## T6 · Sync offline sin pérdida — **agente-frontend** · ✅

Si el `POST` falla, el punto se guarda local (`AppContext.tsx:531-536`), pero
el primer `GET /api/points` exitoso **reemplaza la lista entera**
(`AppContext.tsx:367-375`) y reescribe `localStorage` → el reporte offline
desaparece.

**Hacer:**
- Merge por `id` (upsert) en puntos y necesidades: lo local que no está en el
  servidor se conserva, lo remoto actualiza lo local.
- Etiquetar los elementos locales sin confirmar (p. ej. `pending: true` en
  cliente) para poder reintentarlos o avisar de que siguen pendientes.

**Hecho cuando:** reportar con el servidor caído, levantarlo y refrescar → el
reporte sigue ahí (y si se perdió, el usuario lo sabe).

## T7 · Feedback visible de errores y éxitos — **agente-frontend** · ✅

Los fallos de publicación/likes van solo a `logger.warn`
(`AppContext.tsx:535,553,579,658`) y el like revierte **en silencio**
(`:657-660`): el usuario no entiende qué pasa.

**Hacer:**
- Toasts ligeros (un componente `Toast` + estado en contexto, sin dependencias
  nuevas): éxito al publicar, error al fallar, aviso al reverter un like.
- `aria-live="polite"` para lectores de pantalla.

**Hecho cuando:** simulado un fallo (servidor caído) aparece un aviso legible
y no solo lo de la consola.

## T8 · Identidad única en la UI — **agente-frontend** · ✅

Likes exigen sesión de Clerk (`BlogView.tsx:73-79`) mientras reportar/comentar
miran el flag local `isRegistered` (8 sitios). Con T1 en marcha, el servidor
responderá `401` a quien no tenga sesión → la UI debe hablar el mismo idioma.

**Hacer:**
- Toda escritura (reportar punto, publicar necesidad, comentar, apoyar)
  comprueba **sesión de Clerk**; sin sesión → `openSignIn()`/`AuthModal` y la
  acción **se reanuda al entrar** (reutilizar el mecanismo de callback
  `authCallback` que ya limpia `closeAuthModal`, `AppContext.tsx:234-244`).
- Manejar `401` de `ApiError` como el caso anterior (sesión caducada → avisar
  y reabrir el ingreso).
- El registro local del `AuthModal` sigue siendo el formulario de perfil
  (nombre, barrio, rol); si al terminar no hay sesión de Clerk, abrir
  `openSignUp()` de Clerk para completar la identidad.
- **No romper `npm run test:ui`**: sin sesión, «Reportar Ayuda» debe seguir
  abriendo el `AuthModal` (el test lo verifica).

**Hecho cuando:** sin sesión ninguna ruta de escritura llega a la BD, con
sesión todo funciona, y `npm run test:ui` sigue en verde.

---

## T0 · Verificación final — **agente-verificacion** · ✅

Se lanza cuando T1-T8 estén `✅`.
- `npm run lint`, `npx vite build`, `npm run test:ui`, `npm run verify:rls`.
- Humo de producción: `/api/health` 200, rutas de escritura sin sesión → 401,
  con sesión → 2xx, `/ruta-inexistente` → 404, comentarios persisten tras
  reiniciar.
- Revisar los logs de `memoria/` y consolidar incidencias en
  `docs/agentes/README.md` + informe final.

**Resultado (2026-09-30):** todo en verde y **sin bloqueantes** —
`lint` ✅ · `vite build` ✅ · `test:ui` ✅ 40/40 «TODO OK» · `verify:rls` ✅ 10
pasos · humo ✅ (200/404/gzip+immutable/no-cache/og:image de Cloudinary,
`/api/config` sin secretos) · T1 ✅ (401 anónimo en 5 rutas, 201 con identidad
del JWT y spoof ignorado, 409 duplicado) · T2 ✅ (comentario persiste tras
reiniciar) · T3 ✅ (1 → 1 → 2 → 0 = `count(*)`) · T4 ✅ (503×3, nunca 201) ·
T5–T8 ✅ por revisión de código. **9 riesgos no bloqueantes** (el principal:
`test:ui` no cubre T5–T8). Informe: `memoria/03-verificacion.md`.

## T9 · Despliegue en Vercel — **agente-backend** · ✅

Adaptar el proyecto a desplegar en **Vercel (plan Hobby, gratis)** sin romper
el despliegue actual (local, Docker, Cloud Run): Cloud Run se encareció y se
busca alternativa gratuita.

**Hacer:**
- `server/app.ts` con la app Express compartida (rutas, límites, 404 de
  `/api`), **sin** `vite` ni `express.static`; `server.ts` se queda con
  Vite/estáticos/`listen` y no cambia su comportamiento.
- `api/index.ts` exporta la app como *default* (patrón oficial de Vercel) y
  `vercel.json` (`framework: vite`, build → `dist`, rewrite
  `/api/:path* → /api`, caché de assets), validado contra el schema oficial.
- Documentación: sección «Despliegue en Vercel» en `README.md` con la tabla
  de variables, `.gitignore` con `.vercel/`, `.env.example` y entrada en
  `decisiones.md`.

**Hecho cuando:** `lint` + `vite build` + `test:ui` en verde, humo local
idéntico al anterior y humo de la función (`api/index.ts`) con las rutas de
uno y dos niveles respondiendo bien.

**Resultado (2026-09-29):** ✅ `lint` · `vite build` · `test:ui` 40/40 «TODO OK»
· humo local en :3125 (200/404+404.html/gzip+immutable/401) · humo de la
función en :3126 con `VERCEL=1` (9/9: health, config, points, needs,
comments, `/api/supabase/sql` 200, POST 401, `/api/xyz` 404 JSON) ·
`vercel.json` válido contra el schema oficial · cadena de imports de
`api/index.ts` sin `vite`. Detalle y riesgos en `memoria/04-vercel.md`.

## T10 · Una función Vercel por ruta — **agente-backend** · ✅

T9 desplegó **una sola** función Express (`api/index.ts` exporta la app):
toda la API comparte una instancia y el plan Hobby limita a 12 funciones
por deployment. Además, `api/index.ts` exportando la app impide que ese
fichero sirva para otra cosa.

**Hacer:**
- Extraer los cuerpos de ruta de `server/app.ts` a **núcleos
  framework-agnósticos** en `server/handlers/*.ts`: reciben un `ApiRequest`
  normalizado (método, path sin `/api`, headers, query, body, IP) y
  responden `{status, body}` o `null` si ya respondieron en el `res`
  (401/429/400/errores de BD). Ningún import de Express ni de Vercel.
- `server/app.ts` queda como **adaptador Express** (router montado en `/api`,
  conservando la línea `if (!process.env.VERCEL) app.use(compression());`).
- Una función por ruta en `api/*.ts` (`health`, `config`, `sql`, `points`,
  `needs`, `needs-support`, `support-mine`, `comments`, `chat`) envueltas por
  `createApiRoute` (`server/vercel.ts`), y `api/index.ts` como **fallback
  404 JSON** (ya no exporta la app).
- `vercel.json`: rewrites específicos **antes** del catch-all
  (`/api/supabase/sql`, `/api/support/mine`, `/api/needs/:id/support`,
  `/api/:path*`) aportando `_orig=<ruta canónica>`; sin `functions` ni
  `maxDuration`; validado contra el schema oficial.
- **Paridad obligatoria**: mismos status, cuerpos, cabeceras `RateLimit-*`
  y tope de 1 MB que el Express actual.

**Hecho cuando:** `lint` + `vite build` + `test:ui` en verde; matriz de
paridad local (Express nuevo) idéntica a la línea base; y la misma matriz
contra las funciones de `api/*.ts` idéntica, incluidos los 404 por método.

**Resultado (2026-09-30):** ✅ `lint` · `vite build` · `test:ui` 40/40 «TODO
OK» · matriz de 43 peticiones: **41/42 líneas byte a byte** con la línea
base pre-refactor (las 2 restantes: longitud aleatoria del chat con Gemini
en 503 y `ce=gzip` propio de compression) · matriz `--api-only` Express vs
funciones: idéntica salvo `ce=gzip` y chat · harness que emula el routing de
Vercel probado en 4 escenarios (destino, URL original, sin pre-parseo, sin
`:id` automático): **paridad exacta en los 4** · `vercel.json` válido contra
`openapi.vercel.sh` · sin `vite`/`express.static` en `server/`+`api/` (solo
el comentario de la advertencia) · servidores propios terminados. Detalle
en `memoria/05-funciones-vercel.md`.

## T13 · Remediación P1 Vercel — **agente-backend** · ✅

La verificación independiente T12 (`memoria/07-verificacion-t10.md`) encontró
dos P1, un P2, los KO de espejo y los gaps R5/R6. Cerrarlos **sin romper la
paridad** Express ↔ funciones.

**Hacer:**
- **P1-1** · `readJsonBody` dentro del `try/catch` de `createApiRoute`
  (y propio dentro de la función): JSON malformado → **400**
  `{"error":"JSON inválido en el cuerpo de la petición."}`, no 500 ni colgado.
- **P1-2** · `POST /api/needs/:id/support` debe funcionar en el primer
  deploy: rewrite con `&id=:id` **explícito** + `resolveNeedId` path-primero
  que solo acepta `query.id` vía rewrite.
- **P1-3** · el chat debe cargar el contexto de Supabase (nunca servir la
  semilla): `server/context.ts` con TTL 30 s, llamada en el núcleo y
  `warmContext()` en `api/chat.ts`.
- **P2** · unificar los `details` cuando no llega `content-type: json`
  (`{}` igual que body-parser, no `undefined`).
- **KO-1/KO-2** · bloquear los espejos de filesystem (`/api/support-mine`,
  `/api/needs-support`) → **404** como Express, con el flag `rewritten`.
- **R5** · `.github/workflows/ci.yml`: lint + build + test:ui + humo, con
  `verify:rls` solo si cambió `supabase/schema.sql`.
- **R6** · `scripts/smoke-vercel.mjs` + `npm run smoke:vercel` (35 checks;
  `SMOKE_BASE_URL` contra un deploy real).
- **README** · nota de rate limit (límites por función vs límite global de
  Express) y espejos ya bloqueados.

**Hecho cuando:** `lint` + `vite build` + `test:ui` 40/40 en verde;
`smoke:vercel` 35/35; `vercel.json` válido contra el schema oficial; humo de
Express en 3140 con los mismos status/cuerpos que las funciones.

**Resultado (2026-09-30):** ✅ `lint` exit 0 · `vite build` `✓ built in 392ms`
· `test:ui` **40/40 «TODO OK»** · `smoke:vercel` **35 comprobaciones · 0
fallos** · `vercel.json` **VÁLIDO** (4 rewrites en orden, 10 funciones ≤ 12)
· YAML del CI: 10 steps · Express en **3140**: JSON malformado → 400, apoyo
sin sesión → 401, chat sin sesión → 200 (igual que antes), espejos → 404,
`/api/xyz` → 404 JSON · PID 607589 (3124) intacto · `verify:rls` n/a (sin
cambios en `schema.sql`). **Pendiente de un deploy real:** P1-1, P1-2 y KO-3
se cierran con `SMOKE_BASE_URL=https://<app>.vercel.app npm run smoke:vercel`.
Detalle en `memoria/08-remediacion-p1.md`.

T14 · Re-verificación T13 — agente-verificacion — ✅
