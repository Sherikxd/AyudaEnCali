# Log — frontend (SEO · Fase 1: T34-T37) (2026-10-02)

## En qué trabajé

- Tareas del tablero: **T34** (archivos base de rastreo), **T35** (JSON-LD +
  shell indexable), **T36** (on-page por vista) y **T37** (FAQ visible e
  indexable), en ese orden (`docs/agentes/tareas-semana-2.md` → Ronda SEO).
- Solo toqué mi área: `src/**`, `index.html`, `public/**` (+ mi log y el
  estado de mis tareas en el tablero). No hice `git commit`.

## Cambios realizados

### T34 · archivos base de rastreo

- `public/robots.txt` → matriz 2026: `Allow: /` para bots de búsqueda,
  bloqueo de bots de entrenamiento (`Amazonbot`, `Bytespider` y compañía;
  GEO-01), `Disallow: /api/`, `Sitemap: https://ayudaencali.lat/sitemap.xml`.
- `public/sitemap.xml` → home con `lastmod` 2026-10-02 (solo rutas que
  existen hoy: sin router no hay más URLs; T40 ampliará).
- `public/llms.txt` → H1 + blockquote + secciones (qué es, mapa, tablón,
  chat, FAQ con enlace `https://ayudaencali.lat/#preguntas-frecuentes`).
- `public/favicon.ico` → ICO de 16/32/48 px generado desde `favicon.svg`
  (rsvg-convert + contenedor ICO armado en `/tmp/opencode/build-ico.mjs`,
  1884 B; `file` lo valida). `index.html` ya lo enlaza con `<link rel="icon"
  href="/favicon.ico">`.

### T35 · JSON-LD + shell indexable

- `src/data/faq.ts` (nuevo) → **fuente única** del FAQ: modelo
  `FaqSpan`/`FaqBlock` tipado, `FAQ_ITEMS` (8 originales, intactas),
  `FAQ_PAA_ITEMS` (5 PAA), `ALL_FAQ_ITEMS` (13), `faqItemToText()` y
  `buildFaqPageJsonLd()`. Documentada la **regla de sincronía** con
  `index.html` y el comando de regeneración.
- `src/components/FaqAnswer.tsx` (nuevo) → renderiza `FaqBlock` (`p`, `ul`,
  negritas/cursivas) a partir de datos, compartido por modal y sección.
- `src/components/FaqModal.tsx` → consume `FAQ_ITEMS` + `FaqAnswer`
  (mismo comportamiento, mismo texto).
- `index.html` → reescrito: `lang="es-CO"`, title 51 car., description
  148 car., `<link rel="icon" href="/favicon.ico">`, **3 bloques JSON-LD**
  (`WebSite`+`SearchAction`, `Organization`, `FAQPage` con 13 preguntas) y
  **shell estático dentro de `#root`** (h1, párrafo, enlaces internos,
  `<noscript>`).

### T36 · on-page por vista

- `src/utils/seo.ts` → `SITE_URL`, `PAGE_META` reoptimizado (todas las
  descriptions ≤155; title del mapa = keyword exacta + marca) y
  `updatePageMeta()` que además sincroniza `og:url`, `og:image`,
  `twitter:image` y `link[rel=canonical]`.
- `src/components/MapView.tsx` → h1 visible en el panel flotante
  («Centros de acopio y albergues en Cali»), `aria-label` en los iconos
  `divIcon` (marcadores, clúster, «Cerca de mí») e inicialización de la
  búsqueda desde `?q=` (hace real el `SearchAction` del JSON-LD).
- `src/components/ChatView.tsx` → h1 visible + sufijo `sr-only`.
- `src/components/Header.tsx` → `aria-current` en los 4 botones de pestaña
  y enlace de texto al FAQ.
- `src/config/images.ts` → `BLOG_HERO_SRCSET`; `src/components/BlogView.tsx`
  → `srcSet` + `sizes` + `fetchPriority="high"` en el héroe.
- `src/App.tsx` → `<footer>` con descripción y enlaces reales
  (`/#preguntas-frecuentes`, `tel:123`, Alcaldía de Cali y Gestión del
  Riesgo — solo URLs oficiales verificadas con 200).

### T37 · FAQ visible e indexable

- `src/components/FaqSection.tsx` (nuevo) → sección
  `id="preguntas-frecuentes"` **siempre en el DOM** (sin `return null`),
  h2 + 13 `<details>` con h3 (el primero abierto), `scroll-mt-20`, enlace
  `tel:123`.
- `src/App.tsx` → montada dentro de `<main>` (tras el `Suspense`), en todas
  las pestañas; el efecto del hash además hace
  `scrollIntoView('preguntas-frecuentes')` para que al cerrar el modal el
  usuario quede sobre la sección (en la carga inicial el navegador no
  llega a anclarse: la sección se pinta después del shell).
- `index.html` → bloque `FAQPage` regenerado con las 13 preguntas
  (`node --import tsx /tmp/opencode/replace-faqjson.mjs`).

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` (tsc --noEmit) | ✅ |
| `npx vite build` | ✅ (1754 módulos; `dist/index.html` 16.45 kB) |
| `npm run test:ui` | ✅ (40/40 · TODO OK) |
| `npm run test:server` | ✅ (25/25 · TODO OK) |
| `npm run smoke:vercel` | ✅ (53 comprobaciones · 0 fallos) |
| `npm run verify:rls` | n/a (no toqué `supabase/schema.sql`) |

Comprobaciones extra (scripts en `/tmp/opencode`, fuera del repo):

- `dist/` contiene `robots.txt`, `sitemap.xml`, `llms.txt`,
  `favicon.ico` (1884 B) y `404.html`.
- `dist/index.html`: 3 JSON-LD parsean, `FAQPage` con 13 preguntas, shell
  estático (h1 + `<noscript>`) dentro de `#root`, `lang="es-CO"`.
- El `FAQPage` de `index.html` **casó carácter a carácter** con
  `buildFaqPageJsonLd()` (check → `true`).
- Tailwind generó en `dist/assets/index-*.css` las clases que solo usa el
  shell (p. ej. `marker:text-orange-600`): Tailwind v4 sí escanea
  `index.html`.
- Render en jsdom de `FaqSection`: 1 `section#preguntas-frecuentes`, 1 h2,
  13 h3, 13 `<details>` (1 abierto), enlace `tel:123`.

## Decisiones tomadas (y por qué)

- **Sin `EmergencyService` en el `Organization`** (GEO-03 lo desaconseja:
  no somos entidad oficial); `areaServed` = City «Santiago de Cali».
- **`FAQPage` estático en `index.html`**: Vite no compila TS en el HTML, así
  que el bloque sale de `src/data/faq.ts` con un comando de regeneración
  y una regla de sincronía escrita en el propio fichero (fuente única).
- **Title del mapa** con la keyword exacta («Centros de acopio y albergues
  en Cali | AyudaEnCali», 51 car.) y «emergencias en Cali» movido a la
  description (142 car.) para no pasarnos de 155.
- **Modal vs. sección**: `FaqModal` sigue igual (ayuda contextual, 8
  preguntas, sección «cookies» desde el banner); la sección y el JSON-LD
  usan las 13. El comportamiento que regexean los tests de `test:ui`
  (`<FaqModal isOpen=… initialSection=…>`, el efecto de
  `#preguntas-frecuentes` con `openFaq()`) quedó intacto.
- **Marcadores Leaflet**: `divIcon` devuelve `<div>`, así que la opción
  `alt` no llega al DOM → texto accesible en el `aria-label` del HTML del
  icono (más `alt`/`title` en el marcador de usuario).
- **`robots.txt` bloquea también `Amazonbot`/`Bytespider`** además de la
  matriz pedida (GEO-01): es la opción reversible, pero es una política y
  **la debe confirmar la persona**.

## Riesgos y deuda que dejo

- **Sincronía FAQ ↔ `index.html` sin test**: si alguien edita
  `src/data/faq.ts` sin regenerar, el JSON-LD se desincroniza. El comando
  está documentado arriba y en `src/data/faq.ts`, pero no hay un test que
  falle. Fichero de test = área de `scripts/**` (agente-backend/calidad).
- **Política de robots de IA** pendiente de confirmación por la persona
  (bloqueo de entrenamiento vs. citación). Tras confirmarla, ajustar
  `public/robots.txt`.
- **200 en producción** de robots/sitemap/llms/favicon + alta en Search
  Console: se comprueba después del despliegue (criterio de «hecho» de
  T34).
- **`sitemap.xml` solo con la home** hasta que existan URLs (T38/T40).
- **T38 (pestaña ↔ URL) y T40 (landings)** siguen bloqueadas por decisión
  pendiente; sin ellas no hay enlaces a profundidad real.
- `index.html` creció a 16.45 kB por el shell + JSON-LD; si preocupa, la
  T43 (prerender) es el sitio natural para revisarlo.

## Para el siguiente agente

- `npm run dev` → abrir `http://localhost:3000/#preguntas-frecuentes`:
  debe scrollar a la sección **y** abrir el modal una vez (efecto de
  montaje). Cerrar el modal deja el foco sobre la sección.
- Si añades preguntas al FAQ: editar **solo** `src/data/faq.ts` y
  regenerar el bloque (`node --import tsx` con el comando del encabezado
  del fichero). La sección, el modal y el JSON-LD salen todos de ahí.
- La app **no tiene router** (decisión 2026-09-29): cualquier enlace
  interno es `/#…` y no se debe sincronizar pestaña↔URL sin pasar antes
  por T38.
- Toca `src/utils/seo.ts` si cambias títulos/descripciones:
  `PAGE_META` es el único sitio y `updatePageMeta` refleja canonical/OG.
