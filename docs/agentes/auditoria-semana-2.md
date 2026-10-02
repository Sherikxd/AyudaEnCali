# Auditoría semana 2 — falencias y features a explotar

> Informe del agente de auditoría (2026-09-30). Insumo para
> `tareas-semana-2.md`. Severidad: P1 = alta, P2 = media, P3 = baja.

## FAL-01 · Sin ciclo de vida de necesidades (P1)

No existe ningún `PUT` ni `DELETE` en toda la API (`server/app.ts`,
`server/handlers/*.ts`: grep → 0). Además `POST /api/needs` fuerza
`status: 'activa'` y `supportersCount: 1`
(`server/handlers/needs.ts:67-68`): una necesidad nueva aparece ya con 1
apoyo falso. La pestaña «resuelta» del filtro de `BlogView` es código
muerto: nadie puede marcar nada como resuelta ni editar/borrar lo que
publica.
*Impacto:* el ciclo publicar → resolver → cerrar → eliminar abuso no
existe; el contador miente desde el primer segundo.
*Esfuerzo:* medio (`PATCH/DELETE /api/needs/:id`, `PUT/DELETE
/api/points/:id` con auth de autoría — requiere FAL-02 — y front).

## FAL-02 · Entidades sin atar a identidades (P1)

`help_needs` no tiene columna `author_id` y `point_comments` no tiene
foreign key a `help_points` (`supabase/schema.sql:85-100`): no se sabe
quién creó una necesidad y los comentarios pueden quedar huérfanos.
*Impacto:* imposible moderar o aplicar «solo el autor edita»; bloquea
FEAT-01/FEAT-02.
*Esfuerzo:* bajo (`ALTER TABLE` + backfill); toca `supabase/schema.sql`
→ exige `npm run verify:rls`.

## FAL-03 · Suplantación de identidad en puntos (P1)

`userName`, `userRole` y `userBarrio` se aceptan del body del cliente
(`server/validation.ts:220-223`): cualquiera puede crear un punto
firmado como «Cruz Roja» o «Alcaldía»; el marker de Leaflet pinta ese
nombre.
*Impacto:* fraude de identidad en una app de emergencias.
*Esfuerzo:* bajo — derivar esos campos de `req.user` verificado (rompe
compat: ajustar el front).

## FAL-04 · IDs de cliente con `Date.now()` (P1)

`cali-point-${Date.now()}` / `cali-need-${Date.now()}`
(`src/context/AppContext.tsx:1002,1060,1111`): doble clic o dos
pestañas en el mismo ms colisionan; con la cola offline dos dispositivos
pueden generar la misma clave → pérdida silenciosa de reportes.
*Esfuerzo:* bajo — ID en el servidor o `crypto.randomUUID()`.

## FAL-05 · `/api/supabase/sql` público y GET sin rate limit (P1)

`GET /api/supabase/sql` expone el DDL completo sin autenticación
(`server/handlers/sql.ts:12`). Los GET de puntos/necesidades/comentarios
no llevan rate limit (el `writeLimiter` solo está en POST) ni
paginación: `LIMIT 500` y filtrado en memoria.
*Impacto:* reconocimiento de esquema + scrapeo/DoS barato de las rutas
más usadas.
*Esfuerzo:* bajo — token admin en `/sql` (o retirarla en prod) +
`readLimiter` + `LIMIT/OFFSET` reales.

## FAL-06 · Bypass del rate limit vía `X-Forwarded-For` (P1)

`clientIp()` confía en la primera IP de la cabecera sin validar
(`server/http.ts:243-249`); deuda reconocida en
`memoria/14-reverificacion-t13.md:130`.
*Impacto:* los límites de 15/min (chat, coste real de Gemini) y 60/min
son decorativos para un atacante.
*Esfuerzo:* bajo-medio — confiar en el primer salto (`trust proxy` /
`req.ip`) y validar formato de IP.

## FAL-07 · Cobertura de tests muy baja (P2)

`scripts/test-authmodal.mjs` (40 checks) tiene ~15 que son regex sobre
el fuente; **cero** tests de `server/handlers/*` y **cero** de T5–T8
(`signOut`, `mergeById`, `Toast`, `ensureIdentity`, cola offline).
*Impacto:* «40/40 verde» no protege la lógica de negocio.
*Esfuerzo:* medio — tests unitarios de handlers y de la cola/merge.

## FAL-08 · Seed duplicado: local ≠ producción (P2)

`src/data/initialData.ts` (32 puntos / 6 necesidades) vs
`server/seedData.ts` (5 puntos / 3 necesidades; unos con
`supportersCount: 18`). El README describe «5 puntos, 3 necesidades».
*Impacto:* QA local ≠ prod; contadores con patrón imposible.
*Esfuerzo:* bajo — única fuente de verdad importada por el front.

## FAL-09 · AppContext de 1349 líneas sin memoización (P2)

El `value` del Provider se reconstruye en cada render (sin `useMemo`;
~25 `useState`): cada like/filtro/tecla re-renderiza MapView + BlogView +
ChatView → jank en móviles (el dispositivo objetivo).
*Esfuerzo:* medio-alto — `useMemo` del value, sub-contextos o
`useReducer` + selectores.

## FAL-10 · Triplicación del fallback del chat (P2)

`getLocalIntelligentFallback` (`src/services/geminiService.ts:38`),
`buildLocalReply` (`server/handlers/chat.ts:105`) y una tercera rama de
reintento conviven con lógica distinta y timeouts distintos (30 s vs
15 s).
*Esfuerzo:* bajo — un único módulo servido por la API.

## FAL-11 · Accesibilidad a medias (P2)

Solo `FaqModal` declara `role="dialog"` + `aria-modal`; `ReportModal` y
`LocationModal` no, no cierran con `Escape` ni atrapan el foco;
`BottomNav` sin `aria-current`; `ChatView` sin ARIA; `aria-live` solo en
`Toast.tsx:73`.
*Esfuerzo:* bajo — patrón modal ya existente en `FaqModal`.

## FAL-12 · Despliegue sin puerta de CI (P2)

`vercel.json` usa `"buildCommand": "vite build"`; nada exige que la CI
(`.github/workflows/ci.yml`) esté verde antes de desplegar. Un push
directo despliega sin `tsc` ni tests.
*Esfuerzo:* bajo — `ignoreCommand`/build con lint+test y protección de
rama.

## FAL-13 · Sin Content-Security-Policy (P2)

Cero CSP en el repo (ni `server/middleware.ts` ni `vercel.json`) y los
estáticos del CDN no reciben las cabeceras de seguridad de la función.
*Esfuerzo:* bajo-medio — CSP estricta + headers en estáticos.

## FAL-14 · README desincronizado del código (P3)

`README.md:96` dice que `api/index.ts` «exporta la app como default»
(contradicho en `:410`); `:71` cita `asyncHandler` (ya no existe);
`:220` «tres tablas» (son 4 con `need_supporters`); `:556` producción en
`ayudaencali.lat` frente al deploy real `ayuda-en-cali.vercel.app`; la
tabla de scripts omite `smoke:vercel`.
*Esfuerzo:* bajo — pasada de 30 min.

## FAL-15 · Higiene del paquete y referencias rotas (P3)

`index.html:52` cita `src/utils/thirdPartyFonts.ts` (inexistente; el
real es `src/utils/consent.ts`) y mantiene `preconnect` a fuentes;
dependencias sin uso: `motion`, `autoprefixer`, `esbuild` (grep → 0);
sin `package-lock.json` (solo `bun.lock` desactualizado).
*Esfuerzo:* bajo.

## FEAT-01 · Ciclo de vida de necesidades (valor ALTO)

`activa → resuelta → archivada` + edición/borrado por el autor. No
existe (schema y validación lo declaran, nada lo cambia); el filtro
«resuelta» es UI sin backend. *Requiere* FAL-02. *Esfuerzo:* medio.

## FEAT-02 · Verificación y moderación (valor ALTO)

Badge `verified` real, cola de reportes y roles
(`admin`/`verificador`). A medias: el campo existe pero todos los
puntos nuevos nacen `verified:false` → la estadística siempre miente.
Antídoto de producto para FAL-03. *Esfuerzo:* medio.

## FEAT-03 · Landings por barrio (valor ALTO)

`/barrio/<barrio>` con SEO («emergencias Cali <barrio>»). No hay
router hoy; hay `src/utils/seo.ts` y el dataset de barrios.
*Esfuerzo:* medio (react-router + template).

## FEAT-04 · Alertas por barrio (valor ALTO)

Push/in-app «hay una necesidad nueva a 500 m». No existe push; el
sustrato (geolocalización, `barrio`, `Toast` con `aria-live`) sí.
*Esfuerzo:* medio-alto (empezar in-app).

## FEAT-05 · PWA offline (valor ALTO)

Cola `pendingWrite` + `mergeById` ya hechos (T6); faltan
`manifest.webmanifest`, Service Worker e iconos instalables.
*Esfuerzo:* bajo-medio.

## FEAT-06 · API pública versionada (valor MEDIO-ALTO)

GETs públicos y limpios pero sin paginación real ni versionado;
`/api/supabase/sql` mezclada (FAL-05). *Esfuerzo:* bajo para
`?page&limit` + `/api/v1`.

## FEAT-07 · Chat con contexto geográfico real (valor MEDIO-ALTO)

El cliente manda ubicación pero el servidor no inyecta
`help_points`/`help_needs` en el prompt de Gemini → respuestas
genéricas. *Esfuerzo:* bajo-medio.

## FEAT-08 · Orden por proximidad (valor MEDIO)

Haversine para ordenar mapa/tablón «cerca de mí». Los lat/lng ya
están; no hay cálculo de distancia. *Esfuerzo:* bajo.

## FEAT-09 · verify:rls y smoke en la CI (valor MEDIO)

`verify:rls` (10 pasos) y `smoke:vercel` (35 checks) existen pero la CI
no los ejecuta; Vercel despliega con solo `vite build`. Cierra FAL-12.
*Esfuerzo:* bajo.

## FEAT-10 · Realtime de Supabase (valor MEDIO)

`postgres_changes` para actualizar mapa/tablón sin refresco. No existe;
el esquema ya está. *Esfuerzo:* medio.

## FEAT-11 · Clustering de marcadores + badge verificado (valor MEDIO)

`L.layerGroup` plano en `MapView.tsx`; con 32+ puntos se satura.
*Esfuerzo:* bajo (`leaflet.markercluster` + icono por `verified`).

## FEAT-12 · Métricas de impacto (valor MEDIO-BAJO)

Agregaciones (necesidades cerradas, tiempos por barrio) para mostrar a
colectivos. No existe. *Esfuerzo:* medio.

## Riesgos abiertos heredados

- Smoke **contra producción** pendiente tras el commit+push de la
  persona: `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run
  smoke:vercel` (cierra P1-1, P1-2, KO-3, KO-4 de T13/T14).
- `X-Forwarded-For` sin validar (deuda aceptada en
  `memoria/14-reverificacion-t13.md:130`) → hoy es FAL-06.
- Checklist de migración (`memoria/06-checklist-migracion.md`): abiertos
  B2 (sql expuesto → FAL-05), O2 (referencia rota → FAL-15), O4 (deps
  sin uso → FAL-15), O9 (headers en estáticos → FAL-13).
- Los 9 riesgos no bloqueantes de T0 (`memoria/03-verificacion.md`)
  siguen en pie en su mayoría (IDs, IP, seed, tests).
- **Nunca** se ha validado el ciclo completo CI → deploy → smoke en prod.

## Estado de la verificación (según logs, no ejecutado en la auditoría)

- `lint` ✅ · `vite build` ✅ · `test:ui` ✅ 40/40 · `smoke:vercel` ✅
  35/35 · `verify:rls` ✅ 10 pasos · reverificación T14 ✅ 89/89.
- **Pendiente:** smoke contra prod (condicionado a commit+push).
- Advertencia: la CI verde no cubre FAL-01..FAL-06 ni FAL-09..FAL-13:
  son fallos de diseño que ningún test actual ejercita.

## Segunda pasada (2026-10-01, revisión con Copilot como pensador principal)

> `copilot -p` leyó memorias, tableros, auditorías y el código actual; su plan
> completo vive en `plan-copilot-2026-10-01.md` y sus tareas en el tablero
> (T21-T26). Todo cerrado el mismo día.

### FAL-16 · Apoyo que responde éxito sin persistir (P1) — ✅

`server/handlers/needsSupport.ts:182-200`: con Supabase configurado pero la
escritura sin confirmar (RPC transitoria agotada o `write.error` en el
respaldo) el handler caía a `if (!handledInDb)`, mutaba solo la caché y
respondía `success: true` (200). En Vercel la memoria no es persistencia: el
apoyo se perdía en un cold start y el cliente lo daba por confirmado.
*Arreglado en T21* (503 sin tocar caché; caché solo sin BD).

### FAL-17 · Cola offline: rechazo permanente sin estado accionable (P2) — ✅

`src/context/AppContext.tsx:201,857-889`: un 4xx permanente solo se
registraba; el ítem se quedaba `pending` para siempre (3 reintentos agotados)
sin forma de corregirlo o descartarlo.
*Arreglado en T24* (estado `failed` + Toast Reintentar/Descartar).

### FAL-18 · Contador de apoyos truncado a 10 000 (P3) — ✅

`needsSupport.ts:149-165`: el respaldo sin RPC usaba `.limit(10_000)` +
`rows.length` como total.
*Arreglado en T22* (conteo exacto PostgREST).

### FEAT-13 · Test de contrato Express ↔ funciones Vercel (valor ALTO) — ✅

Paridad de escenarios (401/403/404/503, rewrites) entre ambos adaptadores;
hoy en `test-nucleos.mjs` (sección M) dentro de `test:server` (84/84).
*Hecho en T23.*

### FEAT-14 · Proximidad «Cerca de mí» en mapa y tablón (valor ALTO) — ✅

Orden/filtro optativo por distancia (barrio primero, centroide con `≈`),
apagado por defecto. *Hecho en T25.*

### FEAT-15 · Alertas locales por barrio (valor ALTO) — ✅

Sondeo optativo y deduplicado del GET existente para avisar de necesidades
nuevas del barrio, sin coordenadas salientes ni funciones nuevas.
*Hecho en T26.*
