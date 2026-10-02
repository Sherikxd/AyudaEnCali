# Log — backend (2026-10-02)

## En qué trabajé

- **T28 · Verificación y moderación (FEAT-02, herencia de T7)** — solo servidor.
  - `PATCH /api/points/:id` real: marcar/desmarcar `verified` con permiso de moderación.
  - Tabla nueva `entity_reports` (RLS activada **sin** políticas, patrón `need_supporters`).
  - `POST /api/reports` (cualquier sesión) y `GET /reports` (solo moderación), con dedup idempotente.
  - Montaje en función Vercel existente: seguimos en **10/12 funciones** (rewrite, no función nueva).
  - Tests (sección `N` + paridad `M19–M25`), `smoke:vercel` y `verify:rls` ampliados.
- Área propia: `server.ts`, `server/**`, `api/**`, `supabase/**`, `scripts/**` + excepción única `vercel.json`
  (solo el rewrite de `/api/reports`). No toqué `src/**`, `index.html`, `README.md`, `.github/**`
  ni `package.json`.

## Cambios realizados

- `server/validation.ts` → `toUserRole` (rol con forma válida o `undefined`, **sin** fallback a
  `ciudadano`), `isModerator` (rol que puede moderar), `validateReport` (entidad, id y motivo
  3..500) y `validateVerifiedUpdate` (solo la clave `verified`, booleano obligatorio).
- `server/auth.ts` → `AuthUser.role` (rol del JWT verificado), `roleFromClaims` (claim `role` o
  `public_metadata.role`, falla cerrado), `MODERATION_FORBIDDEN` (mensaje 403 común) y
  `canModerate` (rol `coordinador` **o** lista blanca `MODERATOR_USER_IDS`).
- `server/entities.ts` → tipos `ReportEntityType` y `EntityReport`.
- `server/store.ts` → `memory.reports` y `purgeReportsFromCache` (la caché repite el
  `ON DELETE CASCADE` de la BD).
- `server/handlers/points.ts` → rama `PATCH` (orden 401→403→404→400) y purga de reportes al
  borrar un punto; el `PUT` del autor ignora `verified` (si es la única clave → 400).
- `server/handlers/needs.ts` → purga de reportes de la necesidad al borrarla.
- `server/handlers/reports.ts` (**nuevo**) → `POST` (identidad solo del JWT, validación, dedup
  por caché o `23505`) y `GET` (solo moderación, siempre paginado).
- `server/app.ts` → monta `reportsHandler` en `/api/reports`.
- `server/supabase.ts` → `EntityReportRow`, `mapReportRow`/`toReportRow`, sonda de tabla
  `entity_reports` y las 5 tablas en los mensajes de error.
- `supabase/schema.sql` → TABLA 5 `entity_reports` (8 columnas, CHECKs de tipo y de coherencia
  `entity_id = COALESCE(point_id, need_id)`, FKs `ON DELETE CASCADE`, índice único de dedup
  `(reporter_id, entity_type, entity_id)`, índice `(created_at DESC)`), RLS activada sin
  políticas y comentarios actualizados.
- `vercel.json` → rewrite `{ "source": "/api/reports", "destination": "/api/comments?_orig=reports" }`
  antes del comodín (misma receta que los demás; **sin** función nueva).
- `api/comments.ts` → si el destino es `/reports` despacha a `reportsHandler`; si no, al de
  comentarios (mismo patrón que `_orig` del resto).
- `scripts/verify-rls.sh` → cabecera a 5 tablas, paso 12bis/13 nuevo: insert válido del backend,
  bloqueo de anon y authenticated, FK huérfana, CHECK de tipo, dedup y CASCADE por necesidad
  (3 comprobaciones), y `entity_reports` incluida en «RLS sin políticas».
- `scripts/smoke-vercel.mjs` → comprobación estática del rewrite de `/api/reports` (destino
  `?_orig=reports`, antes del comodín) + 2 casos de ruta (`GET/POST /api/reports`) → 46 checks.
- `scripts/test-nucleos.mjs` → `mintJwt` acepta `role`/`publicMetadata`; `MODERATOR_USER_IDS=''`
  forzado; sección **N** (30 checks) *antes* de M (M instala el Supabase falso);
  `contrato()` aprendió el 4.º parámetro `normaliza` (iguala relojes/UUID entre adaptadores);
  paridad `M19–M25` (PATCH, POST/GET reports, 401, 403).
- `scripts/apply-schema.ts` → comentario de cabecera a 5 tablas.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ (0 errores, TS estricto) |
| `npx vite build` | ✅ (`built in 512ms`) |
| `npm run test:ui` | ✅ (40/40 · `TODO OK`) |
| `npm run test:server` | ✅ (121/121 · `TODO OK`) |
| `npm run smoke:vercel` | ✅ (46/46 · `TODO OK`) |
| `npm run verify:rls` | ✅ (13 pasos · esquema y políticas OK) |

**Experimento de sabotaje (rojo deliberado):** con una copia de seguridad en
`/tmp/opencode/t28-sabotaje/` se cambió `isModerator` para conceder siempre (`return true`).
El primer run salió **verde**, lo que destapó un hueco de cobertura: sin rol explícito en el
JWT el permiso ya lo negaba el atajo «sin rol → sin permisos», no `isModerator`. Se añadieron
entonces **N2b** y **N21b** (JWT con `role: 'ciudadano'` explícito contra `PATCH /points/:id` y
`GET /reports`) → con el sabotaje: `2 FALLO(S)`, exit 1; restaurado el código original:
121/121 verdes.

## Decisiones tomadas (y por qué)

- **Moderador = rol `coordinador`** (sin roles nuevos: eso tocaría `src/types/index.ts`, del área
  del agente-frontend). `isModerator`/`toUserRole` viven en `server/validation.ts`;
  `USER_ROLES` sigue privado del módulo.
- **Rol desde el JWT verificado** (`payload.role` o `payload.public_metadata.role`). La plantilla
  de Clerk debe leer **`public_metadata`**, nunca `unsafe_metadata` (cualquiera puede escribir en
  esta última). Sin claim → sin rol → sin permisos (falla cerrado).
- **Lista blanca `MODERATOR_USER_IDS`** (CSV de `sub` de Clerk) en `canModerate`: habilita
  moderación en producción sin tocar la plantilla JWT. **Falta documentarlo en `.env.example`**
  (fichero de agente-calidad, ver deuda).
- **Orden del `PATCH`: 401 → 403 → 404 → 400** — diverge de `PUT/DELETE` (401→404→403→400) a
  propósito: el permiso de moderación no depende del punto, se decide antes de mirar la BD y así
  un ciudadano no aprende qué ids existen. Documentado en la cabecera de `lifecycle()`.
- **403 único** para toda acción de moderación (`MODERATION_FORBIDDEN`): no se distingue «sin
  rol» de «rol insuficiente».
- **`entity_reports` con dos columnas FK** (`point_id`/`need_id`, una NULL según el tipo + CHECK
  `entity_id = COALESCE(point_id, need_id)`): Postgres no tiene claves foráneas polimórficas;
  así el CASCADE y la comprobación de existencia son de verdad, y el CHECK de tipo evita que un
  `entity_type='point'` apunte a una necesidad.
- **Dedup** = índice único `(reporter_id, entity_type, entity_id)`. En memoria se pre-comprueba;
  con BD, el `23505` re-lee la fila y responde `200 { report, duplicate: true }` (idempotente
  para la cola offline del cliente). `reporterId` del cuerpo se **ignora**: identidad solo del JWT.
- **`GET /reports` siempre paginado** (defaults página 1 / 20, tope 100, `created_at` DESC): es
  una vista de trabajo, no un listado público con contrato que preservar.
- **Sin función Vercel nueva**: rewrite a `/api/comments?_orig=reports` + despacho en
  `api/comments.ts` → seguimos en 10/12.
- **Sección `N` antes de `M`** en los tests: `M11` instala un cliente Supabase falso y `N`
  necesita el arranque en modo caché; IP propia `198.51.100.50` para no tocar los contadores de
  rate limit.

## Riesgos y deuda que dejo

- **`MODERATOR_USER_IDS` sin documentar en `.env.example`** (no es fichero mío): sin esa
  variable, en producción solo modera quien tenga `public_metadata.role='coordinador'`.
  → agente-calidad.
- **`entity_reports` no está en `TABLES` de `scripts/export-s3.ts`** (T26, fichero ya modificado
  por otro agente; lo dejo intacto). El export S3 no volcará reportes hasta que se añada.
- **README**: la lista de tablas/ endpoints del docs sigue a 4 tablas / sin `/api/reports`
  (fichero de agente-calidad).
- **Roles `admin`/`verificador`**: si aparecen, hay que tocar `src/types/index.ts`
  (agente-frontend) y ampliar `isModerator` — ahora solo `coordinador`.
- La cola de reportes es **solo API**: la UI (`FEAT-02` parte front) aún no existe; `GET
  /api/reports` no la consumirá nadie hasta que el agente-frontend la monte.
- `verify:rls` necesita red (Postgres desechable); si falla por Docker/red, no es fallo del
  esquema.

## Contrato para el frontend (FEAT-02)

Moderador = sesión con `public_metadata.role = 'coordinador'` (o allowlist del servidor). El
cliente puede leer el mismo claim desde la sesión de Clerk para decidir qué pintar, pero **el
servidor es quien concede siempre**.

| Método · ruta | Éxito | Errores (status · `error`) |
| --- | --- | --- |
| `PATCH /api/points/:id` — cuerpo **solo** `{ verified: boolean }` | `200 { point }` con `verified` nuevo | `401 "Debes iniciar sesión para verificar un punto de ayuda."` · `403 "Se requiere permiso de moderación para esta acción."` · `404 "Punto de ayuda no encontrado."` · `400 "Datos de moderación inválidos."` (+ `details[]`: clave distinta de `verified`, ausente o no booleano) |
| `PUT /api/points/:id` — autor, **no** modera | `200 { point }` (`verified` intacto) | cuerpo solo con `verified` → `400 "Datos de punto inválidos."` |
| `POST /api/reports` — `{ entityType: 'point'\|'need', entityId, reason }` | `201 { report }` · repetido → `200 { report, duplicate: true }` | `401 "Debes iniciar sesión para reportar contenido."` · `400 "Reporte inválido."` (+ `details[]`: tipo, id `^[A-Za-z0-9_-]{4,80}$`, motivo 3..500) · `400 "La entidad indicada no existe."` |
| `GET /api/reports?page=&limit=` — solo moderación | `200 { reports[], source, page, limit, total, totalPages }` | `401 "Debes iniciar sesión para ver la cola de reportes."` · `403 "Se requiere permiso de moderación para esta acción."` |

- `report` = `{ id: "rep-…", entityType, entityId, reporterId, reason, createdAt }`;
  `reporterId` **siempre** el `sub` del JWT (nunca leerlo del cuerpo).
- `reason`: 3..500 caracteres (se recorta a 500, como el resto de la API).
- Dedup por usuario+entidad: reintentar el mismo reporte devuelve `200` con `duplicate: true`
  — la cola offline puede reenviar sin miedo a duplicar.
- Límites de tasa: escrituras 60/min y lecturas 120/min por IP → `429`.
- Vercel: la misma ruta llega por rewrite a `/api/comments?_orig=reports` (10 funciones, sin
  cambios para el cliente: misma URL, mismo cuerpo).

## Para el siguiente agente

- El orden de comprobaciones del `PATCH` **es distinto** al del `PUT`/`DELETE` (403 antes que
  404): cualquier test que asuma el orden histórico de T2 para `PATCH` está mal.
- `GET /api/reports` no tiene versión «sin paginación»: o siempre metadatos. No «arreglar» eso
  para parecerse a los demás listados.
- Si añades tablas/ endpoints nuevos: actualizar `verify-rls.sh`, `smoke-vercel.mjs` y los casos
  de paridad `contrato()`; el contrato Express ↔ Vercel es lo que más roturas cuesta.
- La sección `M` instala Supabase falso; cualquier test que necesite el modo caché va **antes**
  de `M` (como la `N`).
- No hago `git commit`: el repo lo gestiona la persona. `docs/agentes/tareas-semana-2.md` y
  `auditoria-objetivos-2026-10-01.md` están modificados por la auditoría del coordinador — no los
  toqué.
