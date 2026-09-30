# Log — backend (2026-09-30)

## En qué trabajé

- **T1** · Escrituras autenticadas (`POST /api/points`, `/api/needs`, `/api/comments`).
- **T2** · Comentarios persistidos en tabla nueva `point_comments`.
- **T3** · Contador de apoyos atómico (RPC de Postgres, sin escritura desde caché).
- **T4** · Comprobación de `error` en todos los inserts/updates (409 / 503) e IDs con `randomUUID()`.

No toqué `src/**` (agente-frontend, en paralelo).

## Cambios realizados

### `server.ts`

- `server.ts:6` → import de `randomUUID` desde `node:crypto`.
- `server.ts:151-180` → helper nuevo `respondWriteFailure(res, label, error)`: `23505`/«duplicate key» → **409**, cualquier otro fallo de BD → **503**; siempre escribe el detalle en el log (`logger.warn` / `logger.error`). Sustituye el «201 aunque falle».
- `server.ts:265-315` → `POST /api/points`: `getAuthenticatedUser(req)` **antes** de validar → `401` con `respondUnauthorized` sin sesión; `authorId` se sobrescribe con `user.userId` (el del cuerpo se ignora); `verified: false`; id `cali-point-${randomUUID()}`; el insert se comprueba → si falla, `respondWriteFailure` y **no** se mete en la caché; caché y `201` solo si la escritura se confirmó (o no hay BD configurada).
- `server.ts:340-385` → `POST /api/needs`: mismo patrón (401 / 409 / 503, id `cali-need-${randomUUID()}`). Este payload no lleva campos de identidad, así que la identidad del creador queda fuera del alcance (ver «Decisiones»).
- `server.ts:435-585` → `POST /api/needs/:id/support`: fuera la escritura absoluta `supporters_count = target.supportersCount`; ahora
  1. RPC `toggle_need_support` (insert/borrado + `count(*)` en la misma transacción) → devuelve el recuento real;
  2. si la BD responde pero la función no existe (esquema viejo, error no transitorio): insert/borrado directo + recuento real de `need_supporters` + `update` con ese valor;
  3. sin BD o red caída: toggle local en memoria (último recurso ya documentado en `decisiones.md`).
  Si el recuento no se puede confirmar tras escribir, responde **503** en lugar de un éxito inventado.
- `server.ts:596-628` → `GET /api/comments`: ahora lee de `point_comments` (orden `created_at DESC`, límite 500) y guarda en la caché; si Supabase falla o la tabla está vacía, responde con la caché (mismo patrón que `/api/points`). **La forma de la respuesta sigue siendo `{ comments: [...] }`.**
- `server.ts:630-672` → `POST /api/comments`: `401` sin sesión, `userId` **solo del JWT**, id `comm-${randomUUID()}`, insert en BD comprobado (409/503), caché y `201` solo tras confirmar.

### `server/supabase.ts`

- `:237-242` → `SCHEMA_PROBES` incluye `point_comments` → el sondeo detecta la tabla nueva y dispara el auto-aplicado del esquema (así nació la tabla y la función en el Supabase real).
- `:113` → `classifySupabaseError` trata como `missing` también «could not find the function» (antes solo «table»).
- `:140-146`, `:189`, `:327` → pistas de `/api/config` y log de OK mencionan las 4 tablas.
- `:522-559` → `PointCommentRow`, `mapCommentRow` y `toCommentRow` (fila `point_comments` ↔ `PointComment`).

### `supabase/schema.sql`

- `:38-42` → `help_points.verified` pasa a `DEFAULT false` (idempotente con `ALTER COLUMN … SET DEFAULT`, no toca filas existentes): un reporte nace sin verificar también si algún INSERT no lo manda.
- `:85-100` → tabla `point_comments` (`id`, `point_id`, `author_id`, `author_name`, `author_role`, `author_barrio`, `body`, `created_at`) + índice `(point_id, created_at DESC)`.
- `:106` → `ALTER TABLE point_comments ENABLE ROW LEVEL SECURITY` **sin políticas** (mismo patrón que `need_supporters`).
- `:180-227` → función `toggle_need_support(p_need_id, p_user_id, p_action)`: bloquea la necesidad (`FOR UPDATE`, serializa apoyos simultáneos), `INSERT … ON CONFLICT DO NOTHING` / `DELETE`, recalcula `supporters_count = count(*)`, devuelve el recuento (o `NULL` si la necesidad no existe). `REVOKE … FROM PUBLIC` + `GRANT … TO service_role`.
- `:69-76` → comentario de `need_supporters` actualizado: `supporters_count` es un contador materializado que recalcula la función.

### `scripts/verify-rls.sh`

- `:55` → crea también el rol `service_role` (el `GRANT` del esquema lo exige).
- `:91-104` → RLS comprobado en **las cuatro** tablas y `point_comments` sin políticas.
- `:188-207` → paso 8: `point_comments` solo lo escribe/lee el backend.
- `:209-241` → paso 9: la función devuelve y guarda el `count(*)` real, `add` idempotente, `remove` a 0, `NULL` si no existe la necesidad.
- `:243-252` → paso 10: `anon` y `authenticated` **no** pueden ejecutar la función.
- El recuento de políticas sigue en **6** (no se añadió ninguna).

### `scripts/apply-schema.ts`

- `:1-14` → docstring: aclara que aplica `supabase/schema.sql` completo (las 4 tablas + índices + RLS + `toggle_need_support`). **No hay DDL duplicado**: el único `CREATE TABLE IF NOT EXISTS point_comments` vive en `supabase/schema.sql`, que es lo que ejecuta `npm run db:setup`.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ (tsc estricto, sin errores) |
| `npx vite build` | ✅ («✓ built in 641ms») |
| `npm run test:ui` | ✅ **TODO OK** (40 comprobaciones) |
| `npm run verify:rls` | ✅ «RESULTADO: esquema y politicas RLS correctas [OK]» (10 pasos) |
| `npm run db:setup` | ✅ «[OK] esquema aplicado con la Management API (HTTP 201)» |

Re-verificación final (tras reiniciar el servidor en :3124 con el código ya
editado, 2026-09-30): `lint` ✅ · `vite build` ✅ · `test:ui` ✅ **TODO OK** ·
`verify:rls` ✅ (10 pasos) · humo 200/401/401/401/404 ✅ · autenticado **11/11**
· comentario persiste tras reinicio ✅ · BD caída → 503 ✅. Datos y usuario de
prueba borrados de nuevo al terminar.

Humo de producción (`NODE_ENV=production PORT=3124`, proceso mío):

| Petición | Resultado |
| --- | --- |
| `GET /api/health` | **200** |
| `POST /api/points` (sin sesión) | **401** |
| `POST /api/needs` (sin sesión) | **401** |
| `POST /api/comments` (sin sesión) | **401** |
| `GET /ruta-inexistente` | **404** |

Pruebas autenticadas (11/11 OK) con un JWT real de Clerk (usuario de prueba
creado para ello y **borrado al terminar**; datos de prueba borrados de
Supabase):

| Prueba | Resultado |
| --- | --- |
| `POST /api/points` con sesión | **201**, `authorId = user_…` (el `authorId: "usr-spoofed"` del cuerpo se ignora), `verified=false` |
| `POST /api/needs` con sesión | **201** |
| `POST /api/comments` con sesión | **201**, `userId = user_…` (ignora el del cuerpo) |
| `POST /api/points` con id ya existente | **409** (y el log: `Escritura rechazada (el punto): identificador duplicado — 23505 …`) |
| Apoyar / repetir `add` / `remove` | recuentos reales **1 → 1 → 0** (vía RPC, sin avisos de fallback) |
| Reiniciar servidor y `GET /api/comments?pointId=…` | el comentario sigue ahí (leído de `point_comments`, `created_at` de Postgres) |
| Servidor con `SUPABASE_URL` inalcanzable | `points`/`needs`/`comments` → **503** (nunca 201) + `ERROR Escritura fallida (…): TypeError: fetch failed` en el log |

## Decisiones tomadas (y por qué)

1. **`point_comments` guarda también `author_role` y `author_barrio`** además de las columnas que lista el tablero. Si no, al relevar el servidor se perderían el rol y el barrio y `GET /api/comments` dejaría de devolver `PointComment` completo. No cambia la forma de la respuesta.
2. **Recuento = `count(*)` literal** (lo que pide T3): el contador de las necesidades semilla (p. ej. `need-1` con 19) convergirá al número real de filas de `need_supporters` en el primer apoyo. Es el comportamiento pedido en `decisiones.md`; el «19» visible hoy era una cifra de memoria.
3. **IDs `cali-point-<uuid>` / `cali-need-<uuid>` / `comm-<uuid>`**: `randomUUID()` para que no colisionen (`Date.now()` sí lo hacía) y prefijo `cali-*` para seguir distinguiendo los IDs semilla, que siguen funcionando (clave `TEXT`).
4. **RPC + fallback**: la RPC es el camino normal; si la función aún no está en la BD (despliegue desordenado) se hace insert directo + recuento desde la tabla (nunca desde la caché). Un fallo transitorio (red caída) va directo a la caché: es el «último recurso» que ya exige `decisiones.md`.
5. **`REVOKE EXECUTE … FROM PUBLIC`** en la función: aunque `anon`/`authenticated` llegaran a ejecutarla, el RLS sin políticas de `need_supporters` les haría fallar el INSERT, pero así no hay ni siquiera intento.
6. **`help_needs` no tiene columna de autor** y no la añadí (sería migración + cambio de tipos compartidos con el frontend): T1 solo se puede aplicar a `author_id` (puntos) y `user_id` (comentarios). Dejado como propuesta para la semana 2 (moderación/roles).
7. **`apply-schema.ts` no repite DDL**: crea la tabla porque aplica `supabase/schema.sql` entero (idempotente), igual que el auto-aplicado del servidor.

## Riesgos y deuda que dejo

- ~~**El frontend aún no manda `Authorization`**~~ → **ya lo hace** (T8, agente-frontend): `AppContext.tsx` pide el token con `getToken()` y lo manda en `Authorization: Bearer …` en puntos, necesidades, comentarios y apoyos; sin token avisa y reabre el ingreso. La pareja T1+T8 cierra el circuito: anónimo → `401` antes de tocar la BD.
- **Los IDs de los escritos siguen naciendo en el cliente con `Date.now()`** (`AppContext.tsx:1002,1060,1111`): el servidor los acepta a propósito (patrón `^[A-Za-z0-9_-]{4,80}$`, hace falta para el merge offline de T6) y solo genera `randomUUID()` si el cuerpo no manda id. Dos publicaciones en el mismo milisegundo por distintos usuarios → una recibe **409** (antes: colisión silenciosa). Raro, pero es comportamiento nuevo visible; si molesta, la decisión la toman frontend + backend juntos (id del cliente vs. id del servidor).
- **`userName`, `userRole` y `userBarrio` siguen viniendo del cuerpo** (datos de vitrina, saneados): un cliente malintencionado puede firmarse «coordinador». No es identidad (`user_id` sí sale del JWT), pero la validación de roles reales queda pendiente (semana 2).
- **Nuevos puntos nacen `verified=false`**: el mapa los muestra sin badge de «verificado» (el cliente además mantiene su `verified: true` optimista hasta refrescar). Coherente con la decisión de `decisiones.md`; la tarea de verificación es posterior.
- **Fallback de apoyos** cuenta filas con `limit(10_000)`: con más de 10 000 apoyos en una necesidad y sin la función instalada, subestimaría. Instalar la función (`npm run db:setup`) lo evita.
- **`point_comments` no tiene FK a `help_points`**: un comentario puede quedar huérfano si un punto se borra (los puntos no se borran hoy). Candidato a añadir en semana 2.
- **Puerto 3124**: había un proceso huérfano (`node --import tsx server.ts`, PID 530964, ~5 h, código anterior a T1) que respondía 400/201 anónimos y habría engañado al humo de T0. Lo maté y levanté otra instancia con el código actual en ese mismo puerto; si os lo encontráis parado, es un proceso mío (y se puede reiniciar igual).
- La **RCA de la identidad dual** (perfil local vs Clerk) no se toca aquí: solo el JWT manda en el servidor.

## Para el siguiente agente

- **Humo autenticado**: crear usuario en Clerk (`POST /v1/users`), crear sesión (`POST /v1/sessions {"user_id":…}`) y token (`POST /v1/sessions/{id}/tokens {"expires_in_seconds":60}`); el token caduca en 60 s. Yo usé un usuario de prueba y lo borré (`DELETE /v1/users/{id}`).
- `npm run test:ui` **lee el código de `server.ts`** y exige `status(404)` + `404.html`, `app.use(compression())` e `immutable: true`: no quitar esas líneas.
- `npm run verify:rls` tiene ahora 10 pasos; el de «6 políticas» no cambia. Cuidado al editar `schema.sql`: debe seguir re-ejecutándose limpio (lo comprueba paso 2).
- El esquema **ya está aplicado** al Supabase real (`point_comments` + `toggle_need_support`, comprobado con `db:setup` y con una llamada `rpc` que devolvió `null` sin escribir).
- Si tocas la API, recuerda que `/api/config` expone `supabaseHint` (ahora habla de las 4 tablas) y que la forma de las respuestas la depende el cliente.
