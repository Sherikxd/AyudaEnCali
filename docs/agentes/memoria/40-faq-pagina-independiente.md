# Log — FAQ página independiente (2026-10-02)

## En qué trabajé
- Convertí el FAQ global/modal en una página dedicada `/preguntas-frecuentes/`.

## Cambios realizados
- `src/App.tsx` → renderiza solo `FaqPage` en la ruta de FAQ; retira FAQ modal/sección de las vistas normales.
- `src/components/FaqPage.tsx` → crea la página independiente con acordeón, vuelta al mapa y ajustes de cookies.
- `src/context/AppContext.tsx` → elimina el estado y acciones exclusivos del modal de FAQ.
- `Header.tsx`, `ProfileView.tsx`, `CookieConsent.tsx`, `index.html`, `public/404.html`, `public/llms.txt` → enlaces a la página y enlaces directos a la sección de cookies.
- `server.ts`, `vercel.json` → sirven la ruta dedicada, redirigen la variante sin slash y conservan el 404 general.
- `public/sw.js` → precache y fallback offline del FAQ como página propia.
- `src/utils/seo.ts`, `public/sitemap.xml` → metadatos canónicos y URL de FAQ.
- `scripts/test-authmodal.mjs`, `scripts/test-nucleos.mjs` → expectativas actualizadas para la navegación fuera del modal.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npm run test:ui` | ✅ |
| `npm run test:server` | ✅ |
| `npx vite build` | ✅ |
| `npm run smoke:vercel` | ✅ 60/60 después de añadir `_orig=faq` al rewrite |
| `git diff --check` | ✅ |
| Humo Express producción local | ✅ `/preguntas-frecuentes` → 308 → 200, `/preguntas-frecuentes/` → 200 y URL desconocida → 404 |

## Decisiones tomadas (y por qué)
- Mantener los hashes existentes de las pestañas; solo el FAQ tiene una ruta legible, compartible e independiente.
- Mantener el FAQ completo y las preferencias de cookies en la página dedicada; los accesos desde la app son enlaces.

## Riesgos y deuda que dejo
- La URL dedicada usa el shell de la SPA; los metadatos canónicos específicos se sincronizan después de montar React.

## Para el siguiente agente
- No volver a montar `FaqPage` en el flujo global de las pestañas. Actualizar en conjunto los contenidos de `src/data/faq.ts` y el bloque FAQPage de `index.html`.
