# Log — frontend (2026-09-29)

## En qué trabajé
- Tareas del tablero: **T5** (cerrar sesión de verdad), **T6** (sync offline
  sin pérdida), **T7** (feedback visible de errores y éxitos) e **T8**
  (identidad única en la UI). Todas dentro de `src/**`; no toqué
  `server.ts`, `server/**`, `supabase/**` ni `scripts/**`.

## Cambios realizados

### T5 · Cerrar sesión de verdad
- `src/context/AppContext.tsx:547` → `logoutUser` ahora limpia **todo** el
  estado derivado de la sesión: `supportedNeedIds`, `pendingWrite` (cola de
  escrituras), `authCallback`, el modal de registro y el perfil local
  (`INITIAL_USER_PROFILE`); después llama a `signOut()` de Clerk **solo si
  había sesión** (`isSignedIn`), y si no, avisa con toast y se queda en lo
  local (como antes).
- El `.finally` de `signOut()` vuelve a poner el perfil y los apoyos en su
  valor inicial: cierra la ventana en la que `ClerkSync` (que sigue viendo
  `isSignedIn` durante el cierre) podría reconstruir el perfil
  (`src/context/ClerkSync.tsx`).
- Sin sesión de Clerk no hay nada que reconstruir en `ClerkSync`, así que el
  requisito «tras cerrar no debe volver a marcar `isRegistered: true`» se
  cumple por el propio cierre + el `.finally`.

### T6 · Sync offline sin pérdida
- `src/utils/sync.ts:29` → nuevo `mergeById(local, remote, seedIds)`:
  upsert por `id`, gana lo remoto; lo local que no aparece en el servidor se
  **conserva** (lo `pending` primero, luego el resto que no sea semilla); los
  IDs semilla que el servidor omite se descartan (semillas locales ≠ de BD:
  impedía duplicar los puntos oficiales); si la respuesta remota viene vacía
  o corrupta se conserva la lista local.
- `src/utils/sync.ts:46` → `countPending` para el contador de elementos sin
  confirmar.
- `src/types/index.ts:18` → `pending?: boolean` opcional en `HelpPoint`,
  `HelpNeed` y `PointComment` (marcador de «creado aquí, el servidor aún no
  lo ha confirmado»).
- `src/context/AppContext.tsx:657-663` (efecto de sync) → ahora hace merge con
  `mergeById` en puntos, necesidades y comentarios en lugar de reemplazar la
  lista entera; el intervalo de 60 s solo re-petición `GET` mientras falle
  el último sync o haya `pendingCount > 0`, así la app se recupera sola de
  una caída sin recargar (`AppContext.tsx:678`).
- `src/context/AppContext.tsx:724,737,745` → `confirmPoint/confirmNeed/
  confirmComment`: cuando el servidor acepta un elemento local se adopta su
  versión (id real, contadores reales) y se retira `pending`; si el id
  cambió se reescriben también `selectedPoint/Need`,
  `reportedPointIds` y `savedPointIds`.
- `src/context/AppContext.tsx:762-778` (efecto de reenvío) → reintento
  automático de lo `pending` mientras `serverReachable && sesión de Clerk`;
  máximo `MAX_SYNC_ATTEMPTS = 3` por elemento y sesión
  (`syncAttemptsRef`), con `inflightIdsRef` evitando duplicar un POST que
  ya está en vuelo.
- `src/context/AppContext.tsx:698-713` → avisos de estado: «N publicaciones
  siguen sin confirmarse» al aparecer pendientes y «Ya está todo
  sincronizado con el servidor» al confirmarse todos (uno por bloque, no
  por elemento).

### T7 · Feedback visible de errores y éxitos
- `src/components/Toast.tsx` (nuevo) → `Toast` + `ToastRegion`: contenedor
  único con `aria-live="polite"`, botón «Cerrar aviso» por toast, máximo 3
  simultáneos y auto-cierre a los 6 s (`AppContext.tsx:151-153`).
- `src/App.tsx:97` → se monta `<ToastRegion />`.
- `src/context/AppContext.tsx:246,255` → `notify(message, kind)` y
  `dismissToast(id)` en el contexto; dedupe por mensaje (los reintentos
  repiten el mismo texto) y cola recortada a `MAX_TOASTS`.
- Avisos conectados: éxito al publicar punto/necesidad/comentario
  (`AppContext.tsx:1035,1082,1138`), error si el servidor no lo acepta
  (`handlePublishError`, `AppContext.tsx:463`), aviso al revertirse un like
  (`AppContext.tsx:1245`) y avisos de identidad (`handleUnauthorized`,
  `AppContext.tsx:456`).
- `AppContext.tsx:403` → al **cambiar** de estado la conexión se avisa una
  sola vez: «Sin conexión con el servidor…» (error) / «Conexión con el
  servidor restablecida…» (éxito). Solo en la transición para no repetir
  el mensaje en cada sync de 60 s.

### T8 · Identidad única en la UI
- `src/context/AppContext.tsx:436` → `ensureIdentity(build, resumes,
  message)`: **única puerta de entrada** de las escrituras. Con sesión de
  Clerk pasa; sin ella guarda la acción en `pendingWrite` (`queueWrite`,
  `AppContext.tsx:291`) y abre `AuthModal` (perfil local sin registrar) u
  `openSignIn()` (ya registrada). Se invoca en `addHelpPoint` (:991),
  `addHelpNeed` (:1049), `addPointComment` (:1101) y `supportNeed` (:1179).
  Sin sesión **no se escribe ni en el servidor ni en `localStorage`**.
- Reanudación: efecto `AppContext.tsx:573` ejecuta la escritura guardada en
  cuanto hay sesión; con TTL de 10 min (`PENDING_WRITE_TTL_MS`), máximo 1
  reanudación automática (`MAX_WRITE_RESUMES`) y consumo atómico vía
  `consumedWriteRef` (evita doble ejecución en StrictMode).
- `src/context/AppContext.tsx:392` → nuevo `completeAuthModal`: cierra el
  modal **conservando** la escritura (registro local → `openSignUp()`), y
  `closeAuthModal` (:376) sigue descartándola al cancelar. `AuthModal`
  recibe `onDismiss={completeAuthModal}` (`src/App.tsx:89`).
- `src/components/AuthModal.tsx:102` → al terminar el registro local, si no
  hay sesión de Clerk se abre `openSignUp()` para completar la identidad
  (prop `onDismiss`, `:19`).
- `401` (`ApiError.status === 401`, T1 del backend) → `handleUnauthorized`:
  toast + reabre el ingreso con enfriamiento de 5 s, y lo `pending` se
  conserva para reintentar (`AppContext.tsx:456,1241-1242`).
- `src/components/BlogView.tsx:76` → los likes ya no comprueban sesión por
  su cuenta: delegan en `supportNeed` (la puerta está en un solo sitio).
- `src/context/AppContext.tsx:1005` → los puntos nuevos nacen con
  `verified: false` (decisión 2026-09-28, coherente con T1).

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ (0 errores; `server.ts` ya también limpio) |
| `npx vite build` | ✅ (built in 527ms, todos los chunks) |
| `npm run test:ui` | ✅ (40/40, «TODO OK», sin tocar el test) |
| `npm run verify:rls` | n/a (no toqué `supabase/**`) |

## Decisiones tomadas (y por qué)
- **`pending` solo se pone cuando hay sesión que vaya a confirmarlo**: una
  acción guardada por falta de identidad (T8) no cuenta como «pendiente de
  sync» hasta que se reanuda; así el contador y los avisos no mienten.
- **Merge con descarte de semillas**: los IDs de ejemplo locales no son los
  de la BD, así que si el servidor no los trae se eliminan (evita duplicar
  puntos oficiales en el mapa). Lo local *no semilla* sí se conserva.
- **Reintentos limitados a 3 por elemento y sesión** + `inflightIds`: evita
  martillear el servidor y duplicar publicaciones si el backend devuelve
  errores permanentes.
- **Avisos por transición, no por evento**: los toasts de conexión solo
  saltan al cambiar de estado (y los de pendiente, una vez por bloque) para
  que el refresco de 60 s no genere spam.
- **Los gates de entrada no se tocaron**: `Header`, `MapView`, `BlogView` y
  `ReportModal` siguen mirando `userProfile.isRegistered` (lo exige el
  test); la exigencia real de sesión vive dentro de las funciones de
  escritura, que es donde está el dato fiable.
- **`completeAuthModal` vs `closeAuthModal`**: cancelar descarta la acción
  en cola; completar el flujo de registro/ingreso la conserva. Reproduce el
  patrón del `authCallback` que ya validaba el test.

## Riesgos y deuda que dejo
- Lo local no semilla que el servidor nunca confirme (p. ej. rechazado con
  4xx) sigue `pending` para siempre tras agotar los 3 intentos: se ve en el
  mapa y mantiene el aviso «sigue sin confirmarse». Si el backend empieza a
  responder 409/400 a duplicados, convendría retirar la marca en ese caso.
- Un like apoyado sin sesión queda en cola; si la persona cierra el modal
  con «Cancelar» se descarta (comportamiento deseado), pero si se va sin
  entrar, al volver a entrar se reanuda una sola vez (TTL 10 min).
- `openSignUp()` puede superponerse al reportero si el usuario ya tenía el
  `ReportModal` abierto; solo se abre al terminar el registro local, así que
  es un caso de borde.
- `reportedPointIds`/`savedPointIds` pueden conservar el id local temporal
  de un punto reenviado por el efecto de reenvío (el remapeo de id solo
  está en la publicación directa, `confirmPoint`).
- Asumo el contrato T1 del backend: `401` en `POST /api/points|/needs|
  /comments` y en `/api/support`, con `Authorization: Bearer <getToken()>`.

## Para el siguiente agente
- Si tocas `AppContext.tsx`, ojo con los efectos que dependen de
  `helpPoints/helpNeeds/pointComments`: cada render nuevo re-evalúa el
  reenvío de pendientes; usa `inflightIdsRef`/`syncAttemptsRef` para no
  duplicar POSTs.
- Los avisos salen por `notify(msg, kind)` del contexto; no hace falta un
  componente nuevo, `ToastRegion` ya está montado en `App.tsx`.
- El test `scripts/test-authmodal.mjs` no se tocó y sigue siendo la red de
  seguridad: sin sesión, «Reportar Ayuda» debe abrir `AuthModal` y
  `closeAuthModal` debe seguir conteniendo `setAuthCallback(null)` +
  `setIsAuthModalOpen(false)` (se verifica por regex sobre el fuente).
- Al final de la semana T0 (agente-verificacion) lanza la verificación
  global, incluido `npm run verify:rls` (no aplica para `src/**`).
