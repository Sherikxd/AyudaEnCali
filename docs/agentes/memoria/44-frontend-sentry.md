# Log — frontend (2026-10-12) · Sentry

## En qué trabajé
- Petición directa (fuera del tablero): integrar `@sentry/browser` (v11.6.0,
  ya instalado en `package.json`) con la DSN del proyecto. Todo en `src/**`
  más la documentación de la variable en `.env.example` y un chunk de vendor
  en `vite.config.ts`; no toqué `server.ts`, `server/**`, `supabase/**` ni
  `scripts/**`.

## Cambios realizados
- **`src/config/sentry.ts` (nuevo)** → `initSentry()` (idempotente) y
  `captureError(error, context?)` (no-op si no hay cliente). Arranca con
  `browserTracingIntegration()` (en v11 **no** viene en las integraciones por
  defecto: sin ella no hay trazas), `tracesSampleRate` 0.1 en producción y 1
  en local, `ignoreErrors` para el ruido del navegador (`ResizeObserver`,
  `Script error.`) y sin Session Replay ni `setUser`.
- **DSN**: `VITE_SENTRY_DSN` si está **definida** (aunque sea `""`, que la
  apaga), si no la DSN del proyecto escrita en `src/config/sentry.ts` (pública
  por diseño). En desarrollo, sin la variable **no arranca**: los eventos de
  `npm run dev` no ensucian el proyecto real.
- `src/main.tsx:14` → `initSentry()` antes de `applyConsent` y del render, para
  que los fallos de arranque (clave de Clerk, consentimiento) también salgan.
- `src/components/ErrorBoundary.tsx:28` → `captureError(error, { contexts:
  { react: { componentStack } } })`.
- `src/components/ChatView.tsx:106` → el fallo del asistente IA se reporta con
  `tags: { feature: 'asistente' }` (era el único otro `logger.error`).
- **Consentimiento** (Sentry es esencial, decisión del usuario): `src/data/faq.ts`
  y `index.html` (JSON-LD sincronizado con el comando de la cabecera del
  fichero), `src/components/FaqPage.tsx` (etiqueta «Solo esenciales»),
  `src/components/CookieConsent.tsx` y `src/utils/consent.ts` (comentario)
  dejaban de decir «no se pide nada a terceros».
- `.env.example` → sección Sentry con `VITE_SENTRY_DSN` **solo comentada**:
  si estuviera activa en `""`, un `vite build` con ese `.env` compilaría sin
  Sentry.
- `vite.config.ts` → `manualChunks` `vendor-sentry` (157 kB / 54 kB gzip
  aparte: los cambios de la app no invalidan su caché).

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ (chunk `vendor-sentry` en su sitio, sin avisos de tamaño) |
| `npm run test:ui` | ✅ **TODO OK** (falló la primera vez: el JSON-LD de `index.html` quedó desincronizado del FAQ → regenerado) |
| `npm run verify:rls` | n/a (no toca `supabase/schema.sql`) |
| Humo en jsdom (script temporal, borrado) | ✅ cliente creado, `BrowserTracing` entre las integraciones, `captureException` genera `eventId`, `initSentry()` repetido no duplica cliente; DSN apuntando a `127.0.0.1:9` para no enviar nada |

## Decisiones tomadas (y por qué)
- **Sentry siempre activo (servicio esencial), no tras el consentimiento.**
  Pedida por el usuario; obliga a que el FAQ y el banner lo declaren. Las
  tipografías de Google siguen siendo la única opcional.
- **Sin Session Replay ni PII explícita** (también decisión del usuario):
  menos peso, nada de pantalla grabada; `setUser` hay que llamarlo a mano si
  algún día hace falta identificar a la persona.
- **`captureError` explícito en dos sitios** en vez de engancharlo a
  `logger.error`: crearía un ciclo de imports (`logger` ↔ `sentry`) y duplicaría
  eventos (la integración `Dedupe` descarta el segundo aviso del mismo error,
  con lo que se perdería el `componentStack`).

## Riesgos y deuda que dejo
- La DSN está en el repo: cualquiera puede enviar eventos a ese proyecto y
  llenar la cuota. Se rota desde Sentry si pasa; rotar exige recompilar.
- No hay `release`: los eventos no se vinculan a un deploy (habría que inyectar
  el hash de build en `Sentry.init`).
- `README.md` (área de documentación) no menciona la variable ni la
  integración; la sección de cookies del README habla de terceros y ya no es
  literal.
- Solo se reportan lo no controlado (`window.onerror` / `unhandledrejection`)
  y los dos puntos con `captureError`; los errores capturados y solo avisados
  con toast (`logger.warn`) no llegan a Sentry.
- 54 kB gzip más en la carga inicial; si algún día hay que recortar, la vía es
  `defaultIntegrations` a medida o `@sentry/browser` diferido con `import()`.

## Para el siguiente agente
- Al añadir un `captureError` nuevo: nunca dentro de `logger.error` (ciclo) y
  ten en cuenta `Dedupe` (segundo aviso del mismo `Error` → descartado).
- Si cambias respuestas del FAQ en `src/data/faq.ts`, regenera el JSON-LD de
  `index.html` con el comando de la cabecera de ese fichero: lo comprueba
  `npm run test:ui` («FAQPage JSON-LD coincide con las preguntas y respuestas
  visibles»).
- Para probar en local: define `VITE_SENTRY_DSN` en `.env` y mira la pestaña
  «Issues» de Sentry con `environment: development`.
