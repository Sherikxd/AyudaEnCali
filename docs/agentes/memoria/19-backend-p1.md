# Log — backend P1 (2026-09-30)

## En qué trabajé

- **T1** · Entidades atadas a identidades (FAL-02 + FAL-03 servidor).
- **T2** · Ciclo de vida en servidor: `PATCH`/`PUT`/`DELETE` (FAL-01 +
  FEAT-01 API). Dependía de T1.
- **T3** · `/api/supabase/sql` protegida + GET paginados y con límite
  (FAL-05). Dependía de T1, T2.
- **T4** · Rate limit real: `X-Forwarded-For` validada (FAL-06). Dependía
  de T2.
- Áreas ajenas en solo lectura: `src/**`, `index.html`, `README.md`,
  `.github/**`, `vercel.json`, `package.json`, `.env.example` y
  `docs/agentes/**` (salvo este log). Sin `git add`/`git commit`.

## Cambios realizados

### T1 — identidad del servidor, no del body

- `supabase/schema.sql` → `help_needs.author_id TEXT` + `CREATE INDEX IF
  NOT EXISTS` + backfill documentado (`NULL` = autor heredado desconocido:
  nadie puede editar esas filas). La FK
  `point_comments.point_id → help_points(id) ON DELETE CASCADE` vive en un
  bloque `DO` idempotente que **solo** la crea si no existe, y en ese caso
  borra antes los comentarios huérfanos (así `npm run db:setup` no rompe
  contra BDs ya creadas). Sin tocar políticas RLS: se añade columna, no
  reglas (decisión 2026-09-28). Cabecera del fichero actualizada para
  mencionar la ruta `/api/supabase/sql` con token.
- `scripts/apply-schema.ts` → nota de documentación sobre los mismos
  `ALTER` idempotentes.
- `server/validation.ts` → `validatePoint`/`validateComment` dejan de
  aceptar campos de identidad (`authorId`, `userId`, `userName`,
  `userRole`, `userBarrio`, `verified`): **se ignoran**, no se rechazan
  (el front sigue funcionando hasta T9/T10). Tipos nuevos:
  `PointDraft`, `NeedDraft`, `NeedPatch`, `PointPatch`, `NEED_STATUSES`.
- `server/entities.ts` (nuevo) → `HelpNeedWithAuthor` (necesidad con
  `authorId`) e `isClerkUserId`.
- `server/auth.ts` → exporta `bearerToken`, `nameFromClaims`,
  `withTimeout` y `resolveDisplayName` (claims del JWT → perfil de Clerk
  con caché 5 min positiva / 1 min negativa y timeout de 2,5 s →
  `'Ciudadano Solidario'` de respaldo).
- `server/handlers/needs.ts` y `points.ts` → el autor sale SOLO del JWT
  (`user.userId`); cualquier `authorId` del body se descarta.
- `server/handlers/comments.ts` → identidad desde el JWT;
  `resolveDisplayName` para el nombre; `userRole` siempre `'ciudadano'` y
  `userBarrio` omitido (los claims del cliente ya no mandan). Un
  `point_id` inexistente choca con la FK (`23503` → 400 «El punto de
  ayuda indicado no existe.») o, sin BD, con el chequeo de existencia en
  caché memoria; nunca un 201 silencioso.
- `server/supabase.ts` → `HelpNeedRow.author_id`, `mapNeedRow`/`toNeedRow`
  con `authorId`, sonda de esquema `['help_needs','author_id']` y
  `classifySupabaseError` tratando `PGRST204`/«could not find the …
  column» como `missing` para que un despliegue sin la columna nueva
  autoaplique el DDL.
- `supabase/schema.sql` cambió → `verify:rls` ampliado
  (`scripts/verify-rls.sh`): pasos 11 (FK + `ON DELETE CASCADE`) y 12
  (columna, índice y backfill de `author_id`) → **12 pasos**.

### T2 — ciclo de vida `PATCH`/`PUT`/`DELETE`

- `server/handlers/needs.ts` → `PATCH`/`DELETE /needs/:id`
  (`validateNeedUpdate` estricto: parche vacío o clave desconocida → 400,
  enum fuera de rango → 400) y `POST` deja de forzar: `supportersCount`
  nace en **0** y `status` sale del body validado.
- `server/handlers/points.ts` → `PUT`/`DELETE /points/:id`
  (`validatePointUpdate`); `POST` nace con `verified: false` y la
  identidad solo del JWT.
- Orden de comprobaciones (idéntico en ambos): id → `notFoundResult` (404
  de Express para métodos no soportados en la ruta con id) →
  `writeLimiter` → 401 sin sesión → 404 inexistente → **403** si el
  `author_id` no es el `sub` del JWT o es `NULL` → 400 de validación.
  Solo se actualizan las columnas parcheadas (`toNeedPatchRow` /
  `toPointPatchRow`) para no pisar `supporters_count`.
- `server/resourceId.ts` (nuevo) → `resolveEntityId`: id de la ruta
  canónica primero; `?id=` SOLO cuando la petición llegó reescrita
  (`_orig`), de modo que el espejo filesystem `/api/needs/XYZ` responde
  404 como Express.
- `server/app.ts` → montaje de `/needs/:id` y `/points/:id` (con
  `app.use(compression())` y el guard `process.env.VERCEL` intactos para
  `test:ui`); comentario de `trust proxy` (ver T4).
- **`vercel.json` NO lo toqué** (área de agente-calidad). Los rewrites
  necesarios quedan anotados abajo, en «Para el siguiente agente».

### T3 — `/api/supabase/sql` protegida, GET con límite y paginación

- `server/handlers/sql.ts` → exige
  `Authorization: Bearer <SQL_ADMIN_TOKEN>`; comparación por sha256 +
  `timingSafeEqual`; **401** si falta, no coincide o la variable no está
  definida (nunca se sirve el DDL por accidente). Los chequeos de
  método/ruta van ANTES de la auth, así el espejo `/api/sql` sigue en
  **404** (decisión T13 semana 1) — decidí **mantener el espejo**
  oculto en lugar de retirarlo con `VERCEL=1`: menos superficie y cero
  riesgo de exponer DDL por un rewrite futuro.
- `server/limiters.ts` → `readLimiter` nuevo (120/min por IP, cuenta
  compartida de los GET de puntos/necesidades/comentarios; `chat` ya
  tenía el suyo). Emite cabeceras `RateLimit-Limit/Remaining/Reset` y
  `Retry-After` en el 429.
- `server/pagination.ts` (nuevo) → `readPageParams`/`pageMeta`/
  `paginate`: `limit` máx. 100, por defecto 20; valores inválidos se
  corrigen (no rompen); `?page=999` → página vacía con metadatos. En
  Supabase, `count: 'exact'` + `.range()`; sin parámetros la respuesta
  es **byte a byte** la antigua (sin claves `page`/`total`: compat con
  `AppContext.tsx`), y solo una lectura sin filtros refresca la caché.
- `server/handlers/{points,needs,comments}.ts` → `readLimiter` en los
  GET + paginación opcional. `comments` además deja de cortar a ciegas
  con `.limit(500)`: filtra por `point_id` y pagina.
- `scripts/smoke-vercel.mjs` → ampliado a **43 checks**: 401 de `/sql`
  sin token, 200 local con token, cabecera `RateLimit-Limit: 120`,
  `?page=999&limit=10` con metadatos, ausencia de metadatos sin
  parámetros, chequeos estáticos de rewrites condicionales y del nuevo
  ciclo de vida (expectativas derivadas en runtime con
  `resolveTarget(...)`; con `SMOKE_BASE_URL` se acepta `[401, 404]`
  porque el `vercel.json` desplegado puede no tener aún los rewrites).

### T4 — `X-Forwarded-For` validada (FAL-06)

- `server/http.ts` → `clientIp()` reescrito con cadena de decisión:
  1. `req.ip` de Express si es una IP válida (con `trust proxy: 1` solo
     en `NODE_ENV=production`, fijado en `server/app.ts`; en desarrollo
     devuelve el socket, así que una XFF mandada a mano no cambia la
     clave);
  2. sin `req.ip` (adaptador de Vercel) → **último** salto con formato
     válido de `X-Forwarded-For` (el que añadió el proxy más próximo;
     una entrada forjada queda a la izquierda y no se usa; una corrupta
     se salta);
  3. respaldo: socket normalizado → `'unknown'`. Nunca una cadena
     arbitraria del cliente como clave del contador.
- `normalizeIp()` exportado: IPv4 estricta (sin ceros a la izquierda),
  IPv6 canónica (`2001:0DB8::0001` → `2001:db8::1`), zone id y
  corchetes fuera. **Bug encontrado y corregido en esta pasada:**
  `::ffff:1.2.3.4` se canonicaba como `::ffff:cb00:7107`, o sea una
  cuenta **distinta** de `1.2.3.4`, contradiciendo la propia
  documentación de `normalizeIp` y el «misma IP en IPv4 y `::ffff:` →
  misma cuenta» del tablero (Node reporta los sockets duales en esa
  forma: un mismo cliente tenía dos contadores). Ahora
  `ipv4FromMapped()` la colapsa a `1.2.3.4`.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ 0 errores (`tsc --noEmit` estricto) |
| `npx vite build` | ✅ built in 443ms |
| `npm run test:ui` | ✅ (40/40) `TODO OK` |
| `npm run verify:rls` | ✅ 12 pasos, `[OK]` (schema.sql cambió) |
| `npm run smoke:vercel` | ✅ (43/43) `TODO OK` — 10 funciones ≤ 12 |

Comprobaciones auxiliares (harnesses desechables en `/tmp/opencode`, no
van al repo):

| Harness | Resultado |
| --- | --- |
| `check-lifecycle.mjs` — simula las URLs de destino de los rewrites futuros | ✅ (9/9): `PATCH`/`DELETE`/`PUT` reescritos → 401, `GET` con id → 404 con ruta canónica, coleccion 404, paginación con y sin metadatos |
| `check-xff.mjs` — FAL-06 de punta a punta | ✅ (11/11): cupo agotado → 429; XFF forjada tras el proxy sigue 429; `req.ip` resuelto manda; XFF con basura → 429 sin excepción; `::ffff:` comparte cuenta; sin XFF → socket |

Nota sobre el primer intento del harness de ciclo de vida: se colgaba en
`DELETE` y **no era el handler** — el `req` falso declaraba
`content-type: application/json` sin `req.body`, así que `readJsonBody`
esperaba el `end` de un stream que nunca emitía. Corregido el harness
(enseñar `req.body` como hace el runtime de Vercel).

## Decisiones tomadas (y por qué)

- **Identidad del body se ignora, no se rechaza** → el front actual sigue
  publicando mientras T9/T10 llegan; el servidor ya no la lee nunca.
- **Nombre del comentario**: claims del JWT → perfil de Clerk (con caché y
  timeout para no encarecer cada POST) → `'Ciudadano Solidario'`.
  `userRole`/`userBarrio` del cliente ya no se guardan.
- **`supportersCount` nace en 0** y `status` del body validado
  (`activa|en_proceso|resuelta`); `archivada` sigue sin admitirse porque
  exige ampliar `NeedStatus` (tipos del front) → coordinar con
  agente-frontend.
- **`/api/supabase/sql`**: 401 con token ausente/inválido/**sin
  variable**; el espejo `/api/sql` se mantiene en 404 (decisión T13
  semana 1) y los chequeos de ruta van antes que la auth.
- **Paginación compatible**: sin `?page&limit` la respuesta no cambia ni
  una coma; con ellos se añaden `page/limit/total/totalPages` sin quitar
  el array. Corregir valores inválidos en vez de fallar (un crawler con
  `limit=99999` no debe tumbar la lectura).
- **`clientIp()` con preferencia a `req.ip`** → misma clave en Express y
  en la función de Vercel (ambos emulan `trust proxy: 1`), y la IP
  forjada nunca es la clave.
- **Orden del ciclo de vida** auth → existencia → autoría → validación:
  sin sesión no se revela si el recurso existe ni si es tuyo (401 antes
  que 404/403), y 403 antes que 400 para no filtrar validaciones de
  recursos ajenos.
- **`PGRST204` = `missing`** → un despliegue carente de `author_id`
  autoaplica el DDL en lugar de dejar la API en 500.
- **Mantener el espejo `/api/sql`** en 404 (arriba, en T3).

## Riesgos y deuda que dejo

- **`vercel.json` sin los rewrites del ciclo de vida** (agente-calidad):
  en Vercel `PATCH/PUT/DELETE /api/needs/XYZ` siguen respondiendo 404
  hasta que entren. El código, `server/app.ts` y el smoke ya están listos
  y el smoke deriva sus expectativas, así que nada se rompe al añadirlos.
- **`authenticated` puede hacer `UPDATE help_needs.author_id` vía
  PostgREST**: la política RLS de UPDATE de `help_needs` está congelada
  por decisión (2026-09-28) y al añadir la columna amplía su alcance. El
  backend ya no confía en esa columna para autorizar sin comprobar el
  JWT, pero reasignar autoría sigue siendo posible desde el cliente
  directo. Discutir en T7/decisiones.
- **`archivada`** no admitida (arriba) — bloqueado en coordinación.
- **`SQL_ADMIN_TOKEN` no documentado** en `.env.example`/`README.md`:
  no son de mi área; quien los toque debe añadirlo (sin valor real).
- **`userRole`/`userBarrio`** se ignoran en comentarios: si el front
  esperaba mostrar el rol del autor, ahora verá siempre `'ciudadano'`
  (o el nombre resuelto). Avisado para T10.
- **El smoke no simula `X-Forwarded-For`** (verificado:
  `scripts/smoke-vercel.mjs` no la envía); la no-forja está cubierta solo
  por mi harness desechable. T6 debe materializarla como test del repo
  (`package.json` ya apunta `test:server` → `scripts/test-nucleos.mjs`,
  aún inexistente: es T6).
- **Filas heredadas con `author_id = NULL`**: nadie puede editarlas ni
  borrarlas por la API (403). Es intencionado (no inventar autores), pero
  habrá que decidir un rescate (backfill real o moderación en T7).
- **Límites en memoria por aislamiento** de función: en Vercel cada
  función tiene su propia cuenta (120/min de lectura y 60/min de
  escritura por IP y función), no una global.

## Para el siguiente agente

- **Rewrites pendientes en `vercel.json`** (área agente-calidad; NO los
  añadí yo), justo antes del catch-all y después del de apoyos:

  ```json
  { "source": "/api/needs/:id",  "destination": "/api/needs?_orig=needs/:id&id=:id" },
  { "source": "/api/points/:id", "destination": "/api/points?_orig=points/:id&id=:id" }
  ```

  Al añadirlos, `npm run smoke:vercel` debe seguir en verde (ya deriva
  las expectativas con `resolveTarget`); relanzarlo contra el despliegue
  real con `SMOKE_BASE_URL=… npm run smoke:vercel` (acepta `[401, 404]`
  mientras el deploy viejo siga vivo).
- **T6 (tests)**: cubrir lo que mis harnesses de `/tmp` cubrieron
  —ciclo de vida reescrito, XFF forjada, `::ffff:`— dentro de
  `scripts/test-nucleos.mjs`. La maquinaria de `readLimited` exige que
  las peticiones de test lleven `req.body` si declaran
  `content-type: json` (lección del colgado inicial).
- **T7 (moderación)**: `verified` de puntos y moderador sobre
  `help_needs.author_id` (ojo con la política RLS congelada).
- El tablero `docs/agentes/tareas-semana-2.md` sigue con T1-T4 en ⬜:
  no lo edité porque mi área solo me deja escribir este log. Quien
  coordin marque T1-T4 como hechas con esta evidencia.
