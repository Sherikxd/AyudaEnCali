# Log — agente-frontend, tareas rápidas semana 2 (2026-09-30)

## En qué trabajé

Tablero: `docs/agentes/tareas-semana-2.md`. Tomé solo las tareas de mi área
(`src/**`, `index.html`) que no dependen del agente-backend:

- **T9** · IDs no colisionables (FAL-04)
- **T11** · Semilla única: local = producción (FAL-08), parte cliente
- **T13** · Accesibilidad: patrón de diálogo compartido (FAL-11)
- **T16** · Clustering de marcadores + badge verificado (FEAT-11)
- **FAL-15 (parte `index.html`)** · referencia rota y `preconnect` huérfanos

## Cambios realizados

### T9 · FAL-04 — IDs únicos

- **`src/utils/id.ts` (nuevo)** → fábrica única `newId(prefix?)` basada en
  `crypto.randomUUID()`, con reserva `getRandomValues`/`Math.random` si no
  hubiera Web Crypto. Documenta por qué el prefijo se mantiene: coincide con
  el patrón del servidor (`cali-point-${randomUUID()}` en
  `server/handlers/points.ts:68`) y cumple `optionalId`
  (`/^[A-Za-z0-9_-]{4,80}$/`, `server/validation.ts:110-114`).
- **`src/context/AppContext.tsx`** → los 5 generadores pasan a `newId()`:
  `:507` perfil local `usr-cali-<uuid>`, `:1003` punto `cali-point-<uuid>`,
  `:1009` `authorId` de respaldo `usr-<uuid>`, `:1061` necesidad
  `cali-need-<uuid>`, `:1112` comentario `comm-<uuid>`. Los `Date.now()`
  restantes (`:292`, `:422`, `:445`, `:582`) son **instantes**, no ids, y se
  quedan tal cual.
- Los IDs semilla `cali-*`/`need-*`/`comm-*` no cambian: `SEED_IDS`
  (`AppContext.tsx:144-148`) compara literales exactos y el prefijo nuevo
  (`cali-point-…`, distinto de `cali-acopio-…`) no colisiona con ellos.

### T11 · FAL-08 — semilla única (parte cliente)

- **`src/data/initialData.ts`** → cabecera de documentación (no se tocó
  ningún dato): este fichero es la fuente de verdad del respaldo local;
  `server/seedData.ts` es hoy una **copia parcial** (5 puntos / 3
  necesidades / 4 comentarios) cuyos ids y `supportersCount` (18/34/22)
  son un subconjunto exacto del de aquí, así que local y producción no se
  contradicen en lo que comparten. Queda anotado que la unificación real
  (que `server/seedData.ts` **importe** de aquí) la hace agente-backend.
- **Sin romper el fallback sin-servidor**: no se eliminó ningún dato; el
  descarte del relleno extra (`need-4..6` y 27 puntos) ya lo hace
  `mergeById` + `SEED_IDS` en el primer sync, y sin servidor pinta este
  dataset de muestra.

### T13 · FAL-11 — accesibilidad

- **`src/hooks/useModalDialog.ts` (nuevo)** → patrón compartido:
  `role="dialog"` + `aria-modal` + `aria-labelledby` (lo aporta cada
  componente) más **Escape**, **foco atrapado** con Tab/Shift+Tab y **foco
  devuelto** al disparador. El `onClose` vive en un ref: los componentes
  recrean esa función en cada render y el efecto no debe reejecutarse (movería
  el foco en plena navegación). El listener va en `window` (en el navegador
  el evento burbujea hasta `window`; además es lo que escucha el test).
- **`src/components/ReportModal.tsx`** → `ref` + `role="dialog"`,
  `aria-modal`, `aria-labelledby="report-modal-title"` (id añadido al `h2`),
  `tabIndex={-1}`; `handleClose` sube antes del `return null` para poder
  llamar al hook.
- **`src/components/LocationModal.tsx`** → igual, con
  `aria-labelledby="location-modal-title"`.
- **`src/components/AuthModal.tsx`** → su efecto de Escape propio se sustituye
  por el patrón compartido (mismo comportamiento + foco); ahora tiene `role`
  y `aria-modal`, que le faltaban.
- **`src/components/FaqModal.tsx`** → ya tenía `role`/`aria-modal`/Escape;
  se cambia al hook para ganar foco atrapado y devuelto (mismo patrón en los
  4 modales, como pide «Hecho cuando» de T13).
- **`src/components/BottomNav.tsx`** → `aria-current="page"` en las 4
  pestañas reales (Mapa, Tablón, Asistente, Perfil).
- **`src/components/ChatView.tsx`** → la conversación es región
  `role="log"` + `aria-live="polite"` + `aria-relevant="additions text"` con
  etiqueta accesible; `aria-label` en el campo de texto y en el botón de
  enviar (antes solo icono). `Toast.tsx` se mantiene como único `aria-live`
  de avisos.

### T16 · FEAT-11 — clustering + badge verificado

- **`src/components/MapView.tsx`**:
  - `groupPointsForZoom()` (exportada para poder verificarla sin navegador):
    agrupación **manual por celda** según el zoom (`CLUSTER_MAX_ZOOM = 13`,
    celda de 0,02° al zoom 10 que se mitad por cada zoom). Cada zoom repinta
    vía estado `mapZoomLevel` + evento `zoomend`.
  - Cúmulos con icono circular y el nº de puntos; al pulsar, `flyTo` salta el
    umbral (`zoom+2` o 14) para que el cúmulo se reparta en individuales.
  - El punto **seleccionado nunca entra en un cúmulo**: se pinta aparte con
    `zIndexOffset: 500` (si no, desaparecía dentro del grupo).
  - **Badge `verified`**: check esmeralda en el icono del marcador,
    etiqueta «Verificado» en el panel lateral y en la ficha inferior, entrada
    en la leyenda del mapa; `title`/`alt` del marcador indican
    «(punto verificado)» para lectores de pantalla.
  - Se conserva el clic → reporte (popup `#cali-map-report-btn`), el clic en
    marcador → ficha y `focusPointOnMap` (el chat sigue funcionando).

### FAL-15 · `index.html`

- El comentario citaba `src/utils/thirdPartyFonts.ts` (no existe): ahora cita
  **`src/utils/consent.ts`** (`applyConsent`), que es quien inyecta las
  tipografías con consentimiento.
- Eliminados los dos `<link rel="preconnect">` huérfanos a
  `fonts.googleapis.com` / `fonts.gstatic.com`.
- Verificación de T20 en mi parte: `grep -rn "thirdPartyFonts\|preconnect.*fonts.g" index.html` → **0 coincidencias**.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | ✅ 0 errores |
| `npx vite build` | ✅ (`MapView` 189,7 kB / 53,5 kB gzip) |
| `npm run test:ui` | ✅ **TODO OK** (40/40) |
| `npm run verify:rls` | n/a (no toqué `supabase/**`) |
| Script temporal fuera del repo (vite `ssrLoadModule`) | ✅ ver abajo |
| Humo con `vite dev`: `GET /` y `GET /src/hooks/useModalDialog.ts` | ✅ 200 / 200 (servidor detenido después) |

Comprobación funcional de T16/T9 con los 32 puntos semilla (script temporal
en `/tmp/opencode/`, no forma parte del repo):

```
zoom  9:  7 marcadores · 4 cúmulos · 32 puntos cubiertos · cúmulo máx 12
zoom 12: 29 marcadores · 3 cúmulos · 32 puntos cubiertos · cúmulo máx 2
zoom 13: 32 marcadores · 0 cúmulos   ← zoom inicial: todo suelto
zoom 16: 32 marcadores · 0 cúmulos
seleccionado fuera de los cúmulos: true
20.000 ids únicos: true · longitud máx 47 · todos cumplen optionalId: true
```

No pude hacer la revisión visual: **no hay navegador conectado a la sesión**
(`browser.tabs.open` → `browser.disconnected`), así que el mapa se validó por
build + lógica + `test:ui`, no a golpe de vista.

## Decisiones tomadas (y por qué)

- **Agrupamiento manual en vez de `leaflet.markercluster`**: la dependencia no
  está en `node_modules` y `package.json` es de agente-calidad → instalarla
  habría sido tocar un fichero ajeno. El efecto visual es el mismo y cero
  dependencias nuevas. *Alternativa descartada:* pedir la dependencia y
  quedarse sin T16 hasta que la añadieran.
- **Prefijo legible en los ids** (`cali-point-<uuid>`): lo pide el tablero y
  lo que ya genera el servidor; mantiene el contrato de `optionalId` (48 ≤ 80
  caracteres).
- **Un único hook de diálogo** en vez de copiar el código en 4 componentes:
  FAL-11 pedía «extender el patrón de FaqModal», y con 4 modales el riesgo
  de divergir otra vez era alto.
- **T11 sin tocar datos**: la unificación recomendada por el tablero
  (front = fuente de verdad, servidor importa) exige editar
  `server/seedData.ts`, fuera de mi área → documentado en el propio
  `initialData.ts` y anotado como dependencia (abajo).
- **`ChatView` conserva `user-${Date.now()}`** en los ids de mensaje: son
  efímeros (estado local, prefijos distintos, envío bloqueado mientras
  `isLoading`) y no hay colisión posible; queda fuera del alcance de T9 para
  no tocar de más.

## Riesgos y deuda que dejo

- **Dependencia del agente-backend (T11):** `server/seedData.ts` debe
  importar `INITIAL_HELP_POINTS` / `INITIAL_HELP_NEEDS` / `INITIAL_COMMENTS`
  de `src/data/initialData.ts` en lugar de duplicarlos (5/3 vs 32/6). Además
  `supportersCount: 18/34/22` del seed **no cuadra con `need_supporters`**:
  `scripts/seed-db.ts` no siembra ninguna fila de apoyos → contador imposible
  hasta que backend alinee recuento y siembra. **No he tocado `server/`.**
- **Dependencia de agente-calidad (T16, opcional):** si se quiere el clustering
  de la librería oficial, hay que añadir `leaflet.markercluster` +
  `@types/leaflet.markercluster` a `package.json`; el código actual ya está
  aislado en `groupPointsForZoom` para cambiarlo con poco riesgo.
- **T9 quedó a medias a propósito:** la segunda mitad de la tarea (dejar de
  enviar identidad en los cuerros de escritura: `userName`, `userRole`,
  `userBarrio`, `userId`, `authorId`) **no está hecha**; el prompt de esta
  sesión la excluyó por depender de T1/FAL-03. Hoy el servidor la ignora
  (decisión 2026-09-28), pero un validador estricto la rechazaría.
- **`ChatView.tsx` sigue con ids por `Date.now()`** (ver decisión arriba).
- **Umbral de clustering `zoom ≤ 13`**: con la semilla actual los cúmulos
  aparecen a partir del zoom 12 al alejar; si el mapa arranca con puntos muy
  juntos (una barriada) se agruparán también en zoom 13.
- La verificación visual en navegador sigue pendiente (sin browser en la
  sesión): recomiendo abrir el mapa, alejar el zoom y pulsar un cúmulo, y
  recorrer Tab/Escape en los 4 modales.

## Para el siguiente agente

- **Ficheros tocados (solo área frontend):** `index.html`,
  `src/utils/id.ts` (nuevo), `src/hooks/useModalDialog.ts` (nuevo),
  `src/context/AppContext.tsx`, `src/components/{ReportModal,LocationModal,
  AuthModal,FaqModal,BottomNav,ChatView,MapView}.tsx`,
  `src/data/initialData.ts` (solo comentario de cabecera). **No** hice commit.
- **Aviso a agente-backend:** T11 (importar el semillero desde
  `src/data/initialData.ts` y cuadrar `supportersCount` con
  `need_supporters`) y la 2.ª mitad de T9 (ignorar/rechazar campos de
  identidad en los cuerros) siguen pendientes en tu área.
- **Aviso a agente-calidad:** `index.html` ya cumple el «Hecho cuando» de
  FAL-15 en mi parte; si T20 quiere `leaflet.markercluster`, pídelo en
  `package.json`. T19 (README «5 puntos, 3 necesidades») sigue tal cual.
- Otros agentes tienen cambios en vuelo en el repo (`package.json`,
  `README.md`, `vercel.json`, `.github/**`, `docs/agentes/**`): mis tres
  comandos se ejecutaron con esos cambios presentes y en verde.
