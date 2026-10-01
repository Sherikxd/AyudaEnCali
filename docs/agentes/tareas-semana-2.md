# Tablero — Semana 2: auditoría (falencias + features)

> Insumo: [`auditoria-semana-2.md`](auditoria-semana-2.md) (FAL-01..FAL-15 y
> FEAT-01..FEAT-12). Se cubren **todas** las P1 (T1-T9), las P2 (T10-T18) y
> las P3 (T19-T20), más las features de mayor valor; el resto queda en
> *Backlog* al final.
>
> **Decisiones que no se reabren** (`decisiones.md`): identidad = JWT de
> Clerk (nunca campos del body); imports relativos con `.js` explícito en
> `api/` y `server/`; RLS habilitado y **sin políticas** en las tablas
> internas; **una función Vercel por ruta, máx. 12** → hoy hay **10**, solo
> caben 2 funciones nuevas: ninguna tarea puede añadir funciones sin contar
> el total en `vercel.json`.

**Orden recomendado y paralelismo** (sin compartir ficheros):

- **Grupo 1 · arranque en paralelo:** `T1` (backend) ∥ `T9` + `T11` +
  `T13` + `T16` (frontend, cada una con ficheros `src/**` distintos) ∥
  `T18` + `T20` (calidad).
- **Grupo 2 · tras T1:** `T2` (ciclo de vida API) ∥ `T7` (moderación).
- **Grupo 3 · tras T2:** `T3` ∥ `T4` ∥ `T5` (backend: `handlers/*+limiters`
  vs `http.ts+app.ts` vs `handlers/chat.ts`, disjuntos) ∥ `T10` (frontend).
- **Grupo 4 · tras el grupo 3:** `T6` (tests) ∥ `T12` ∥ `T14` ∥ `T17`.
- **Grupo 5 · cierre:** `T8` (tras T5) → `T15` (tras T9+T12) → `T19`
  (tras T17+T18) → **`T0` al final**.
- **Cadena crítica:** T1 → T2 → T3/T4 → T6 → T17 → T19 → T0.
- **Prohibido:** tocar ficheros de otra área; si es imprescindible, se pide
  y se anota en tu log.

Leyenda de estado: `⬜ pendiente` · `🟡 en curso` · `✅ hecha` · `⛔ bloqueada`

---

## Estado (2026-10-01)

| Bloque | Tareas | Resultado | Log |
| --- | --- | --- | --- |
| Auditoría | FAL-01..15 + FEAT-01..12 | ✅ informe completo | `auditoria-semana-2.md` |
| Documentación | memoria de agentes + árbol | ✅ | `memoria/17-documentacion.md` |
| Backend P1 | T1-T4 | ✅ · `verify:rls` 12 pasos, harness 9/9 + XFF 11/11 | `memoria/19-backend-p1.md` |
| Frontend | T9, T13, T16 (+ T11 parte cliente + FAL-15 en `index.html`) | ✅ · `test:ui` 40/40 | `memoria/20-frontend-rapidas.md` |
| Calidad | T17, T18, T20 | ✅ · schema de `vercel.json` válido, CSP verificada con 0 violaciones | `memoria/21-calidad-infra.md` |
| README infra | T19 | ✅ · FAL-14 corregido (`README.md` sincronizado) | `memoria/18-readme-infra.md` |
| Agente pesado (Copilot) | rewrites de T2 en `vercel.json`, T5, T6, T8, T10, T12, T14 | ✅ · `test:server` 65/65, bug real de la cola `pendingWrite` destapado y arreglado | `memoria/22-copilot-profundo.md` |
| **Pendientes** | T7 (moderación), T11 (semilla única, parte backend), T15 (PWA) | ⬜ T7/T15 · 🟡 T11 | — |
| **T0** | verificación local ✅ (2026-10-01): `lint` · `vite build` · `test:ui` 40/40 · `test:server` 65/65 · `smoke:vercel` 43/43 · `verify:rls` n/a | 🟡 **falta el humo contra producción** (tras commit+push) | — |

---

## agente-backend — `server.ts`, `server/**`, `api/**`, `supabase/**`, `scripts/**`

### T1 · Entidades atadas a identidades (FAL-02 + FAL-03 servidor) — **agente-backend** · ✅

`help_needs` no tiene `author_id` (`supabase/schema.sql:45-60`) y
`point_comments.point_id` no tiene FK a `help_points` (`schema.sql:89-100`):
no se sabe quién publica y los comentarios pueden quedar huérfanos. Además
la identidad se acepta del body (`server/validation.ts:172` `authorId`,
`:219-223` `userId/userName/userRole/userBarrio`).

**Hacer:**
- `supabase/schema.sql` (idempotente):
  `ALTER TABLE help_needs ADD COLUMN IF NOT EXISTS author_id TEXT;` con
  backfill documentado (`NULL` cuando no hay autor conocido) e índice;
  `ALTER TABLE point_comments ADD CONSTRAINT … FOREIGN KEY (point_id)
  REFERENCES help_points (id) ON DELETE CASCADE;`. RLS: se **añade columna,
  no políticas** (las de `help_needs` existentes no se tocan; las tablas
  internas siguen sin políticas — decisión 2026-09-28).
- `scripts/apply-schema.ts`: mismos `ALTER` idempotentes para que
  `npm run db:setup` no rompa contra BDs ya creadas.
- Servidor: en `POST /api/needs`, `POST /api/points` y `POST /api/comments`
  el autor sale del JWT (`getAuthenticatedUser`, `server/auth.ts:70-91`);
  `validatePoint`/`validateComment` dejan de aceptar campos de identidad y
  el handler rellena `author_name` desde el perfil verificado.
- `npm run verify:rls` en verde antes de dar por terminada la tarea.

**Hecho cuando:** `verify:rls` ✅ 10+ pasos; `help_needs.author_id` guarda el
`sub` del JWT (nunca algo del body); un `POST /api/comments` con `point_id`
inexistente choca con la FK (no un 201 silencioso); un cuerpo con
`userName: "Cruz Roja"` no cambia el nombre guardado.

### T2 · Ciclo de vida en servidor: PATCH/PUT/DELETE (FAL-01 + FEAT-01 API) — **agente-backend** · ✅ · depende de T1

No existe **ningún** `PUT` ni `DELETE` en la API (`server/app.ts`,
`server/handlers/*.ts`), y `POST /api/needs` fuerza `status: 'activa'` +
`supportersCount: 1` (`server/handlers/needs.ts:67-68`): toda necesidad
nace con un apoyo falso y nadie puede resolver ni borrar nada.

**Hacer:**
- `PATCH /api/needs/:id` (título, descripción, items, urgencia, `status`) y
  `DELETE /api/needs/:id`; `PUT /api/points/:id` y `DELETE /api/points/:id`,
  en `server/handlers/needs.ts` / `points.ts` + montaje en `server/app.ts`.
- Autoría: sesión obligatoria (401), `author_id` ≠ JWT → **403**; el rol
  moderador llegará en T7 (aquí solo el autor).
- Dejar de forzar: `supportersCount: 0` (el recuento real lo da la BD,
  decisión 2026-09-28) y `status` del cuerpo validado (`validateNeed` ya
  admite `activa|en_proceso|resuelta`, `server/validation.ts:197`).
- **Vercel sin funciones nuevas (10/12):** rewrites en `vercel.json`
  **antes** del catch-all, mismo patrón que el apoyo:
  `/api/needs/:id → /api/needs?_orig=needs/:id&id=:id` y
  `/api/points/:id → /api/points?_orig=points/:id&id=:id`; los métodos
  viajan a las funciones `api/needs.ts` y `api/points.ts` existentes,
  reutilizando `resolveNeedId`/extracción de id (decisión 2026-09-30).
- Cualquier fichero nuevo en `server/` o `api/` lleva imports con `.js`
  explícito (decisión 2026-09-30, hotfix del primer deploy).
- Paridad obligatoria Express ↔ funciones (mismos status/cuerpos/headers).

**Hecho cuando:** crear necesidad → `PATCH` a `resuelta` → el filtro
«resuelta» de `BlogView.tsx:50-53` la encuentra; `DELETE` propio ✅, ajeno
403, sin sesión 401; `supportersCount` nace en 0; `lint` + `vite build` +
`test:ui` verdes y `vercel.json` sigue válido y con ≤ 12 funciones.

### T3 · `/api/supabase/sql` protegida + GET paginados y con límite (FAL-05) — **agente-backend** · ✅ · depende de T1, T2

`GET /api/supabase/sql` devuelve el DDL entero sin autenticación
(`server/handlers/sql.ts:12`) y los GET de puntos/necesidades/comentarios
no tienen rate limit (el `writeLimiter` solo está en POST) ni paginación
(`server/handlers/comments.ts:42` corta con `.limit(500)` en memoria).

**Hacer:**
- `server/handlers/sql.ts`: exigir `Authorization: Bearer <SQL_ADMIN_TOKEN>`
  (var de entorno, jamás en el repo) → **401** sin cabecera; mantener el
  **404 del espejo** `/api/sql` (decisión T13 semana 1). Alternativa
  aceptable: retirarla cuando `VERCEL=1` — decidirlo y anotarlo en tu log.
- `readLimiter` nuevo en `server/limiters.ts` (p. ej. 120/min por IP)
  aplicado a los GET de `points.ts`, `needs.ts`, `comments.ts` y `chat` no
  (ya tiene el suyo).
- Paginación real `?page=&limit=` (máx. 100) con `.range()` de Supabase y
  `LIMIT/OFFSET` en la caché; añadir `page`/`total` a la respuesta
  **sin quitar** el array en la página 1 por defecto (compat con
  `AppContext.tsx:644-663`; si hay que cambiar la forma, coordinarlo con
  agente-frontend antes de tocar el front).
- Actualizar `scripts/smoke-vercel.mjs` (35 checks) al nuevo comportamiento
  de `/sql` y de las respuestas paginadas.

**Hecho cuando:** `/api/supabase/sql` sin token → 401 (y el espejo sigue en
404); los GET responden cabeceras `RateLimit-*`; `page=999` no devuelve el
dataset entero; `smoke:vercel` sigue en 35/35 (o la versión actualizada, en
verde).

### T4 · Rate limit real: `X-Forwarded-For` validada (FAL-06) — **agente-backend** · ✅ · depende de T2 · ¿paralela con T3?

`clientIp()` (`server/http.ts:242-249`) toma la primera IP de la cabecera
sin validar → los límites de 15/min (chat, coste real de Gemini) y 60/min
son decorativos para quien forje la cabecera (deuda aceptada en
`memoria/14-reverificacion-t13.md:130`).

**Hacer:**
- Validar formato de la primera IP (IPv4/IPv6, incluida la forma
  `::ffff:`) con regex estricta; si no valida → ignorar la cabecera y usar
  `req.ip`/socket (nunca una cadena arbitraria como clave del contador).
- `server/app.ts`: `app.set('trust proxy', <primer salto>)` para que
  `req.ip` resuelva bien detrás del proxy de Vercel/Nginx (el comentario de
  `IpCarrier` en `server/http.ts:230` ya lo asume).
- Normalizar la clave (misma IP en IPv4 y `::ffff:` → misma cuenta).
- Dejar preparado el test en T6 (XFF forjada no reinicia la cuenta).

**Hecho cuando:** agotado el cupo, repetir con `X-Forwarded-For` de otra IP
devuelve **429 igual**; una XFF con texto basura no rompe la clave ni lanza
excepción; `lint` + `test:ui` verdes.

### T5 · Un solo fallback del chat, lado servidor (FAL-10) — **agente-backend** · ✅ · ¿paralela con T3/T4?

`buildLocalReply` vive en `server/handlers/chat.ts:105-220`, la tercera rama
de reintento convive con `getLocalIntelligentFallback`
(`src/services/geminiService.ts:38`) y los timeouts no coinciden (30 s vs
15 s).

**Hacer:**
- Extraer `buildLocalReply` a `server/chatFallback.ts` (imports con `.js`)
  y devolverlo con `source: 'local'` desde `chatHandler`.
- Un solo timeout de conversación (15 s) y un solo reintento transitorio
  (`isTransientGeminiError`, `chat.ts:32`) — quitar el `timeoutMs: 30_000`
  redundante de la capa cliente en T14.
- El cliente deja de decidir la respuesta local (T14, tras esta tarea).

**Hecho cuando:** sin `GEMINI_API_KEY`, `POST /api/chat` → 200 con
`source: 'local'` y texto derivado de `memory.points`; la lógica duplicada
del front se elimina en T14 y `grep -n "buildLocalReply" server/` solo la
ve en el módulo nuevo.

### T6 · Tests de los núcleos y de la cola offline (FAL-07) — **agente-backend** · ✅ · depende de T2, T3, T4

Cero tests de `server/handlers/*` y cero de T5-T8 de la semana 1
(`signOut`, `mergeById`, `Toast`, `ensureIdentity`, cola offline); además
~15 de los 40 checks de `scripts/test-authmodal.mjs` son regex sobre el
fuente.

**Hacer:**
- Nuevo `scripts/test-nucleos.mjs` (ejecutable con `node
  --env-file-if-exists=.env`, sin Express) que importe los núcleos y
  ejerzite: 401 sin sesión, 201 con JWT de prueba, autoría (T1),
  `PATCH/PUT/DELETE` + 403 (T2), paginación y `readLimiter` (T3), XFF
  forjada sin efecto (T4), 404 de espejos, `source: 'local'` (T5).
- Tests unitarios de `mergeById`/`countPending` (`src/utils/sync.ts:29,46`),
  de la cola `pendingWrite` (`AppContext.tsx:280,582`) y de
  `ensureIdentity` (`AppContext.tsx:436`) — los 0 tests de T5-T8.
- Convertir a aserciones de comportamiento los checks que son regex sobre
  el fuente (o dejarlos y anotarlo en el log).
- **`package.json` es de agente-calidad:** pídele el script `test:server`
  para T17; no lo edites tú.

**Hecho cuando:** rompiendo algo a propósito (p. ej. quitar el 401), el
binario nuevo sale en rojo; los checks pasan en verde y quedan enganchados
a la CI en T17.

### T7 · Verificación y moderación (FEAT-02) — **agente-backend** · ⬜ · depende de T1

`verified` existe pero todos los puntos nuevos nacen `false`
(`server/handlers/points.ts:72`, default del esquema `schema.sql:42`) y no
hay cola de reportes: la estadística de «verificados» siempre miente y no
hay antídoto para T1/FAL-03.

**Hacer:**
- Permiso de moderación sobre `UserRole` (`ciudadano|voluntario|coordinador`
  en `server/validation.ts:26`): reutilizar `coordinador` o añadir
  `admin`/`verificador` — si toca `src/types/index.ts` (fichero de
  agente-frontend) se coordina y se anota en el log.
- `PATCH /api/points/:id` con rol moderador para marcar/desmarcar `verified`
  (solo esa clave), y `GET` del estado real para que la estadística signifique algo.
- Cola de reportes: tabla `entity_reports` en `supabase/schema.sql` (id,
  entidad, reporter_id del JWT, motivo, created_at) con **RLS habilitado y
  SIN políticas** (patrón `need_supporters`, `schema.sql:174`) + FK a la
  entidad; `POST /api/reports` (cualquiera autenticado) y `GET /api/reports`
  (solo moderador → 403 para el resto).
- **Sin funciones nuevas (10/12):** montar `/api/reports` dentro de una
  función existente con rewrite `_orig=reports` (p. ej. `api/comments.ts`)
  y **contar el total en `vercel.json`** (máx. 12) — si se prefiere gastar
  uno de los 2 huecos, decidirlo y anotarlo.
- `npm run verify:rls` en verde (cambió `schema.sql`).

**Hecho cuando:** un punto creado hoy puede pasar a `verified: true` solo
con rol moderador; `POST /api/reports` autenticado ✅ y `GET` sin rol → 403;
la tabla nueva no tiene políticas RLS; funciones ≤ 12; `verify:rls` ✅.

### T8 · Chat con contexto geográfico real (FEAT-07) — **agente-backend** · ✅ · depende de T5

El cliente manda `barrio` pero `buildSystemInstruction` (`chat.ts:74-103`)
solo incrusta `memory.points.slice(0, 20)` sin filtrar → respuestas
genéricas aunque haya datos del barrio consultado.

**Hacer:**
- Filtrar puntos y necesidades por `barrio` cuando llega en el cuerpo, y por
  proximidad (haversine) si el payload trae `lat/lng` — reutilizar el
  helper si FEAT-08 (backlog) lo trae, o dejarlo extraído y testeable.
- Ordenar por distancia y limitar a un top-N **por barrio** en vez de
  `slice(0, 20)` ciego; incluir en el prompt `name`, `barrio`, `address`,
  `phone` y distancia.
- Mantener `ensureContextFresh()` (`server/context.ts`) antes de armar el
  prompt (P1 de T13 semana 1).

**Hecho cuando:** con datos reales de Siloé en BD, «¿qué hay en Siloé?»
responde con esos puntos, sus datos y su distancia; sin Gemini sigue el
fallback local de T5; `smoke:vercel` y `test:ui` verdes.

---

## agente-frontend — `src/**`, `index.html`

### T9 · IDs únicos y sin identidad falsa del cliente (FAL-04 + FAL-03 front) — **agente-frontend** · ✅ · ¿paralela con T1?

`cali-point-${Date.now()}` / `cali-need-${Date.now()}` /
`comm-${Date.now()}` (`src/context/AppContext.tsx:1002,1060,1111`, y
`usr-cali-${Date.now()}` en `:506`, `usr-${Date.now()}` en `:1008`):
doble clic o dos pestañas en el mismo ms colisionan; con la cola offline,
dos dispositivos pueden generar la misma clave → pérdida silenciosa.

**Hacer:**
- Una única fábrica `newId()` con `crypto.randomUUID()` usada en los 5
  sitios (mantener intactos los IDs semilla `cali-*` que espera `SEED_IDS`,
  `AppContext.tsx:657-663`).
- Dejar de enviar identidad en los cuerros de escritura (`userName`,
  `userRole`, `userBarrio`, `userId`, `authorId`): desde T1 el servidor los
  ignora y en T3/T1 un validador estricto los rechazaría.
- La cola `pendingWrite` (`AppContext.tsx:280,582`) usa el mismo `newId()`.

**Hecho cuando:** doble clic en «Publicar» crea dos entidades distintas;
dos pestañas no colisionan; los payloads de escritura ya no llevan campos
de identidad; `npm run test:ui` ✅.

### T10 · Ciclo de vida en la UI (FEAT-01 front) — **agente-frontend** · ✅ · depende de T2, T9

La pestaña «resuelta» del filtro (`BlogView.tsx:50-53,208`) es código
muerto: nadie puede marcar nada como resuelta ni editar/borrar lo que
publica.

**Hacer:**
- `BlogView.tsx`: acciones «Marcar resuelta»/«Reabrir», «Editar» y
  «Eliminar» solo en necesidades propias (o del moderador, T7) →
  `PATCH`/`DELETE /api/needs/:id` vía `AppContext`.
- `MapView.tsx`: editar/eliminar puntos propios vía `PUT`/`DELETE
  /api/points/:id`.
- El contador «Activas» (`BlogView.tsx:159`) y el filtro «resuelta» se
  alimentan del estado que devuelve el servidor (ya no del local).
- Errores 401/403/404 visibles con el `Toast` existente
  (`src/components/Toast.tsx`, `aria-live`).
- Si T7 añade `archivada` a `NeedStatus`, actualizar `src/types/index.ts`
  aquí (coordinado).

**Hecho cuando:** crear necesidad → recargar → pasarla a «resuelta» y verla
en el filtro; editar/borrar lo propio funciona; lo propio es lo único que
ofrece esas acciones (y el servidor respondería 403 si se forzara);
`test:ui` ✅.

### T11 · Semilla única: local = producción (FAL-08) — **agente-frontend** · 🟡 · ¿paralela con T1/T9? · coordinada con agente-backend

`src/data/initialData.ts` (32 puntos / 6 necesidades) y
`server/seedData.ts` (5 puntos / 3 necesidades, con `supportersCount:
18/34/22`) discrepan; el README describe «5 puntos, 3 necesidades».

**Hacer:**
- Unificar en **una** fuente de verdad (recomendado: la del front, que es
  lo que pinta la app): exportar datasets tipados desde
  `src/data/initialData.ts` y que `server/seedData.ts` los **importe** — ese
  cambio toca `server/` (área de agente-backend): pídeselo o hazlo tú solo
  si te autoriza y lo anotas en tu log.
- Corregir contadores imposibles: el `supportersCount` del seed debe cuadrar
  con las filas de `need_supporters` que siembra `scripts/seed-db.ts`.
- README y `npm run db:seed` alineados (la corrección de texto es T19,
  agente-calidad).

**Hecho cuando:** `npm run db:seed` + arranque local pintan exactamente los
mismos puntos y necesidades que producción, y ningún contador muestra un
patrón imposible.

### T12 · AppContext memoizado (FAL-09) — **agente-frontend** · ✅ · depende de T10

`src/context/AppContext.tsx` (1349 líneas, ~25 `useState`) reconstruye el
`value` del Provider en cada render (`AppContext.tsx:1278-1344`, sin
`useMemo`): cada like/filtro/tecla re-renderiza MapView + BlogView + ChatView
→ jank en el móvil, que es el dispositivo objetivo.

**Hacer:**
- `useMemo` del `value` con dependencias correctas; acciones ya estables
  pasan a `useCallback` (`notify:246`, `dismissToast:255`, …).
- Si no basta: sub-contextos (`DataStateContext`/`UIStateContext`) o
  `useReducer` + selectores — sin reescribir el fichero entero.
- Comprobar con React DevTools profiler que dejar de escribir en un input o
  dar un like **no** re-renderiza `MapView`/`BlogView`/`ChatView`.

**Hecho cuando:** el profiler confirma los renders mínimos (una tecla en el
chat no re-renderiza el mapa), sin regresiones de estado (cola offline,
toasts, sesión) y `test:ui` ✅.

### T13 · Accesibilidad completa (FAL-11) — **agente-frontend** · ✅ · depende de T12 (o paralela si no toca los mismos componentes)

Solo `FaqModal` declara `role="dialog"` + `aria-modal` (`FaqModal.tsx:202-203`)
y cierra con Escape (`:188-192`); `ReportModal` y `LocationModal` no, no
atrapan el foco; `BottomNav` sin `aria-current`; `ChatView` sin ARIA.

**Hacer:**
- Extender el patrón de `FaqModal` (dialog + `aria-modal` + Escape + foco
  atrapado y devuelto al disparador) a `ReportModal.tsx`,
  `LocationModal.tsx` y `AuthModal.tsx` (Escape ya está en
  `AuthModal.tsx:46-50`, faltan role y foco).
- `BottomNav.tsx`: `aria-current="page"` en la pestaña activa.
- `ChatView.tsx`: mensajes en región `role="log"` + `aria-live="polite"`;
  etiquetas accesibles en enviar/archivos.
- `MapView.tsx`: `aria-label` en los controles propios (p. ej. el botón
  `#cali-map-report-btn`, `MapView.tsx:237`) y en el selector de capas.
- `Toast.tsx:73` se mantiene como único canal `aria-live` de anuncios.

**Hecho cuando:** recorrido de teclado completo (Tab/Escape) en los 4
modales: abren, el foco queda dentro, Escape cierra y devuelve el foco al
botón; con lector de pantalla, cambiar de pestaña y los avisos del chat se
anuncian; `test:ui` ✅.

### T14 · Un solo fallback del chat, lado cliente (FAL-10) — **agente-frontend** · ✅ · depende de T5

`getLocalIntelligentFallback` (`src/services/geminiService.ts:38-74`) y el
reintento propio duplican la lógica del servidor con timeout de 30 s
(`:27`).

**Hacer:**
- Borrar `getLocalIntelligentFallback` y la rama de reintento propia: si la
  API responde `source: 'local'` se muestra **su** texto; si la API no
  responde → `Toast` de error (T7 semana 1), nunca una respuesta inventada.
- Un solo timeout, el del servidor (T5).

**Hecho cuando:** `grep -rn "getLocalIntelligentFallback" src/` → 0; con el
servidor sin `GEMINI_API_KEY` el usuario ve la respuesta local **del
servidor**; `test:ui` ✅.

### T15 · PWA offline (FEAT-05) — **agente-frontend** · ⬜ · depende de T9, T12

La cola `pendingWrite` + `mergeById` ya existen (T6 semana 1); faltan
`manifest`, Service Worker e iconos instalables.

**Hacer:**
- `public/manifest.webmanifest` (nombre, iconos de `public/images` +
  `favicon.svg`, `display: standalone`, `start_url: "/"`, `theme_color` de
  la marca) y `<link rel="manifest">` + meta de theme en `index.html`.
- Service Worker mínimo: precache del shell (JS/CSS de `/assets` e
  `index.html`), **stale-while-revalidate** para los GET de `/api` y
  **network-first** para los POST (la cola de T6 se encarga del offline);
  registrar en `src/main.tsx` solo en producción.
- **No romper la 404 real de la SPA** (decisión 2026-09-29): el SW debe
  dejar pasar `/404.html` y cualquier URL inexistente.
- Cabecera `no-cache` del SW en `vercel.json` → pedirlo a agente-calidad
  (T17/T18 poseen `vercel.json`).

**Hecho cuando:** instalable en Chrome/Android sin errores de Lighthouse;
con la red cortada, mapa y tablón abren desde caché y un reporte queda en
cola y se envía al volver; `vite build`, `test:ui` y `smoke:vercel` verdes.

### T16 · Clustering de marcadores + badge verificado (FEAT-11) — **agente-frontend** · ✅ · ¿paralela con T9/T13?

`MapView.tsx:224` usa `L.layerGroup()` plano: con 32+ puntos el mapa se
satura.

**Hacer:**
- Añadir `leaflet.markercluster` (+ tipos) con `chunkedLoading` y zoom de
  clúster, sustituyendo el `layerGroup` plano.
- Icono/popup diferenciado para `verified: true` (el campo ya existe; gana
  sentido cuando T7 haga la verificación real).
- Conservar el click → reporte (`MapView.tsx:227-237`) y `focusPointOnMap`.

**Hecho cuando:** con los 32 puntos semilla, zoom out → clústeres (no 32
iconos superpuestos), abrir un clúster reparte los individuales, y un punto
verificado se distingue a golpe de vista; `test:ui` ✅.

---

## agente-calidad — `.github/**`, `vercel.json`, `package.json`, docs

### T17 · CI como puerta + `verify:rls` y `smoke` (FAL-12 + FEAT-09) — **agente-calidad** · ✅ · depende de T6

`vercel.json` usa `"buildCommand": "vite build"`: un push directo despliega
sin `tsc` ni tests, y la CI (`.github/workflows/ci.yml`) no bloquea nada.
`verify:rls` y `smoke:vercel` existen pero el gate de deploy no los exige.

**Hacer:**
- `vercel.json`: `ignoreCommand` (o build) que ejecute `npm run lint &&
  npm run test:ui` antes de construir → tipos rotos o tests rojos **no**
  despliegan; vigilar el límite de 100 builds/día del plan Hobby.
- `.github/workflows/ci.yml`: enganchar el test de núcleos nuevo (T6,
  script `test:server` en `package.json`) y quitar `continue-on-error: true`
  al paso de `verify:rls` **cuando haya cambios en `supabase/schema.sql`**
  (hoy `ci.yml` lo deja en no bloqueante).
- Pedir a la persona la protección de rama (`main` exige CI verde):
  anotarlo en tu log, es configuración de GitHub.
- `package.json`: añadir `test:server` (lo pide T6).

**Hecho cuando:** un push con un `tsc` roto no llega a Production (falla el
build de Vercel); con cambios en `schema.sql`, la CI ejecuta `verify:rls`
y falla si falla; cada PR corre lint + build + test:ui + `smoke:vercel`.

### T18 · CSP y cabeceras de seguridad en estáticos (FAL-13) — **agente-calidad** · ✅ · ¿paralela con T17? · coordinada con agente-backend

Cero CSP en el repo y los estáticos de `/` y `/assets` no reciben
cabeceras de la función (solo `Cache-Control`, `vercel.json:16-31`); la API
solo pone `nosniff`/`X-Frame-Options` (`server/http.ts:71-76`).

**Hacer:**
- `vercel.json`: bloque de `headers` global para `/` y `/assets/:path*` con
  `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy` y `X-Frame-Options`.
- CSP estricta, **verificada con la app abierta** (Consola → Network antes
  de fijar `connect-src`): `default-src 'self'`; `img-src 'self' data:
  blob: https://res.cloudinary.com https://*.tile.openstreetmap.org
  https://server.arcgisonline.com`; `font-src 'self' data:` (las fuentes van
  por consentimiento, `src/utils/consent.ts`); `style-src 'self'
  'unsafe-inline'` (Leaflet inyecta estilos); `script-src 'self'` ampliando
  solo lo que Clerk/Vite exijan de verdad (probar login, mapa, publicar,
  chat e imágenes y **cero** violaciones en consola).
- Lado API: la misma CSP en `setSecurityHeaders` (`server/http.ts:71`) →
  un fichero de `server/`, área de agente-backend: pídeselo/coordínalo y
  anótalo en tu log.

**Hecho cuando:** `curl -I` de `/` y `/api/health` muestran las cabeceras;
recorrido completo de la app con **0** violaciones de CSP en consola.

### T19 · README sincronizado con el código (FAL-14) — **agente-calidad** · ✅ · depende de T17, T18 (y de lo que cierre T1-T16)

Incoherencias: `README.md:96` («`api/index.ts` exporta la app como default»)
vs `:410`; `:71` cita `asyncHandler` (ya no existe); `:220` «tres tablas»
(hoy 4 con `need_supporters`, 5 con `point_comments`); `:556` producción en
`ayudaencali.lat` frente al deploy real `ayuda-en-cali.vercel.app`; la tabla
de scripts omite `smoke:vercel`.

**Hacer:**
- Pasada de 30 min: corregir los 5 puntos anteriores y añadir los scripts
  nuevos (`smoke:vercel`, `test:server` de T17).
- Documentar lo que cierra esta semana: rate limit por función (ya
  anotado), `/sql` protegida, ciclo de vida `PATCH/DELETE`, CSP, PWA.
- `decisiones.md` (2026-09-29, «`api/index.ts` exporta la app como
  *default*») está superada por T10/T13 de la semana 1: **no lo edites**;
  anota en tu log la propuesta de corrección.

**Hecho cuando:** cada comando del README existe en `package.json` y cada
ruta descrita responde como dice; `grep -n "asyncHandler\|tres tablas\|
ayudaencali.lat" README.md` → 0.

### T20 · Higiene del paquete y referencias rotas (FAL-15) — **agente-calidad** · ✅ · ¿paralela con T17/T18? · coordinada con agente-frontend

`index.html:52` cita `src/utils/thirdPartyFonts.ts` (el real es
`src/utils/consent.ts`) y quedan `preconnect` a fuentes; dependencias sin
uso: `motion`, `autoprefixer`, `esbuild` (grep → 0); sin `package-lock.json`
(solo `bun.lock` desactualizado).

**Hacer:**
- `package.json`: quitar `motion`, `autoprefixer`, `esbuild` tras confirmar
  con grep que nada los usa (ojo: `motion` puede venir arrastrado por
  Tailwind — verificar antes de quitar).
- Lockfile: `bun.lock` está congelado y es de la persona → **no** generes
  `package-lock.json` sin consenso; anota la propuesta y su coste en tu log
  (la CI ya hace `npm ci || npm install`).
- `index.html:52-56`: comentario con el fichero mal citado + `preconnect`
  huérfanos → `index.html` es de agente-frontend: pídeselo o hazlo con su
  autorización anotada.

**Hecho cuando:** `grep -rn "thirdPartyFonts\|preconnect.*fonts.g" index.html`
→ 0; tras la limpieza `lint` + `vite build` + `test:ui` + `smoke:vercel`
siguen verdes.

---

## T0 · Verificación final — **agente-calidad** · 🟡

Se lanza cuando T1-T20 estén `✅` (o con las pendientes anotadas y su causa).

- `npm run lint` · `npx vite build` · `npm run test:ui` ·
  `npm run smoke:vercel`.
- `npm run verify:rls` **solo si cambió** `supabase/schema.sql` (T1, T7).
- Humo local de producción: `NODE_ENV=production PORT=3124 node --import
  tsx server.ts` → `/api/health` 200 y `/ruta-inexistente` 404.
- Humo **contra producción, pendiente de que la persona haga commit+push**:
  `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel`
  (cierra los riesgos heredados P1-1, P1-2, KO-3, KO-4 de T13/T14 y valida
  en vivo T2, T3 y T17).
- Comprobar en el deploy: `vercel.json` con **≤ 12** funciones y válido
  contra el schema oficial; `/api/supabase/sql` → 401 sin token; cabeceras
  (CSP) visibles en `/`; imports con `.js` explícito en todo fichero nuevo
  de `api/` y `server/`.
- Cada agente escribe su log en `docs/agentes/memoria/<NN>-<area>.md` y
  consolida incidencias en `docs/agentes/README.md`.

**Hecho cuando:** todo en verde y sin bloqueantes, con el humo de producción
ejecutado (o su impedimento anotado, con responsable y fecha).

---

## Backlog (sin asignar)

- **FEAT-03 · Landings por barrio** — `/barrio/<barrio>` con SEO; exige
  react-router y revisar la decisión 2026-09-29 («sin enrutador, la 404 la
  sirve el servidor»). Hay `src/utils/seo.ts` y el dataset de barrios.
- **FEAT-04 · Alertas por barrio** — push/in-app «nueva necesidad a 500 m»;
  el sustrato (geolocalización, `barrio`, `Toast` con `aria-live`) ya está.
- **FEAT-06 · API pública versionada** — `?page&limit` reales + `/api/v1`;
  arranca con lo que deje T3 (p. ej. montar el versionado en los mismos
  rewrites sin duplicar funciones).
- **FEAT-08 · Orden por proximidad** — haversine en mapa/tablón «cerca de
  mí»; conviene extraerlo a un módulo compartido para reutilizarlo en T8.
- **FEAT-10 · Realtime de Supabase** — `postgres_changes` para actualizar
  mapa/tablón sin refresco; el esquema ya está.
- **FEAT-12 · Métricas de impacto** — agregaciones (necesidades cerradas,
  tiempos por barrio) para colectivos; naturalmente apoya en FEAT-01/T10.
