# Log — verificación (2026-09-30, UTC)

## En qué trabajé
- **T0 · Verificación final e informe consolidado** de la semana 1 (T1–T8).
- Rol de solo reporte: **no toqué ningún fichero de código** (`server.ts`,
  `server/**`, `supabase/**`, `scripts/**`, `src/**`), no hice `git commit` y
  no modifiqué `.env`. Únicos ficheros escritos: este log y mi fila T0 en
  `tareas-semana-1.md`.
- Herramientas de la batería: un script de comprobación propio fuera del repo
  (`/tmp/opencode/t0/verify.mjs`, 55 comprobaciones: 41 OK, 0 FAIL) que solo
  hace HTTP contra el servidor, la API REST de Supabase (service_role) y la
  API de Clerk, con los datos de prueba **borrados al terminar**.

## Cambios realizados
- `docs/agentes/memoria/03-verificacion.md` → este informe.
- `docs/agentes/tareas-semana-1.md` → T0 `⬜` → `✅`.
- Nada más. El entorno se devolvió como estaba: servidor del backend en
  **PID 607589 / puerto 3124** sigue vivo (health 200), mis servidores de
  prueba (3125, 3126) están muertos, `.env` intacto y sin restos T0 en
  Supabase (`help_points` 5 · `help_needs` 4 · `point_comments` 0 ·
  `need_supporters` 1, todos semilla).

## Verificación ejecutada

### Estática
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ `tsc --noEmit` sin errores (EXIT 0) |
| `npx vite build` | ✅ `✓ built in 521ms`, 1747 módulos, chunks completos |
| `npm run test:ui` | ✅ **40/40 «TODO OK»** (cuenta real de comprobaciones `OK`: 40) |
| `npm run verify:rls` | ✅ **10 pasos** → `RESULTADO: esquema y politicas RLS correctas [OK]` |

### Humo de producción (`http://localhost:3124`, proceso del backend PID 607589)
| Petición | Resultado |
| --- | --- |
| `GET /api/health` | **200** `{"status":"ok"}` |
| `GET /` | **200** · `og:image = https://res.cloudinary.com/z2t43npi/image/upload/…/og_ayudaencali` · `cache-control: no-cache, must-revalidate` · `content-encoding: gzip` |
| `GET /api/config` | **200** con `clerkPublishableKey: pk_test_…` · **sin secretos** |
| `GET /ruta-inexistente` | **404** real con página propia (`<title>Página no encontrada (404) — AyudaEnCali</title>`), `no-cache` |
| `GET /assets/index-D9f5KGsf.js` | **200** · `content-encoding: gzip` · `cache-control: public, max-age=31536000, immutable` · `vary: Accept-Encoding` |
| `GET /assets/index-CHIsnSZf.css` | **200** · `content-encoding: gzip` · `immutable` |

Escaneo de fugas: el valor de `CLERK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`,
`CLOUDINARY_URL` y `CARTO_API_KEY` **no aparece** en `/api/config`, `/` ni
`/ruta-inexistente` (comparado directamente contra `.env`, sin imprimir los
valores). `/api/config` solo expone `supabaseUrl` (host público),
`hasGeminiKey`/`cartoConfigured` (booleanos) y la clave publicable de Clerk.

### Contrato T1 · escrituras autenticadas
| Prueba | Resultado |
| --- | --- |
| `POST /api/points` sin sesión | **401** `Debes iniciar sesión para reportar un punto de ayuda.` |
| `POST /api/needs` sin sesión | **401** |
| `POST /api/comments` sin sesión | **401** |
| `POST /api/needs/:id/support` sin sesión | **401** |
| `GET /api/support/mine` sin sesión | **401** |
| `POST /api/points` con sesión de Clerk | **201**, `authorId = user_…` = `sub` del JWT |
| `POST /api/needs` con sesión | **201** |
| `POST /api/comments` con sesión | **201**, `userId = user_…` = `sub` del JWT |
| Spoof `authorId:'usr-spoofed-t0'`, `verified:true` en el cuerpo | **ignorado**: respuesta y **BD** con `author_id = user_…` y `verified = false` |
| Spoof `userId:'usr-spoofed-t0'` en comentario | **ignorado**: `point_comments.author_id = user_…` en BD |
| `POST /api/points` id duplicado | **409** + log `Escritura rechazada (el punto): identificador duplicado` |
| `POST /api/needs` id duplicado | **409** |

Sesión de Clerk creada como indica `01-backend.md` (`POST /v1/users` →
`POST /v1/sessions` → `POST /v1/sessions/{id}/tokens`, sin 2º factor); los dos
usuarios de prueba se **borraron** (`DELETE /v1/users/…`).

### T2 · comentarios persisten tras reinicio
Se usó una instancia **propia en el puerto 3125** (misma BD) para no
interferir con el servidor del backend en 3124:
1. Arranque → `POST /api/comments` autenticado → **201** (`comm-95688a18-…`).
2. `SIGTERM` del proceso → arranque de nuevo → `GET /api/comments?pointId=…` →
   **el comentario sigue ahí** (`createdAt=2026-09-30T03:24:23.092+00:00`,
   leído de `point_comments`).
3. Fila confirmada también directamente en `point_comments`.
4. Comentario borrado al terminar.

### T3 · contador de apoyos (sobre necesidad creada para la prueba)
| Acción | `count` devuelto | `count(*)` real en BD |
| --- | --- | --- |
| A `add` | 1 | — |
| A `add` otra vez (idempotente) | **1** | — |
| B `add` (2.º usuario) | **2** | `need_supporters = 2`, `help_needs.supporters_count = 2` |
| A `remove` | 1 | — |
| B `remove` | **0** | `need_supporters = 0` |

Sin pérdida del segundo apoyo y contador = verdad de BD (RPC
`toggle_need_support`, sin fallback: no apareció ningún aviso de respaldo en
el log).

### T4 · errores de BD
Proceso **con env temporal** `SUPABASE_URL=http://127.0.0.1:9` en el puerto
3126 (`.env` sin tocar):
| Escritura | Resultado |
| --- | --- |
| `POST /api/points` | **503** (nunca 201) |
| `POST /api/needs` | **503** (nunca 201) |
| `POST /api/comments` | **503** (nunca 201) |
| Log del servidor | `ERROR Escritura fallida (el punto): TypeError: fetch failed` |
| Filas coladas en la BD | **0** |

### T5–T8 · revisión de código (`src/**`) + cobertura
| Tarea | Evidencia (fichero:línea) | Estado |
| --- | --- | --- |
| T5 `signOut` real | `src/context/AppContext.tsx:547-570` (`logoutUser` limpia `supportedNeedIds`, `pendingWrite`, `authCallback`, modal, perfil → `signOut()` solo si `isSignedIn`, `.finally` re-limpia); `src/components/Header.tsx:143,157` (botón según `isSignedIn`); `src/components/ProfileView.tsx:175`; `src/components/ClerkSync.tsx:45-48` no reconstruye sin sesión (el perfil inicial `id:''` no empieza por `user_` → sin bucle) | ✅ por código |
| T6 merge/pending | `src/utils/sync.ts:29` (`mergeById`: remoto gana, lo local se conserva, semillas descartadas, lista vacía ⇒ se conserva local), `:46` (`countPending`); `src/context/AppContext.tsx:657-665` (merge en el sync), `:678` (reintento de sync), `:724,737,745` (`confirm*` retiran `pending`), `:762-800` (reenvío con `MAX_SYNC_ATTEMPTS=3`, `inflightIdsRef`, solo con sesión), `:1003,1061,1118` (`pending: true`), `:698-713` (avisos «siguen sin confirmarse» / «todo sincronizado»), `:155-159` (TTL 10 min, 1 reanudación, 3 intentos) | ✅ por código |
| T7 toasts + `aria-live` | `src/components/Toast.tsx:74-76` (`role="status" aria-live="polite" aria-atomic`), `:44` (etiqueta `sr-only`), `:51` («Cerrar aviso»); montado en `src/App.tsx:97`; `notify`/`dismissToast` en `AppContext.tsx:246,255`; avisos en publicación (`:1035,1082,1138`), fallo (`handlePublishError`, `:463`), like revertido (`:1245`), identidad (`handleUnauthorized`, `:456`), transición de conexión (`setReachable`, `:403`) | ✅ por código |
| T8 identidad única | `ensureIdentity` (`AppContext.tsx:436-449`) invocado en los 4 writes (`:991,1049,1101,1179`); reanudación (`:573-594`, consumo atómico con `consumedWriteRef`); `completeAuthModal`/`closeAuthModal` (`:376,392`, montado en `App.tsx:86-89`); `AuthModal.tsx:102` → `openSignUp()` si no hay sesión; `401` → `handleUnauthorized` (`:456`, usado en `:464,792,1238`) con toast + reapertura de ingreso; token en `Authorization` en puntos/necesidades/comentarios/apoyos (`:1032,1079,1135,1219`); `BlogView.tsx:76` delega en `supportNeed` | ✅ por código |
| Cobertura de `test:ui` sobre T5–T8 | **0 menciones** de `signOut`, `mergeById`, `Toast`, `ensureIdentity`, `aria-live` o `pendingWrite` en `scripts/test-authmodal.mjs` | ⚠️ **no cubierto** (ver riesgos) |

## Decisiones tomadas (y por qué)
1. **El test de persistencia (T2) se hizo en el puerto 3125** en lugar de
   reiniciar el 3124: es la misma BD, así que demuestra la persistencia igual,
   y evita matar el proceso que dejó agente-backend (que sigue vivo al
   terminar, PID 607589).
2. **Apoyos probados con dos usuarios distintos** (no solo repetir `add`): es
   la única forma de comprobar el criterio «dos apoyos simultáneos no pierden
   el segundo»; además se cruzó con `count(*)` real vía la REST de Supabase.
3. **Escaneo de secretos por comparación directa contra `.env`** (sin imprimir
   valores) en `/api/config`, `/` y la 404, en lugar de mirar solo las claves
   del JSON.
4. **Limpieza propia y verificable**: los IDs/usuarios de prueba se guardaron
   en `/tmp/opencode/t0/state.json` (0600) y se borraron en un `finally`; la
   verificación final de «sin restos T0» está dentro del propio script.

## Riesgos y deuda que dejo
- **Ningún bloqueante.** No he encontrado ni un solo fallo en la batería:
  41/41 comprobaciones OK y las 4 comprobaciones estáticas en verde.

### Hallazgos no bloqueantes (con fichero:línea y arreglo sugerido)
1. **T5–T8 sin red de regresión automática** — `scripts/test-authmodal.mjs`
   no menciona `signOut`, `mergeById`, `Toast`, `ensureIdentity`, `aria-live`
   ni `pendingWrite`; solo cubre el flujo `AuthModal` y regexes de
   `App.tsx`/`server.ts`/`index.html`. Un refactor fututo de `AppContext.tsx`
   puede romper T5–T8 y `test:ui` seguiría en verde.
   *Arreglo sugerido:* añadir 4-6 comprobaciones por regex sobre el fuente
   (patrón ya usado en el propio fichero) para `signOut(`, `mergeById(`,
   `aria-live="polite"` y `ensureIdentity(`.
2. **La vitrina sigue suplantable** — `server/validation.ts:220-223` acepta
   `userName`, `userRole` y `userBarrio` del cuerpo: cualquiera puede
   publicarse «coordinador» (la identidad `user_id`/`author_id` sí sale del
   JWT, verificado). *Arreglo sugerido (semana 2):* derivar nombre y rol del
   perfil de Clerk en el servidor o validar el rol contra la BD.
3. **IDs de escritura generados en el cliente** —
   `src/context/AppContext.tsx:1002` (`cali-point-${Date.now()}`), `:1060`
   (`cali-need-…`), `:1111` (`comm-…`): dos publicaciones de usuarios
   distintos en el mismo milisegundo → una recibe **409** (antes: colisión
   silenciosa). *Arreglo sugerido:* pasar a `crypto.randomUUID()` en cliente y
   dejar que el servidor acepte ambos formatos (el validador ya lo permite).
4. **T1 solo cubre puntos y comentarios** — `help_needs` no tiene columna de
   autor (decisión 6 de `01-backend.md`): una necesidad publicada queda sin
   `author_id` en BD, imposible de moderar/atribuir. *Arreglo sugerido:*
   migración `help_needs.author_id` en la semana 2 (moderación).
5. **`point_comments` sin FK a `help_points`** — `supabase/schema.sql:85-100`:
   si un punto se borra, sus comentarios quedan huérfanos. *Arreglo sugerido:*
   `FOREIGN KEY (point_id) REFERENCES help_points(id)` (los puntos hoy no se
   borran, por eso no es urgente).
6. **Fallback de apoyos limitado** — `server.ts:539` recuenta con
   `limit(10_000)`: con la función RPC instalada (`npm run db:setup`, ya
   instalada) no se usa; si un despliegue la pierde y hay >10 000 apoyos, se
   subestima. *Arreglo sugerido:* recuento con `count` de PostgREST
   (`select=id&head=true&count=exact`).
7. **Un `pending` rechazado con 4xx se queda «para siempre»** —
   `src/context/AppContext.tsx:762-800`: tras `MAX_SYNC_ATTEMPTS = 3` el
   elemento deja de reenviarse pero conserva `pending`, y el aviso «N
   publicaciones siguen sin confirmarse» no se retira (deja anotada por
   agente-frontend). *Arreglo sugerido:* retirar la marca `pending` (y avisar)
   cuando el servidor responde 409/400 de forma permanente.
8. **Inexactitud en los logs de los otros agentes**: ambos referencian
   `src/context/ClerkSync.tsx`, pero el fichero está en
   **`src/components/ClerkSync.tsx`** (`01-backend.md`, `02-frontend.md`).
   Solo afecta a quien siga esas referencias.
9. **Cosmético**: al cerrar sesión desde Clerk (o caducar), `ClerkSync.tsx:46`
   llama a `logoutUser()` → puede emitir el toast «Sesión cerrada.»
   (`AppContext.tsx:556-559`) fuera del botón. Sin efecto funcional.

### Deuda consolidada de los dos agentes (ya documentada por ellos)
- Frontend: `reportedPointIds`/`savedPointIds` pueden conservar el id local
  tras un reenvío con id nuevo (remapeo solo en publicación directa);
  `openSignUp()` puede superponerse al reportero (caso de borde).
- Backend: `help_needs` sin autor (arriba), fallback de apoyos con tope de
  10 000, `point_comments` sin FK, nombres/roles de vitrina, contadores
  semilla que convergen al `count(*)` real en el primer apoyo (decisión
  buscada, pero visible).
- Ambos: la RCA de la identidad dual (perfil local vs Clerk) sigue abierta;
  el servidor ya solo confía en el JWT, pero la UI mantiene dos fuentes.

## Para el siguiente agente
- **La semana 1 se puede dar por cerrada.** No hay incidencias bloqueantes.
- El servidor de producción sigue en **PID 607589 / :3124** (matar y
  relanzar con `NODE_ENV=production PORT=3124 node --import tsx server.ts`).
- Si alguien toca `AppContext.tsx` o `Toast.tsx`, recuerda que `test:ui`
  **no** lo cubre: revisa los puntos de la tabla T5–T8 de arriba a mano.
- El esquema de Supabase real está aplicado (`point_comments` +
  `toggle_need_support`) y `verify:rls` lo sigue validando en 10 pasos.
