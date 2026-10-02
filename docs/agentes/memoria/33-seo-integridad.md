# Log — SEO técnico / integridad (2026-10-02)

## En qué trabajé

- Revisé el contexto compartido de `docs/`, las notas SEO previas, el HTML de
  entrada, la SPA, los recursos de rastreo, los headers de API y la
  configuración de Vercel.
- Contrasté la implementación con documentación oficial de Google, Bing,
  OpenAI y Perplexity sobre renderizado JavaScript, URLs, datos estructurados,
  sitemaps y crawlers.

## Cambios realizados

- `index.html` → canónica y `og:url` usan `https://www.ayudaencali.lat/`, el
  host que sirve producción tras redirigir el dominio raíz. `WebSite` y
  `Organization` comparten esa entidad/host; se retiró el `SearchAction`
  porque no existía la búsqueda general que declaraba. Se agregó contenido
  inicial útil sobre el mapa, las necesidades, el asistente y emergencias
  para lectores sin JavaScript.
- `src/utils/seo.ts` → URL canónica `www` y comentarios precisos: hashes son
  estados de la SPA, no páginas indexables; se quitó la afirmación de un
  límite fijo de 155 caracteres para descripciones.
- `src/App.tsx`, `src/context/AppContext.tsx`,
  `src/components/FaqSection.tsx`, `src/components/TabLink.tsx` y
  `src/components/MapView.tsx` → corregidos comentarios que atribuían
  indexabilidad independiente a los hashes o describían el `SearchAction`.
- `public/robots.txt`, `public/sitemap.xml` y `public/llms.txt` → referencias
  internas usan el host canónico; el sitemap contiene solo la raíz y no
  declara fechas/frecuencias/prioridades que no se mantienen.
- `vercel.json` → la redirección del dominio de Vercel apunta directamente al
  host canónico `www`.
- `scripts/test-authmodal.mjs` → controles para la coincidencia entre
  canónica/OG/metadata, `robots.txt`/sitemap, relación `WebSite`/`Organization`,
  shell sin JS y sincronía exacta de `FAQPage` con `src/data/faq.ts`.
- `docs/agentes/tareas-semana-2.md` → se actualizó el estado de la ronda SEO
  y se añadió T43 con verificación y deuda de despliegue.

## Verificación ejecutada

| Comando / comprobación | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅; `dist/` contiene `robots.txt`, `sitemap.xml`, `llms.txt` e icono 512 |
| `npm run test:ui` | ✅ `TODO OK`, incluidas las regresiones SEO |
| `vercel.json` parseable + sitemap XML envelope | ✅ |
| Producción `https://ayudaencali.lat/` | ✅ redirige a `https://www.ayudaencali.lat/` |
| Producción `/robots.txt`, `/sitemap.xml`, `/llms.txt` | ⚠️ los tres devuelven 404; esta rama aún no está desplegada |
| Producción `/api/points` y `/api/health` | ⚠️ 200, pero sin `X-Robots-Tag` en la versión desplegada |
| Imagen OG de Cloudinary | ✅ 200 JPEG |

`npm run test:ui` informó que el puerto Vite HMR 24678 ya estaba ocupado, pero
la suite terminó en `TODO OK`. No se terminó ni modificó el proceso que ya lo
ocupaba.

## Decisiones tomadas (y por qué)

- Se mantuvo la política `Allow: /` existente en `robots.txt`: el archivo la
  identifica como una decisión explícita de la persona para permitir todos
  los crawlers. La recomendación anterior de bloquear bots de entrenamiento
  entra en conflicto con esa decisión; es política del producto, no una mejora
  de ranking, así que no se cambió sin consenso.
- Se mantuvo `FAQPage` porque el FAQ está visible y el JSON-LD coincide con el
  texto fuente. No se promete resultado enriquecido: Google restringe ese
  tratamiento a sitios gubernamentales y de salud reconocidos.
- No se añadieron landings, `LocalBusiness` ni `Dataset`: la SPA no tiene
  rutas de producto distintas y los puntos son comunitarios. No afirmar
  verificación, disponibilidad o afiliación oficial sin datos/procedencia
  comprobables.
- No se creó un `lastmod` dinámico: el sitemap tiene solo la raíz y no hay una
  marca de modificación editorial fiable para sostenerlo.

## Fuentes primarias consultadas

- Google, [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
  [URL structure](https://developers.google.com/search/docs/crawling-indexing/url-structure)
  y [canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
- Google, [FAQ rich-result changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes),
  [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies),
  [sitemap overview](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
  y [AI features](https://developers.google.com/search/docs/appearance/ai-features).
- Google, [Organization markup](https://developers.google.com/search/docs/appearance/structured-data/organization)
  y [site names](https://developers.google.com/search/docs/appearance/site-names).
- OpenAI, [crawler documentation](https://developers.openai.com/api/docs/bots);
  Perplexity, [crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md).
- `llms.txt` es una [propuesta comunitaria](https://llmstxt.org/), no un requisito
  documentado de indexación/ranking de Google o Bing.

## Riesgos y deuda que dejo

- Los 404 de los recursos SEO, el icono 512 ausente en producción y la falta
  del header `X-Robots-Tag` de API corresponden a la versión actualmente
  desplegada, no a los artefactos locales. Repetir los checks tras publicar
  esta rama; no se hizo commit ni deploy.
- T41 (Search Console y baseline), T42 (entidad off-site) requieren acceso y
  acciones de la persona. En Search Console registrar el sitemap canónico
  después del despliegue y revisar URL Inspection.
- Si se crean landings, usar rutas reales con contenido sustantivo, status
  correcto y fuentes/fecha de verificación visibles; no multiplicar páginas
  delgadas ni indexar fragmentos.

## Para el siguiente agente

- Desplegar el cambio por el proceso normal y comprobar que el host Vercel
  redirige a `www`, que los tres recursos de rastreo responden 200, que los
  endpoints API sí llevan `X-Robots-Tag: noindex` y que la página conserva
  `https://www.ayudaencali.lat/` como canonical/OG.
- Enviar el sitemap a Search Console y completar las acciones externas T41/T42.
