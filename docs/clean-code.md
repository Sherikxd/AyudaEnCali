# Guía de clean code — AyudaEnCali

> Convenciones del repo para agentes y personas. Basada en la auditoría de
> código real (2026-10-07) y en las decisiones de
> [`decisiones.md`](agentes/decisiones.md). Si esta guía contradice una
> decisión cerrada, manda la decisión: propón el cambio en tu log.

## 1. Invariantes (no negociables)

1. **TypeScript estricto**: sin `any`, `@ts-ignore`, `@ts-nocheck`,
   `@ts-expect-error` ni non-null assertions (`!.`). `noUnusedLocals` y
   `noUnusedParameters` activos.
2. **`console.*`**: prohibido en `src/**` y `server/**` →
   `src/utils/logger.ts` / `server/logger.ts`. **Permitido en `scripts/**`**
   (son CLIs que imprimen resultados).
3. **Imports con `.js` explícito** en `api/**`, `server/**` y en cualquier
   módulo alcanzable por un lambda de Vercel — incluida la cadena
   `server/store.ts → server/seedData.ts → src/data/initialData.ts →
   src/config/images.ts` (decisión 2026-09-30; sin `.js`:
   `ERR_MODULE_NOT_FOUND` con la CI en verde).
4. **Secretos** solo en `.env` (gitignored). El cliente solo ve `VITE_*` o lo
   que sirve `/api/config`.
5. **Nunca `git commit`/`git push`**: el repo lo gestiona la persona.
6. **Ámbitos**: `src/**` = frontend; `server/**`, `api/**`, `supabase/**`,
   `scripts/**` = backend; `package.json`, `.github/**`, `docs/**` =
   calidad/documentación.

## 2. Tamaño y forma

| Elemento | Regla | Evidencia de por qué |
| --- | --- | --- |
| Componente React | ≤ ~300 líneas; si crece, extraer subcomponentes o hooks internos | `AppContext.tsx` (2256), `MapView.tsx` (1517) |
| Función/método | ≤ ~80 líneas | bloques de 100+ líneas en `AppContext.tsx`, `needsSupport.ts` |
| Contexto React | **Un solo objeto de contexto exportado**, mismo contrato de claves y acciones. Extraer `useToasts`, `useOfflineQueue`, `useAuthModal`… como hooks **internos** que AppProvider compone | test sección L (`scripts/test-nucleos.mjs:637-719`) monta `AppProvider` y exige esas claves |
| Efectos | Dependencias completas (oxlint `react-hooks/exhaustive-deps`); sin escrituras de estado en bucle; sin efectos que dupliquen trabajo de render | `AppContext.tsx` ya tiene 16 `useEffect` |

**Declaraciones literales intocables** (los tests leen el fuente con regex;
ver apéndice A): `const closeAuthModal = () => {` con `setAuthCallback(null)`
e `setIsAuthModalOpen(false)` **dentro de su primer bloque**; el import de
`AuthModal` en `App.tsx`; `applyConsent(readConsent())` en `main.tsx`.

## 3. Duplicación: qué unificar y qué NO

**Unificar (invariantes de refactor):**

| Duplicación | Destino |
| --- | --- |
| Haversine ×3 (`server/geo.ts:16`, `caliLocations.ts:168`, `AppContext.tsx:1521`) | `src/utils/geo.ts` para el cliente (`server/geo.ts` es de backend: no se toca) |
| Semilla cliente ≈ servidor (~800 líneas) | `server/seedData.ts` re-exporta de `src/data/initialData.ts` con `.js` (sección 1.3) |
| Preambulo `writeLimiter.enforce` + `respondUnauthorized` + retry (en todos los handlers) | helpers compartidos en backend; **sin mover** el orden cabecera → 1 MB → rate → auth → núcleo |
| Detección de errores FK `23503`/`23505` repetida | helper único |
| Mensajes de validación idénticos en `validate*` y `validate*Update` | constantes nombradas |
| 1 MB en dos representaciones (`server/app.ts:59` vs `MAX_BODY_BYTES`) | una sola constante |

**NO unificar (son decisiones cerradas):**

| ¿Por qué no? | Referencia |
| --- | --- |
| TTLs `LIST_TTL_S` 10 s (needs) / 30 s (points, comments): los valores son decisión del 2026-10-07. **Renombra por recurso** (`NEEDS_LIST_TTL_S`), jamás cambies el número | `decisiones.md:169-190` |
| Doble montura `/api` y `/api/v1` en `server/app.ts:126-128` | decisión 2026-10-02 |
| Contador de apoyos: solo la BD (RPC `count(*)` + `invalidate('dir')`); nada de «mejorar» esa lógica en un refactor | `decisiones.md:30-35,169-190` |
| Reordenar respuestas de handlers: la paridad Express ↔ Vercel es byte a byte | test M, `decisiones.md:73-94` |

## 4. Nombres y constantes

- **Coordenadas de Cali centralizadas** en `src/data/caliLocations.ts`:
  `CALI_CENTER = { lat: 3.4475, lng: -76.5412 }` (hoy repetidas en
  `ReportModal.tsx:49-50`, `AppContext.tsx:536-537`, `caliLocations.ts:12-13`,
  `initialData.ts:59-60`…). El «segundo centro» `[3.4400, -76.5350]`
  (`AppContext.tsx:552-555`, `caliLocations.ts:210`) es un valor **distinto**:
  nombrarlo aparte (`CALI_FALLBACK_CENTER`) o unificarlo con revisión — no
  dejar dos centros silenciosos.
- Radio de la Tierra: `EARTH_RADIUS_KM` (`server/geo.ts:16` es el patrón);
  nada de `const R = 6371` suelto.
- Zoom de mapa, timeouts de toast (2000/2500 ms), topes (`query.limit(500)`),
  prefijos de id (`cali-point-`, `cali-need-`, `rep-`, `comm-`): constantes
  con nombre, en un módulo de su área.
- Un nombre = un concepto: `LIST_TTL_S` con valores distintos en ficheros
  distintos es una trampa (renómbralo, no lo unifiques).

## 5. Backend

- Núcleos framework-agnósticos en `server/handlers/*`: reciben `ApiRequest`,
  devuelven `{status, body}` (o `null` si ya escribieron). Express
  (`server/app.ts`) y Vercel (`api/*.ts`) solo adaptan.
- Si cambia un contrato, cambia en ambos lados **y** en
  `src/types/index.ts`.
- Sin `vite` en `server/app.ts`; ≤ 12 funciones Vercel (10 en uso); nada en
  `api/` nuevo sin reescribir `vercel.json` (y `vercel.json` está congelado
  en este trabajo).
- `supabase/schema.sql` no se toca sin `npm run verify:rls`.

## 6. Flujo de reparación de tests ajenos

- Los tests de `scripts/` son de backend; los de `test-authmodal` **leen el
  fuente de `src/**` con regex** (13 ficheros). Quien rompe un check:
  1. repara **en su propio ámbito** si es posible (mantener la forma que el
     test espera);
  2. si tocar el regex es inevitable, lo dice en su informe **antes** de
     tocar `scripts/**` y lo anota en su log: el regex protege un contrato
     de producto, no estilo.
- Tras cualquier extracción en `src/context/` o `src/components/`, ejecutar
  `npm run test:ui` **y** la sección L de `npm run test:server`.

## 7. Verificación obligatoria (al cerrar cualquier cambio)

```bash
npm run lint          # tsc --noEmit
npx vite build        # build de producción
npm run test:ui       # tests jsdom
npm run test:server   # núcleos (paridad M, semilla S, cola L)
npm run smoke:vercel  # humo de las funciones
npm run lint:style    # oxlint
npm run format:check  # prettier --check
```

Si tocaste `server/**` además: humo local (ver `AGENTS.md`). Si tocaste
`supabase/schema.sql`: `npm run verify:rls`.

## Apéndice A — Checks de fuente que no se deben romper

`scripts/test-authmodal.mjs` lee con `readFileSync` y regex: `src/App.tsx`,
`src/context/AppContext.tsx` («closeAuthModal limpia el callback» /
«cierra el modal»), `src/components/{FaqPage,Header,BlogView}.tsx`,
`src/main.tsx`, `src/config/images.ts`, `index.html`, `public/{robots.txt,
sitemap.xml,404.html}`, `server.ts`, `server/app.ts`.

`scripts/test-nucleos.mjs` exige: **L** = contrato único de `AppProvider`
(claves `isAuthModalOpen`, `authModalMessage`, `supportedNeedIds`,
`helpNeeds`; acciones `supportNeed`, `completeAuthModal`, `closeAuthModal`,
`setNeedAlertsEnabled` y su semántica de cola), **M** = respuestas idénticas
Express ↔ Vercel, **S** = semilla con recuentos 32/6/4.

## Apéndice B — Deuda conocida a propósito (no «arreglarla» a ciegas)

- `src/context/AppContext.tsx` y `MapView.tsx` son monolitos: se parten en
  este trabajo, manteniendo los contratos del apéndice A.
- La tabla de rutas vive en 3 sitios (`server/app.ts`, `api/*.ts`,
  `vercel.json`): es la decisión «una función por ruta»; no deduplicar.
- `test:server` sección S compara hoy las dos semillas carácter a carácter:
  cuando pase a re-export, conservar los recuentos (S4) y un check de
  no-divergencia independiente (ver comentario del propio test).
