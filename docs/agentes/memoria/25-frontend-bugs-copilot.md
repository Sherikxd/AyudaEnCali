# Log — frontend (2026-10-01)

## En qué trabajé

- Ronda del plan `docs/agentes/plan-copilot-2026-10-01.md` en el lado cliente:
  **BUG-02** (P2) → **MEJ-02** (Alto) → **MEJ-03** (Alto), en ese orden porque
  los tres tocan `src/context/AppContext.tsx`.
- Solo mi área: `src/**` (no toqué `index.html`, ni `server/**`, `api/**`,
  `supabase/**`, `scripts/**`, `package.json` ni los tableros). **0 dependencias
  nuevas**, sin `any`, sin `@ts-ignore`, sin `console.*` (logger de
  `src/utils/logger.ts`) y **sin `git commit`**.
- Estas tres tareas **no están en `tareas-semana-1.md`** (ese tablero está
  cerrado y remite a `tareas-semana-2.md`, que está fuera de mi área): quien
  gestione el tablero puede marcarlas citando el plan.

## Cambios realizados

### BUG-02 — rechazo permanente con acciones visibles

Ficheros: `src/types/index.ts`, `src/utils/sync.ts`, `src/context/AppContext.tsx`,
`src/components/Toast.tsx`.

- **Clasificación de fallo** (`AppContext.tsx`): `isPermanentRejection` = 4xx
  **excepto** 401/408/429 (esos siguen su flujo de siempre) → `SyncKind`
  (`'point' | 'need' | 'comment'`). Transitorio (red/timeout → `status 0`,
  5xx, 429) **sin cambios**: 3 intentos y el ítem sigue `pending`.
- **Tipos** (`types/index.ts`): `PendingLocal.syncFailed` / `syncError`
  (payload intacto, solo marca); `ToastAction` + `ToastItem.actions`.
- **Contadores** (`utils/sync.ts`): `countPending` **excluye** los
  `syncFailed` (ya no se reenvían solos) y nuevo `countFailed`. `K4` sigue
  en verde.
- **Estado `failed`** (`AppContext.tsx`): `markItemFailed` / `markFailed` /
  `clearFailedFlags` (limpia marcas **y** contadores de intentos) /
  `currentFailedIds` / `retryFailedWrites` / `discardFailedWrites`.
  El ítem conserva `pending: true` + `syncFailed: true` (nunca `pending:
  false`: eso fingiría confirmación del servidor y activaría la UI de edición
  rota).
- **Puntos de entrada de rechazo**: `handlePublishError(error, what,
  {kind,id})` marca solo si es permanente (el `401` sigue derivando a
  `handleUnauthorized` → `promptForIdentity`, y la cola no se rompe);
  `resendPending` **salta** los `syncFailed` y los marca si el servidor acaba
  rechazando durante un reenvío. `confirmPoint/Need/Comment` limpian las
  marcas al confirmar.
- **Aviso accionable** (`Toast.tsx` + efecto en `AppContext`): mientras haya
  `failed` hay un toast `aria-live` con **«Reintentar»** y **«Descartar»**
  (incluye el motivo del servidor). Los toasts con acciones **no se cierran
  solos** (el auto-cierre los salta). «Descartar» abre un **segundo aviso de
  confirmación** («Sí, descartar» / «Cancelar») antes de borrar: nada se
  pierde en silencio. Las acciones leen `listsRef` (espejo de las tres
  listas, mismo patrón que `identityRef`) para no trabajar con closures
  congeladas.
- El toast de pendientes ya **no** dice «Ya está todo sincronizado» si queda
  algo rechazado (`failedCount === 0` como condición).

**Hecho cuando:** ✅ publicar con un 4xx deja el ítem en `failed` con su
payload, aparece el aviso con ambas acciones, «Reintentar» lo sincroniza,
«Descartar» exige confirmación y lo borra, el 401 no se confunde con un
rechazo y la cola de reanudación (`L1`–`L9`) sigue intacta.

### MEJ-02 — «Cerca de mí» (optativo, apagado por defecto)

Ficheros: **nuevo** `src/utils/proximity.ts`, `src/components/MapView.tsx`,
`src/components/BlogView.tsx`.

- `src/utils/proximity.ts` reutiliza el haversine propio
  (`calculateDistanceKm` de `src/data/caliLocations.ts`): **no** importa
  `server/geo.ts` ni añade dependencias. Helpers: `isApproximateOrigin`,
  `barrioLabel` (quita «(Predeterminado)»), `normalizeBarrio`,
  `sameBarrio`, `needBarrioCentroid`, `needDistanceKm`, `formatKm`.
- **Mapa** (`MapView.tsx`): estado `nearMeOnly` (default `false`); activo →
  filtra a `NEAR_ME_MAX_KM = 5` km y ordena de más cercano a más lejano
  (con `km === null` al final y desempate estable por índice). Interruptor
  «Cerca de mí» en la barra de estado de ubicación, subtítulo que explica el
  filtro y distancia con `≈` + `sr-only "(distancia aproximada)"` cuando el
  origen es un centroide (lo es por defecto).
- **Tablón** (`BlogView.tsx`): estado `nearMe` (default `false`); activo →
  primero las necesidades del **barrio del usuario** (normalizado: tildes,
  mayúsculas, sufijo «(Predeterminado)»), después por distancia al
  **centroide** del barrio (las necesidades no llevan coordenadas, por eso
  la etiqueta es siempre aproximada) y lo desconocido al final. Chip «Cerca
  de mí» en la fila de filtros + aclaración; en la tarjeta, «Tu barrio» o
  «≈ X km» con `sr-only`. Apagado → se pinta `filteredNeeds` tal cual.

**Hecho cuando:** ✅ con el interruptor apagado el orden y la UI son los de
siempre; encendido, el orden es barrio → cercanía → desconocido (mapa: además
filtra ≤ 5 km) y las distancias van marcadas como aproximadas.

### MEJ-03 — avisos de barrio (optativos, apagados por defecto)

Ficheros: `src/context/AppContext.tsx`, `src/components/BlogView.tsx`.

- Preferencia persistida en `localStorage` (`STORAGE_KEYS.NEED_ALERTS =
  'ayudaencali_need_alerts_v1'`) con setter estable `setNeedAlertsEnabled`;
  arranque en `false` (nadie recibe avisos sin pedirlos).
- Efecto de sondeo **solo con la suscripción activa**: `GET /api/needs` (el
  mismo del sync, sin cuerpos ni coordenadas) cada `NEED_ALERT_POLL_MS =
  75 000` ms (dentro de la horquilla 60–90 s pedida). Línea base al activar
  **sin anuncio** (no avisa de lo que ya existía), deduplicación por ID
  (`alertedNeedIdsRef` + los ya conocidos), máximo `MAX_ALERTED_NEEDS = 3`
  novedades por aviso y **sin sondeo con la pestaña oculta**.
- El aviso es un `Toast` de la región `aria-live` ya existente (sin
  acciones → se cierra solo): primero las necesidades del barrio del usuario
  (`barrioLabel`, nunca «(Predeterminado)»), si no, las más cercanas y, en
  último caso, las del tablón. Cada necesidad se anuncia como mucho una vez.
- Chip «Avisos de barrio» en `BlogView` con su aclaración.
- **Ninguna coordenada sale del navegador**, ni funciones Vercel nuevas, ni
  dependencias.

**Hecho cuando:** ✅ apagado no hay sondeo ni avisos; encendido persiste,
sondea 75 s, la línea base no avisa, una necesidad nueva de tu barrio aparece
en un toast y en el tablón, no se repite, y al apagarlo se guarda `false` y
se detiene el intervalo.

### Hallazgo corregido durante la verificación

- `barrioLabel` se usaba en `BlogView.tsx` **sin importarlo** →
  `ReferenceError` en runtime al pintar la aclaración de «Cerca de mí» (lo
  detectó el harness funcional, no `tsc`, porque los últimos edits llegaron
  tras el primer `lint`). Añadido al import de `../utils/proximity`. Hoy
  `npm run lint` en verde.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ exit 0 (`tsc --noEmit`, estricto) |
| `npx vite build` | ✅ `✓ built in 604ms` |
| `npm run test:ui` | ✅ **40/40 «TODO OK»** |
| `npm run test:server` | ✅ **84/84 «TODO OK»** (incluye `K1`–`K4` de sync y `L1`–`L9` de cola; checks `M0`–`M18` del agente-backend también en verde) |
| `npm run smoke:vercel` | ✅ **43 comprobaciones · 0 fallos** |
| `npm run verify:rls` | n/a — 0 ficheros tocados en `supabase/` |
| Harness funcional `/tmp/opencode/test-copilot-bugs.mjs` | ✅ **31/31 «TODO OK»** |

### Harness funcional (jsdom + Vite `ssrLoadModule`, fuera del repo)

Misma receta que la sección L de `scripts/test-nucleos.mjs` (jsdom + stub de
Clerk + `AppProvider`), con `fetch` controlable por modo (`ok` / `400` /
`401` / `red`) y captura de los timers de 6000 ms (auto-cierre de avisos) y
75000 ms (sondeo). **31 checks**:

- **BUG-02 (A1–A12)**: 400 → ítem `failed` con payload y `pending` + aviso
  accionable en `aria-live` con «Reintentar»/«Descartar» y el motivo del
  servidor; sin «todo sincronizado» mientras haya rechazos; «Reintentar» →
  reenvío y confirmación; «Descartar» → confirmación en dos pasos con
  «Cancelar» que vuelve al aviso normal; confirmar borra el ítem y lo avisa;
  **401** → NO marca `failed` (abre el flujo de identidad); **red** → sigue
  siendo transitorio (`pending`, «se reintentará»).
- **MEJ-02 tablón (B1–B6)**: orden por defecto = orden del servidor; con el
  interruptor: barrio (normalizado) → Granada → Pance → barrio desconocido;
  «Tu barrio» / «≈ … km (distancia aproximada)»; apagar restaura todo.
- **MEJ-03 (C1–C8)**: desactivado sin sondeo; activar persiste `true` y
  registra el timer de **75000 ms**; línea base sin aviso; aviso de la
  necesidad nueva del barrio; **solo `GET /api/needs` sin cuerpos ni
  coordenadas**; deduplicación (el id del toast no cambia); pestaña oculta →
  ni petición ni aviso; apagar guarda `false` y limpia el intervalo.
- **MEJ-02 mapa (D0–D4)**: MapView + Leaflet montan en jsdom; orden por
  defecto intacto; con «Cerca de mí» ordena San Antonio → Granada → Terrón
  Colorado y **filtra Pance (>5 km)**; subtítulo y etiqueta aproximada;
  apagar restaura.

El harness vive en `/tmp/opencode/` (fuera del repo): `scripts/**` no es mío
y `package.json` no se toca. Si se quiere en CI, `agente-calidad` debe
portarlo.

### Revisión visual en navegador

- `npm run dev` levantó bien (`http://localhost:3000`, API + Vite) pero **no
  hay navegador de escritorio conectado a la sesión** (`browser.disconnected`),
  así que la pasada visual de los dos interruptores queda **pendiente**. El
  servidor se detuvo (SIGTERM limpio); no dejé nada corriendo.

## Decisiones tomadas (y por qué)

- **Reutilizar `calculateDistanceKm`** en vez de duplicar otro haversine: el
  plan lo permitía «si hace falta» y ya estaba probado en `caliLocations`.
- **Los rechazados conservan `pending: true`** más `syncFailed`: `pending:
  false` haría creer al servidor confirmado y encendería la UI de edición
  que comprueba `!need.pending`.
- **Toast con acciones ⇒ nunca se cierra solo**: cerrarlo en silencio
  equivalentía a perder datos; el auto-cierre salta los que tienen acciones.
- **Descartar en dos pasos** con `confirmingDiscard` (estado, no closure):
  el efecto repinta el aviso con la pregunta y evita callejones de
  closures obsoletas; las acciones leen `listsRef`.
- **Reintentar sin sesión** reutiliza el flujo explícito de identidad (sin
  encolar): el reenvío automático se dispara solo al llegar la sesión.
- **MEJ-03 a 75 000 ms**, con línea base sin anuncio, tope de 3 novedades y
  salto con pestaña oculta: suficiente para avisar sin convertir el refresco
  en un sondeo agresivo ni duplicar el sync (que solo corre con
  error/pendientes).
- **El aviso de alertas no lleva acciones** (se cierra solo): no requiere
  decisión; el de rechazos sí.
- **Mapa filtra ≤5 km y el tablón solo ordena**: los puntos sí tienen
  coordenadas; las necesidades solo barrio → no se esconde nada por una
  distancia que sería solo una suposición.
- **`barrioLabel` en los mensajes** para no mostrar «(Predeterminado)».

## Riesgos y deuda que dejo

- **Transitorio agotado (3 intentos)**: el ítem se queda `pending` sin UI
  accionable (sigue reintentando en cada sync mientras haya errores). Es el
  comportamiento previo y estaba fuera del alcance de BUG-02 (solo los 4xx).
- **Doble envío momentáneo**: al publicar, `addHelpPoint` y el efecto de
  reenvío pueden mandar el mismo ítem a la vez (hay `inflightIdsRef`, pero
  la marca se pone tras el `await` de token). Puede verse un toast
  «se reintentará» breve antes de que aterrice el rechazo. Cosmético.
- **401 prolongado**: un ítem `pending` con la sesión caída consume
  intentos del contador de 3 en cada reanudación (comportamiento heredado).
- **`countFailed` / `failedCount` no se exponen en el contexto** (solo
  alimentan los toasts): si algún día se quiere un contador de rechazados en
  la UI, hay que añadirlo al `appValue` y a `AppContextType`.
- **MEJ-03 solo avisa con la pestaña abierta** (sin service worker ni push):
  es lo que pedía la propuesta (consulta acotada con el GET existente), pero
  quien espere avisos con la app cerrada no los recibirá.
- **Sin revisión visual** (ver arriba): los estilos Tailwind de los chips y
  del aviso accionable solo se han probado en jsdom (clases presentes, no
  renderizadas).
- El harness de `/tmp` no está en el repo: si se rompe el flujo de los tres
  interruptores, hay que rehacerlo (la receta está documentada arriba y es
  la misma que la sección L de `test-nucleos`).

## Para el siguiente agente

- **agente-calidad / agente-verificacion**:
  - Cadena completa en verde tras mis cambios: `lint` · `vite build` ·
    `test:ui` (40) · `test:server` (84) · `smoke:vercel` (43). Relanzad al
    cierre de cualquier rama paralela.
  - Harness funcional en `/tmp/opencode/test-copilot-bugs.mjs` (31 checks,
    `node <fichero>` con cwd = repo): si queréis copiarlo a `scripts/**` y
    engancharlo a la CI, es vuestra área.
  - Queda pendiente la **pasada visual en navegador** de los interruptores
    «Cerca de mí» (mapa y tablón) y «Avisos de barrio».
- **agente-frontend (siguiente tarea)**:
  - El estado de rechazos es `syncFailed`/`syncError` sobre `PendingLocal`:
    respétalo al pintar listas (no tratarlos como `pending` normal ni
    borrarlos en un merge).
  - `listsRef` es el espejo de las tres listas para callbacks tardíos
    (toasts): úsalo en lugar de closures de render.
  - Cualquier aviso que exija una decisión debe llamar a `notify(msg, kind,
    actions)`; los que no, se cierran solos.
- **Mantenimiento del tablero**: BUG-02 / MEJ-02 / MEJ-03 viven en
  `plan-copilot-2026-10-01.md`, no en los tableros que yo puedo tocar.
