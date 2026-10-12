# Log — frontend (2026-10-12) · Sentry

## En qué trabajé
- Petición directa (fuera del tablero): integrar `@sentry/browser` (v11.6.0,
  ya instalado en `package.json`) con la DSN del proyecto, y después probar la
  conexión de verdad con `myUndefinedFunction()`. Área natural: `src/**` más
  la documentación en `.env.example` y el chunk de vendor en `vite.config.ts`.
- **Excepción autorizada por el usuario**: la prueba destapó que la CSP
  bloqueaba el envío, así que toqué también `server/http.ts` y `vercel.json`
  (área backend/infra) para añadir `https://*.sentry.io` a `connect-src`. Sin
  eso la integración no funciona en producción.

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
- **CSP (fuera de mi área, autorizada)** → `https://*.sentry.io` añadido al
  `connect-src` de `server/http.ts:87` **y** de los dos bloques de
  `vercel.json` (raíz y rutas de página). Van carácter a carácter idénticos:
  lo comprueban `test:server` (S12) y `smoke:vercel`.

## Prueba de conexión (`myUndefinedFunction()`)
Chromium headless + CDP contra la app de producción (`NODE_ENV=production
PORT=3124 node --import tsx server.ts`), disparando un `ReferenceError` real
(`setTimeout(() => myUndefinedFunction(), 250)`):

1. **Antes del fix de CSP** → el error se capturaba (`ReferenceError … at i
   (…/vendor-sentry-….js)`) y el SDK mandaba el envelope, pero la respuesta
   era `Refused to connect because it violates the document's Content
   Security Policy` → `SENTRY NO LLEGÓ`.
2. **Tras añadir `https://*.sentry.io`** → `POST
   https://o1329562.ingest.us.sentry.io/api/6591687/envelope/…` → **HTTP 200**
   con cuerpo `{"id":"026387f0e02f4f75b68123ecb31f595c"}` → **evento aceptado
   por Sentry** (`SENTRY OK`). Cero violaciones de CSP nuevas.
- El script de la prueba (CDP puro, sin dependencias) quedó fuera del repo:
  `/tmp/opencode/sentry-prueba.mjs`; levanta Chromium con
  `--headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/opencode/cr-profile`.
- Aviso: el único aviso que queda en consola en local es el 404 de
  `/_vercel/insights/script.js` (Vercel Web Analytics solo existe en Vercel):
  preexistente, no tiene nada que ver con Sentry.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ (chunk `vendor-sentry` en su sitio, sin avisos de tamaño) |
| `npm run test:ui` | ✅ **TODO OK** (falló la primera vez: el JSON-LD de `index.html` quedó desincronizado del FAQ → regenerado) |
| `npm run test:server` | ✅ **TODO OK** (S12: CSP servidor = vercel.json, 943 = 943 caracteres) |
| `npm run verify:rls` | n/a (no toca `supabase/schema.sql`) |
| Humo en jsdom (script temporal, borrado) | ✅ cliente creado, `BrowserTracing` entre las integraciones, `captureException` genera `eventId`, `initSentry()` repetido no duplica cliente; DSN apuntando a `127.0.0.1:9` para no enviar nada |
| Prueba real con Chromium/CDP (`myUndefinedFunction()`) | ✅ **evento aceptado**: HTTP 200 + `{"id":"026387f0e02f4f75b68123ecb31f595c"}` (antes del fix de CSP: bloqueado) |

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
- `npm run smoke:vercel` hay que lanzarlo **tras el deploy**: compara las
  cabeceras de producción con `vercel.json`, así que hasta que no se despliegue
  la CSP nueva verá la de antes (rojo esperado, no regresión).
- El evento de prueba (`ReferenceError: myUndefinedFunction is not defined`,
  id `026387f0e02f4f75b68123ecb31f595c`, entorno `production`) está en el
  proyecto de Sentry: se puede borrar, no es un fallo real.
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
  «Issues» de Sentry con `environment: development`. **Sin esa variable en
  desarrollo no arranca** (es a propósito): si en local «no llega nada», mira
  esto antes de sospechar del SDK.
- **CSP**: `connect-src` vive en tres sitios que van idénticos
  (`server/http.ts:87` + los dos bloques de `vercel.json`); `test:server` S12
  y `smoke:vercel` los comparan carácter a carácter. Si añades un dominio
  nuevo que el cliente llame con `fetch`, tiene que entrar ahí: si no, el
  navegador lo bloquea y el SDK solo deja un aviso en la consola.
- Para repetir la prueba end-to-end: `npx vite build` → arranca producción en
  un puerto libre → Chromium headless con `--remote-debugging-port` → CDP
  (`Network.enable` + `Runtime.evaluate` con `setTimeout(() =>
  myUndefinedFunction(), 250)`) y mira el `POST` a `*.ingest.us.sentry.io`
  (200 + `{"id":…}` = aceptado). El script está en
  `/tmp/opencode/sentry-prueba.mjs` (fuera del repo, bórrese cuando ya no
  haga falta).
