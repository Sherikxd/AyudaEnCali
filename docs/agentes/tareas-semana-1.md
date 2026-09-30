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
