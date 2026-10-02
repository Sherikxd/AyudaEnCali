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
| **Pendientes** | T7→T28 moderación, T11→T29 semilla, T15→T30 PWA | ✅ las tres hechas (ver ronda objetivos) | `memoria/27`, `28`, `29` |
| **T0** | puerta local 2026-10-02: `lint` ✅ · `vite build` ✅ · `test:ui` 40/40 ✅ · `test:server` ✅ (S1-S19) · `smoke:vercel` **51/51** ✅ · `verify:rls` **13 pasos** ✅ | 🟡 **falta el humo contra producción** (tras commit+push) | — |
| **Ronda Copilot** (pensador) | T21-T26: BUG-01/02/03 + MEJ-01/02/03 | ✅ · `test:server` **84/84**, `smoke` 43/43, `lint` ✅ | `plan-copilot-2026-10-01.md`, `memoria/24`, `memoria/25` |
| **Auditoría objetivos** (Copilot) | T27-T33 | ✅ T27 (**41/41 prod**) · T28 · T29 · T30 · T32 · ⛔ T31 (credenciales) · ⬜ T33 | `auditoria-objetivos-2026-10-01.md`, `memoria/27-29` |
| **Ronda SEO** (3 agentes) | investigación → plan T34-T42 | ✅ 3 informes + plan · ✅ **Fase 1 ejecutada** (T34-T37 ∥ T39) · ⬜ T38/T40+ decisión | `seo/*`, `seo/plan-seo.md`, `memoria/31`, `memoria/32` |

---

## Ronda del pensador principal (Copilot CLI) — 2026-10-01 · T21-T26

> Plan completo en [`plan-copilot-2026-10-01.md`](plan-copilot-2026-10-01.md):
> `copilot -p` leyó memorias, tableros, auditorías y código, y decidió 3 bugs
> y 3 mejoras (registrados además como FAL-16..18 / FEAT-13..15 en la
> auditoría). Reparto: T21-T23 backend ∥ T24-T26 frontend (paralelos, sin
> compartir ficheros); cierre con la puerta habitual.

### T21 · BUG-01 (P1) · Apoyo que responde éxito sin persistir — **agente-backend** · ✅

`server/handlers/needsSupport.ts`: con Supabase configurado pero la
escritura sin confirmar (RPC transitoria agotada o `write.error` en el
respaldo) el handler caía a `if (!handledInDb)`, mutaba la caché y
respondía `success: true` (200) → el apoyo se perdía en un cold start de
Vercel y el cliente lo daba por confirmado.
**Hacer:** BD configurada + escritura no confirmada → `respondWriteFailure`
(**503**) sin tocar caché ni set de supporters; el toggle en caché solo
cuando **no** hay cliente Supabase; tests en `test-nucleos.mjs`.
**Hecho cuando:** 503 ante fallo transitorio (nunca `success: true`), 200
solo con confirmación, tests en verde y en rojo al sabotear.

### T22 · BUG-03 (P3) · Contador truncado a 10 000 — **agente-backend** · ✅

Mismo fichero: el respaldo sin RPC usaba `.limit(10_000)` + `rows.length`.
**Hecho cuando:** conteo exacto PostgREST (`count: 'exact', head: true`) con
guard → 503 si no hay recuento; test del camino fallback.

### T23 · MEJ-01 · Contrato Express ↔ funciones Vercel — **agente-backend** · ✅

**Hecho cuando:** sección nueva en `scripts/test-nucleos.mjs` que ejecuta los
mismos escenarios contra Express y contra las funciones (`_orig`/`id`,
espejos) exigiendo mismo status y cuerpo — 401/403/404/503 y persistencia —
y `npm run test:server` queda en **84/84** dentro de la CI.

### T24 · BUG-02 (P2) · Cola offline sin estado accionable — **agente-frontend** · ✅

`src/context/AppContext.tsx`: un 4xx permanente solo se registraba y el
ítem se quedaba `pending` para siempre.
**Hecho cuando:** transitorio (red/5xx/429) sigue con 3 intentos; permanente
(4xx salvo 401/408/429) → estado `failed` con payload intacto, Toast
accionable «Reintentar»/«Descartar» (doble confirmación, `aria-live`); 401
→ flujo `handleUnauthorized` existente; `test:ui` ✅.

### T25 · MEJ-02 · Proximidad «Cerca de mí» — **agente-frontend** · ✅

**Hecho cuando:** opción optativa **apagada por defecto** en mapa (filtra
≤5 km y ordena por distancia) y tablón (barrio primero, centroide con `≈` y
aclaración), sin dependencias ni orden por defecto alterado.

### T26 · MEJ-03 · Alertas locales por barrio — **agente-frontend** · ✅

El refresco solo corría con error/pendientes.
**Hecho cuando:** suscripción optativa persistida en localStorage, sondeo
acotado (75 s, GET existente) deduplicado por ID con aviso `Toast`, sin
enviar coordenadas del navegador y sin funciones Vercel nuevas.

---

## Auditoría de objetivos (Copilot 2) — 2026-10-01 · OBJ-01..05 + T27-T33

> Informe completo en
> [`auditoria-objetivos-2026-10-01.md`](auditoria-objetivos-2026-10-01.md)
> (con las notas de validación del coordinador). Objetivos:
> **OBJ-01** producción validada de punta a punta · **OBJ-02** semana 2
> cerrada (T7/T11/T15/T0) · **OBJ-03** dashboard con datos reales (S3) ·
> **OBJ-04** moderación y confianza · **OBJ-05** backlog sin ampliar plan.
> *Regla de oro del auditor: no abrir features nuevas hasta validar la
> producción real.*

### T27 · Humo oficial contra producción (T0 reubicado) — **agente-calidad** · ✅ · → OBJ-01

`SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel`.
**Hecho cuando:** batería 100% en verde contra el deploy live, sin
discrepancias 401/403/404/503 entre Express y Vercel. *Nota:* cierra los
heredados P1-1/P1-2/KO-3/KO-4 con el deploy actual; repetir tras el
commit+push del cambio de esta semana.

**Resultado (2026-10-02):** ✅ **41 comprobaciones · 0 fallos** contra
`https://ayuda-en-cali.vercel.app` → cierra P1-1, P1-2, KO-3 y KO-4.
Pendiente repetir tras el push de la ronda T21-T33.

### T28 · Verificación y moderación (T7 heredada) — **agente-backend** · ✅ · depende de T1/T2 → OBJ-02, OBJ-04

`verified` real por rol, tabla `entity_reports` (RLS sin políticas),
`POST/GET /api/reports` (401/403), UI de cola; montar en función existente
(sin pasar de 12). **Hecho cuando:** punto `verified` solo con rol
moderador; reportes con sesión; `verify:rls` ✅; ≤12 funciones.

**Resultado (2026-10-02):** ✅ `PATCH /api/points/:id` (solo `verified`,
401/403/404/400) · `POST /api/reports` (201, idempotente) ·
`GET /api/reports` paginado (403 sin rol) · moderador = `coordinador` en el
JWT (+`MODERATOR_USER_IDS`) · `entity_reports` con FK y RLS sin políticas ·
rewrite en `vercel.json` (10/12 funciones) · `lint` ✅ · `test:server`
**121/121** · `smoke` **46/46** · `verify:rls` **13 pasos** · sabotajes en
rojo verificados. **Pendiente: la UI de cola (frontend)** — contrato en
`memoria/27-moderacion.md`.

### T29 · Semilla única (T11 heredada) — **agente-backend + agente-frontend** ✅ · → OBJ-02

Unificar `server/seedData.ts` ↔ `src/data/initialData.ts` en una sola
fuente de verdad y cuadrar contadores con `need_supporters`.
**Hecho cuando:** `db:seed` y el front pintan lo mismo que producción.

**Resultado (2026-10-02):** ✅ parte cliente en `memoria/20` (cabecera de
`initialData.ts`); parte servidor en `memoria/28-backend-semilla-headers.md`:
`server/seedData.ts` = copia verbatim de los 32 puntos / 6 necesidades / 4
comentarios del front, con **paridad carácter a carácter garantizada por
`test:server` S1–S4** (import literal imposible hoy: `initialData.ts:2` no
lleva `.js` y `src/**` es del agente-frontend → deuda documentada);
`need_supporters` siembra con reglas puras (`server/seedSupporters.ts`):
contador = filas reales (`18/1/22/45/15/52` en la BD real, nunca inflado).
`db:setup` (la BD real no tenía `author_id`) + `db:seed` ×2 idempotente.
`test:server` **140/140** · `smoke` **51/51** · sabotajes en rojo verificados.

### T30 · PWA offline (T15 heredada) — **agente-frontend** · ✅ · depende de T9/T12 → OBJ-02

`manifest.webmanifest` + Service Worker (precache shell, SWR en GET,
network-first en POST con la cola existente), respetando la 404 real.
**Hecho cuando:** instalable, offline funcional y cola al volver.

**Resultado (2026-10-02):** ✅ `public/manifest.webmanifest` (standalone,
theme `#EA580C`, 6 iconos) + `public/sw.js` versionado (`CACHE_VERSION`,
limpieza en `activate`) + iconos 192/512 y maskable generados desde el
`favicon.svg`; `<link rel="manifest">` en `index.html` y registro en
`src/main.tsx` **solo PROD + con soporte**. Estrategias: navegaciones
**network-first** (con red manda el servidor → la **404 real no se rompe**;
sin red: `/` → shell offline, otras rutas → `404.html` con estado 404) ·
`GET /api/config` network-first (Clerk nunca caducada) · resto `GET /api/*`
stale-while-revalidate · `/assets/*` cache-first · escrituras no
interceptadas (cola `pendingWrite` existente). Fuera cross-origin,
`/api/supabase/*` y Authorization. Verificado: `node --check` ✅ ·
`vite build` genera `dist/sw.js` + `dist/manifest.webmanifest` ✅ ·
`lint`/`test:ui` ✅ · fetch local de `/sw.js` y `/manifest` 200 ✅.
**Deuda:** cabecera `no-cache` de `/sw.js` en `vercel.json` (área calidad).
Log en `memoria/29-frontend-pwa.md`.

### T31 · Export real al cluster + contrato de dashboard — **agente-backend** · ⛔ bloqueada (falta `S3_*` de la persona) → OBJ-03

Validar `npm run export:s3` contra el bucket real, confirmar layout y
`manifest.json`, bucket privado. **Hecho cuando:** exit 0 real y el
dashboard lee el manifest sin interpretación manual.

### T32 · Paridad de seguridad local/Docker — **agente-backend** · ✅ → OBJ-01, OBJ-02

CSP y cabeceras también en `server/http.ts`/`middleware.ts` (hoy solo en
`vercel.json`), reconfirmar `readLimiter`/`writeLimiter`/XFF.
**Hecho cuando:** `curl -I` local muestra las mismas cabeceras y el humo
sigue en verde.

**Resultado (2026-10-02):** ✅ `server/http.ts` → `CONTENT_SECURITY_POLICY`
(923 chars, copia textual del bloque `/` de `vercel.json`), `PERMISSIONS_POLICY`
y `setSecurityHeaders` con las **5 cabeceras** de `vercel.json` + `COOP`
(solo adaptador de API); Express (API **y** HTML local/Docker) y el adapter
de funciones ya delegaban en esa función, sin tocar `middleware.ts`/
`app.ts`/`vercel.ts`. Única relajación: `npm run dev` (`relaxCspForViteDev`,
solo `script-src`/`connect-src`). `curl -I` local: CSP **idéntica byte a
byte** (923) en `/` y `/api/health` + 5 cabeceras + COOP; `readLimiter` /
`writeLimiter` / XFF reconfirmados (secciones D y S16). Tests nuevos
`S12–S19` (Express por HTTP real) + 5 checks en `smoke:vercel`;
sabotaje de CSP → rojo en ambas suites. Ver log en
`memoria/28-backend-semilla-headers.md`.

### T33 · Backlog (solo si hay capacidad, alcance corregido) — **agente-frontend + agente-backend** · ⬜ · → OBJ-05

*Corregido por validación:* FEAT-08 y FEAT-04-locale ya están hechos
(T25/T26). Quedan FEAT-03 landings, FEAT-06 API v1, FEAT-10 realtime,
FEAT-12 métricas y notificaciones *push*. **No asignar hasta OBJ-01/02
cerrados.**

---

## Ronda SEO — 2026-10-02 · T34-T42

> Investigación con **3 agentes en paralelo** → informes en
> [`seo/01-tecnico.md`](seo/01-tecnico.md) (SEO-01..18),
> [`seo/02-keywords.md`](seo/02-keywords.md) (QW-01..10, huecos H1..H5),
> [`seo/03-geo-ia.md`](seo/03-geo-ia.md) (GEO-01..10).
> **Plan consolidado con asignación, fases y decisiones:**
> [`seo/plan-seo.md`](seo/plan-seo.md) (aquí solo el estado).

### T34 · Archivos base de rastreo (robots/sitemap/llms/favicon) — **agente-frontend** · 🟡 · → SEO-01/02/06, GEO-01/04/05, QW-01

`public/robots.txt` (permite todos los crawlers según la decisión anotada en
el propio archivo; difiere de la recomendación inicial GEO-01) · sitemap con
solo la raíz canónica `https://www.ayudaencali.lat/` · `llms.txt` · favicon.
**Hecho cuando:** los recursos responden 200 en producción y GSC/robots no
reportan errores. ✅ 2026-10-02: los ficheros están en `public/` y llegan a
`dist/`; el dominio raíz redirige a `www`. ⬜ Producción aún sirve 404 para
`robots.txt`, `sitemap.xml` y `llms.txt` (revisado hoy); falta desplegar esta
rama, comprobar los 200 y completar Search Console.

### T35 · JSON-LD + shell indexable en `index.html` — **agente-frontend** · ✅ · → SEO-03/04/09/16, GEO-02/03

`WebSite`+`Organization`+`FAQPage` (FAQ contrastado automáticamente con
`src/data/faq.ts`; sin `SearchAction`, porque el sitio no implementa una
búsqueda general) · HTML inicial con contenido útil sin JS · descripción
alineada con la vista raíz · `lang="es-CO"`. `FAQPage` no garantiza resultados
enriquecidos: Google los limita a sitios oficiales y de salud autorizados.
**Hecho cuando:** Rich Results Test sin errores y un crawler sin JS ve
contenido.
✅ 2026-10-02: los 3 bloques parsean y el shell estático está en el
`<body>`. *Decisión GEO-03:* **sin** `EmergencyService` (no somos
entidad oficial); `FAQPage` se genera desde `src/data/faq.ts` con
comando de regeneración documentado.

### T36 · On-page por vista — **agente-frontend** · ✅ · → SEO-07/11/12/13/16, QW-02

`<h1>` en MapView/ChatView · title/descripción del mapa reoptimizados ·
`<footer>` con enlaces · `aria-current` · `seo.ts` completo · `srcset`/
`fetchpriority` héroe · `alt` en marcadores Leaflet.
**Hecho cuando:** cada vista tiene H1 y la navegación deja enlaces reales.
✅ 2026-10-02: todas las descripciones ≤155 car., title del mapa 51 car.
(marca + keyword exacta), `aria-current` en los 4 botones del header y
enlaces de texto en header/pie. *Nota:* en marcadores `divIcon` la
opción `alt` no llega al DOM → texto accesible por `aria-label`.

### T37 · FAQ visible e indexable — **agente-frontend** · ✅ · depende de T35 → SEO-08, QW-03

Sección `/#preguntas-frecuentes` en el flujo normal (no modal que devuelve
`null`) con las 8 actuales + preguntas PAA de la investigación.
**Hecho cuando:** las preguntas están en el DOM sin interactuar y casan
con el JSON-LD de T35.
✅ 2026-10-02: `src/components/FaqSection.tsx` montada en `App.tsx`
(13 preguntas en `<details>`, siempre en el DOM, todas las pestañas);
`FAQPage` de `index.html` = 13/13 idéntico a `buildFaqPageJsonLd()`.

### T38 · Pestaña ↔ URL (pushState) + enlaces `<a>` — **agente-frontend** · ⛔ requiere decisión → SEO-05/12

Sincronizar vista con URL **sin añadir router** (la decisión 2026-09-29 se
mantiene). **Bloqueada** hasta luz verde: ver `seo/plan-seo.md` §4.1.

### T39 · API sin indexar (`X-Robots-Tag`) — **agente-backend** · ✅ · → SEO-15

`X-Robots-Tag: noindex` en `/api/*`. **Hecho cuando:** `curl -I
/api/health` lo muestra y el humo sigue en verde.

**Resultado (2026-10-02):** ✅ helper `setApiRobotsHeaders` en
`server/http.ts` + montaje **solo** por prefijo `/api` (`server/app.ts`)
y en `createApiRoute` (`server/vercel.ts`, cubre también `/api/reports`);
`setSecurityHeaders` de T32 intacto (**el HTML `/` no la lleva** — guardas
S20/S24). `curl -I`: `/api/health` 200+noindex, `/` 200 sin la cabecera ·
`test:server` **146/146** (S20–S25) · `smoke` **53/53** · sabotaje → 3+1
fallos y restaurado a verde. Log en `memoria/32-backend-xrobots.md`.

### T40 · Landings keyword (FEAT-03 primer lote) — **agente-frontend** · ⬜ · bloqueada por T38 → QW-04..08, huecos H1/H2/H4

`/emergencias-cali`, `/terremoto-cali`, 5 barrios,
`/veterinarias-24-horas-cali`, `/donar-en-cali`, `/lluvias-cali` (antes de
noviembre) · sello «actualizado el …» + `ItemList`.
**Hecho cuando:** URL por keyword P1 viva y en el sitemap.

### T41 · Baseline GEO + Search Console — **persona + coordinador** · ⬜ · → GEO-10

Panel 10 preguntas × 5 motores **antes de tocar nada**, alta en Search
Console + sitemap, canal GA4 IA. **Hecho cuando:** existe el «antes».

### T42 · Entidad off-site (GBP/Wikidata/prensa) — **persona** · ⬜ · → QW-09, H5, GEO-08

Google Business Profile, Wikidata con `official website`, prensa local
(90minutos/Occidente/Pulzo), Reddit, directorios oficiales.

### T43 · Integridad SEO tras revisión de fuentes — **coordinación** · ✅

Canónica y OG unificadas con el host de producción `www` · sitemap sin
`lastmod`/`changefreq`/`priority` no verificables · retirado `SearchAction`
que apuntaba a una búsqueda inexistente · FAQ JSON-LD contrastado con la
fuente TypeScript · shell estático mejorado · comentarios corregidos: los
fragmentos no son páginas indexables. Pruebas locales: lint, build y test UI
verdes. **Pendiente externo:** producción aún no tiene desplegados los
archivos SEO nuevos; hacer deploy y repetir comprobaciones de T34/T39 y GSC.
**Hecho cuando:** «AyudaEnCali» existe como entidad fuera del repo.

### T43/T44 · Deuda SEO (prerender + `vercel.json`) — **frontend + calidad** · ⬜ · decisión

Prerender del shell en build (T43) · redirect 308 del espejo + CSP en
todas las rutas + no-cache de `/sw.js` (T44, `vercel.json` = área calidad).

**Paralelismo:** Grupo 1 `T27 ∥ T28` (calidad/backend disjuntos) · Grupo 2
`T29 ∥ T30 ∥ T32` · **Grupo SEO `T34→T35→T36` (frontend secuencial) ∥
`T39` (backend)** · T37 tras la puerta · T38/T40 con decisión de la
persona · T41/T42 en paralelo (persona, desde ya) · T31 al recibir
credenciales · T33 al final.
*Cadena crítica:* T27 → T28 → T31 → dashboard · T38 → T40 → T43.

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
