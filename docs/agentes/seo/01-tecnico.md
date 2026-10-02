# Auditoría SEO técnico/on-page — AyudaEnCali

> **Agente**: SEO técnico/on-page · **Fecha**: 2026-10-02 · **Modo**: solo lectura.
> Único fichero escrito por este agente: `docs/agentes/seo/01-tecnico.md`.
> No se ejecutaron builds, tests ni commits; no se tocó código.

---

## 1. Método y alcance

**Verificado leyendo el código:**

- `index.html`, `public/404.html`, `public/**`, `vercel.json`, `vite.config.ts`, `package.json`.
- `src/utils/seo.ts`, `src/App.tsx`, `src/main.tsx`, `src/context/AppContext.tsx`,
  `src/components/{Header,BottomNav,BlogView,MapView,ChatView,ProfileView,FaqModal}.tsx`,
  `src/config/images.ts`, `src/utils/consent.ts`, `src/types/index.ts`.

**Verificado contra producción** (fetch directo, sin navegador, 2026-10-02):

- `https://ayudaencali.lat` y `https://ayuda-en-cali.vercel.app`: `/`, `/robots.txt`, `/sitemap.xml`,
  `/favicon.ico`, `/favicon.svg`, `/images/apple-touch-icon.png`, `/ruta-inexistente`, `/map`,
  `/index.html`, `/api/health`, un asset `/assets/*.js`, y la `og:image` de Cloudinary.
- Cuerpo HTML completo del shell, cabeceras (`Cache-Control`, `Content-Security-Policy`,
  `Content-Encoding`, `X-Robots-Tag`…) y tamaño de los chunks JS.

**No verificable en estas condiciones** (se declara explícitamente, no se inventa):

- Indexación real y render de JavaScript por Googlebot/Bing → requiere Google Search Console y/o navegador.
- Core Web Vitals de campo (LCP/CLS/INP reales) → requiere PageSpeed Insights/CrUX o navegador.
- Contenido final del DOM tras el render (puntos del mapa, tablón) → «no verificable sin navegador».
- La búsqueda `site:ayudaencali.lat` devolvió **0 resultados** y la búsqueda de marca no devolvió el
  dominio: evidencia *débil* de que aún no está indexado, no sustituye a Search Console.

---

## 2. Estado actual

| Elemento | Estado | Evidencia |
| --- | --- | --- |
| `<html lang="es">` | ✅ | `index.html:2` (mejorable a `es-CO`, ver SEO-16) |
| `<title>` (48 car.) | ✅ | `index.html:6` |
| `meta description` (168 car.) | ⚠️ larga (>160) | `index.html:7-10`; medida en producción: 168 |
| `meta robots` (`index,follow`) | ✅ | `index.html:12` (redundante pero inocuo) |
| `link canonical` → `https://ayudaencali.lat` | ✅ | `index.html:13`; idéntico en el dominio espejo |
| `meta viewport` | ✅ | `index.html:5` |
| `meta theme-color` | ✅ | `index.html:11` (`#EA580C`) |
| OG (`site_name`,`locale`,`type`,`url`,`title`,`description`) | ✅ | `index.html:20-28` |
| `og:image` 1200×630 + `width/height/alt` | ✅ | `index.html:31-37`; producción: 200, `image/jpeg`, 145.683 B |
| Twitter Card `summary_large_image` + image/alt | ✅ | `index.html:38-48` |
| Favicon SVG + apple-touch-icon | ✅ | `index.html:16-17`; `/favicon.svg` → 200 (352 B), `/images/apple-touch-icon.png` → 200 |
| `/favicon.ico` | ❌ | 404 en ambos dominios; repo sin `public/favicon.ico` |
| Preconnects / `preload` de fuentes | ⚠️ deliberado | Sin ninguno; fuentes de terceros se inyectan por consentimiento (`src/utils/consent.ts:47-67`, `display=swap`) |
| Contenido estático en el body / `<noscript>` | ❌ | `index.html:60` solo `<div id="root">`; producción: `hasNoScript = false` |
| JSON-LD (schema.org) | ❌ | 0 coincidencias de `application/ld+json`/`schema.org` en todo el repo |
| `/robots.txt` | ❌ | 404 en ambos dominios (sirve la 404 HTML con `noindex`); sin fichero en `public/` |
| `/sitemap.xml` | ❌ | 404 en ambos dominios; sin fichero en `public/` |
| 404 real + `noindex` | ✅ | `public/404.html:7` (`noindex,follow`); `/ruta-inexistente` → **404** en ambos dominios |
| Enlaces de la 404 (mapa + FAQ) | ✅ | `public/404.html:159-160` |
| Título/descripción por pestaña | ✅ (solo en cliente) | `src/utils/seo.ts:16-37` + `src/App.tsx:49-51` |
| OG/Twitter actualizados al cambiar de pestaña | ⚠️ parcial | `src/utils/seo.ts:46-53` actualiza `title`, `description`, `og:title`, `og:description`, `twitter:title/description`; **no** `og:url`, `og:image` ni `canonical` |
| Navegación con URLs/enlaces internos | ❌ | Navegación 100 % con `<button>`: `Header.tsx:52-107`, `BottomNav.tsx:31-79`; 0 `<a href="/…">` en `src/` (solo `tel:`, `wa.me`, Google Maps) |
| `<h1>` único por vista | ⚠️ | ✅ `BlogView.tsx:260`, `ProfileView.tsx:84`; ❌ `MapView` (vista por defecto) y `ChatView` no tienen `h1` |
| Landmarks (`header`/`main`/`nav`) | ⚠️ | `App.tsx:69` `<main>`, `Header.tsx:33` `<header>`, `Header.tsx:51` nav escritorio, `BottomNav.tsx:28` nav móvil (uno por viewport ✅); sin `<footer>`, sin skip-link |
| Imágenes: `alt`, `width/height`, `loading` | ✅ | `BlogView.tsx:242-250` y `462-471` (`alt={need.title}`, `width/height`, `loading="lazy"`) |
| Marcadores Leaflet: `alt` | ❌ | Iconos creados por Leaflet (`MapView.tsx:147,507`) sin `alt`; los popups sí son HTML con texto (`MapView.tsx:511+`) |
| Compresión (brotli) | ✅ | HTML y JS/CSS con `content-encoding: br` (el chunk runtime de 1 KB llega sin comprimir) |
| `Cache-Control` de `/assets` | ✅ | `public, max-age=31536000, immutable` (`vercel.json:45`; confirmado en producción) |
| `Cache-Control` del HTML | ✅ | `public, max-age=0, must-revalidate` (freshness correcto) |
| CSP | ⚠️ | Presente **solo** en `/` (`vercel.json:27` ⇒ `source: "/"`); ausente en `/index.html`, `/map`, `/favicon.ico`, 404 |
| HSTS | ⚠️ | `ayudaencali.lat`: `max-age=63072000` sin `includeSubDomains; preload` (el espejo sí lo tiene) |
| Code splitting / lazy chunks | ✅ | `App.tsx:17-20`; `vite.config.ts:30-34` (vendor React/Clerk propios) |
| Canonical en el dominio espejo | ✅ | `ayuda-en-cali.vercel.app` sirve el mismo HTML → canonical a `ayudaencali.lat` |

**Tamaños de producción** (texto decodificado, sin comprimir; la transferencia real es menor por brotli):

| Chunk | KB decod. | Nota |
| --- | ---: | --- |
| `vendor-react` | 202 | crítico |
| `index` (app) | 129 | crítico |
| `vendor-clerk` | 100 | crítico aunque solo hace falta al autenticar |
| `rolldown-runtime` | 1 | crítico |
| CSS `index` | 64 | crítico |
| `MapView` (pestaña por defecto) | 192 | se descarga siempre: `activeTab` inicial = `map` (`AppContext.tsx:284`) |
| `BlogView` / `ProfileView` / `ChatView` | 21 / 20 / 12 | lazy ✅ |
| **Total arranque en la vista por defecto** | **≈ 624 KB JS + 64 KB CSS** | sin contenido HTML estático previo |

---

## 3. Hallazgos priorizados

### P1 — impacto directo en indexación/posicionamiento

**SEO-01 · No existe `/robots.txt`** — Producción responde **404** (sirve la 404 HTML con `noindex`)
en `https://ayudaencali.lat/robots.txt` y en el espejo. No hay `public/robots.txt`.
*Impacto*: los buscadores no reciben directivas ni la URL del sitemap; Search Console/Bing
Webmaster Tools reportan «no accessible». *Esfuerzo*: mínimo.
*Arreglo*: crear `public/robots.txt` con `User-agent: *` / `Allow: /` /
`Sitemap: https://ayudaencali.lat/sitemap.xml` (Vercel lo servirá con 200 sin tocar `vercel.json`).

**SEO-02 · No existe `/sitemap.xml`** — 404 en ambos dominios; sin fichero en el repo.
*Impacto*: sin mapa de descubrimiento (hoy 1 URL, pero es la base para FEAT-03 landings por barrio);
los buscadores dependen de que el dominio se descubra por enlaces externos, que hoy no existen.
*Esfuerzo*: mínimo. *Arreglo*: `public/sitemap.xml` con `<urlset><url><loc>https://ayudaencali.lat/</loc>…`
(+ `lastmod`).

**SEO-03 · Cero datos estructurados (schema.org/JSON-LD)** — 0 coincidencias en todo el repo.
No hay `WebSite`, `Organization`, `LocalBusiness`/`EmergencyService`, `FAQPage` ni marcas para los
puntos del mapa (que sí tienen datos estructurados en `src/types/index.ts:39-48`: `name`, `lat/lng`,
`address`, `phone`, `category`). *Impacto*: sin elegibilidad a rich results (FAQ, panel de entidad
local), la entidad «AyudaEnCali» no queda confirmada a los buscadores; en un tema de emergencias
locales, `EmergencyService`/`LocalBusiness` con `areaServed: Cali` es la vía de notoriedad.
*Esfuerzo*: bajo (estáticos) / medio (dinámicos). *Arreglo*:
- `index.html`: JSON-LD estático `WebSite` + `Organization` (mismo `logo`, `sameAs` si hay redes).
- `index.html` o `src/App.tsx`: `FAQPage` con las 8 preguntas/respuestas reales de
  `FaqModal.tsx:21-173` (el contenido ya existe, solo hay que serializarlo).
- `src/components/MapView.tsx` o un módulo dedicado: `ItemList` + `LocalBusiness`/`EmergencyService`
  por punto renderizado (geo: `GeoCoordinates`, `address: PostalAddress`, `telephone`).

**SEO-04 · El shell entregado a los crawlers está vacío** — `index.html:59-62` solo tiene
`<div id="root">` + `<script type="module">`; **no hay `<noscript>`** y no hay texto prerenderizado
(verificado en producción: cuerpo = 3.513 B, todo `<head>`). *Impacto*: los crawlers que no ejecutan
JS (muchos bots de enlaces/redes, algunos índices) ven **cero contenido**; Googlebot renderiza pero
con cola y coste, y el contenido renderizado client-side no se garantiza que posicione. También
empuja el LCP: no hay nada pintado antes de descargar ~624 KB de JS.
*Esfuerzo*: bajo. *Arreglo*: en `index.html`, dentro de `#root` o antes de él, HTML estático con
`<h1>`, párrafo descriptivo, enlaces de texto a las secciones y un `<noscript>`; mejor aún a medio
plazo, prerender/SSG del shell.

**SEO-05 · Arquitectura sin rutas: una sola URL, navegación por `<button>`, interlinking nulo**
(decisión 2026-09-29, `docs/agentes/decisiones.md:50-56`; FEAT-03 en backlog,
`docs/agentes/tareas-semana-2.md:680`). Evidencia concreta:
- Navegación = botones: `Header.tsx:52-107`, `BottomNav.tsx:31-79`. **0 enlaces internos** en `src/`
  (grep de `href=`: solo `tel:`, `wa.me`, `google.com/maps/dir`).
- `App.tsx:49-51` cambia el `<title>` con `PAGE_META`, pero **sin sincronizar URL** (grep: no hay
  `pushState`, solo el `replaceState` de limpieza del hash del FAQ, `App.tsx:58`). El crawler solo
  alcanza la pestaña por defecto (`activeTab: 'map'`, `AppContext.tsx:284`) ⇒ solo ve el título y la
  descripción de «mapa»; los títulos de `blog`/`chat`/`profile` (`seo.ts:16-37`) son inalcanzables.
- No hay anclas, ni landings, ni rutas: `/map` devuelve **404** (verificado).
*Impacto*: imposible posicionar el tablón ni el asistente por separado; ninguna señal de enlazado
interno; ningún crawl path a contenido profundo; los títulos por pestaña no posicionan.
*Esfuerzo*: medio. *Arreglo*: sincronizar pestaña ↔ URL con `history.pushState` + hash/ruta simple
(`src/App.tsx` y `src/context/AppContext.tsx`) y usar `<a href>` en Header/BottomNav; a medio plazo,
router + FEAT-03 (landings `/barrio/<barrio>`).

### P2 — afectan a CTR, rich results o calidad del rastreo

**SEO-06 · Falta `/favicon.ico`** — 404 en ambos dominios (incluso con `?v=1`), `content-type:
text/html`. Sí existen `favicon.svg` y `apple-touch-icon.png` (200).
*Impacto*: Google y Bing piden `/favicon.ico`; su ausencia puede costar el icono de sitio en móvil y
generar errores en Search Console. *Esfuerzo*: mínimo. *Arreglo*: añadir `public/favicon.ico`.

**SEO-07 · Sin `<h1>` en la vista por defecto (`MapView`) ni en `ChatView`**
(grep `<h1`: solo `BlogView.tsx:260`, `ProfileView.tsx:84`, `main.tsx:41` y `ErrorBoundary.tsx:47`;
`MapView` empieza en `h2`/`h3` — `MapView.tsx:960,1020,1148` — y `ChatView` en `h2` — `ChatView.tsx:187`).
*Impacto*: la vista que todo el mundo (y el crawler) carga primero no tiene H1 temático; se pierde la
señal principal de relevancia «mapa de ayuda y emergencias en Cali». *Esfuerzo*: mínimo.
*Arreglo*: `<h1>` visible en `src/components/MapView.tsx` (panel/lista) y en `src/components/ChatView.tsx`.

**SEO-08 · El FAQ real no está en el DOM cuando está cerrado** — `FaqModal.tsx:193`
(`if (!isOpen) return null;`), y las respuestas son `ReactNode` (`FaqModal.tsx:14-19`). Solo se abre
por interacción (botón del header `Header.tsx:113-121` o enlace `/#preguntas-frecuentes` de la 404).
*Impacto*: ninguna de las 8 preguntas/respuestas es indexable ni sirve para `FAQPage`; el tráfico de
«preguntas frecuentes Cali / cómo reportar un centro» no existe. *Esfuerzo*: bajo (JSON-LD estático)
/ medio (sección indexable). *Arreglo*: serializar `FAQ_ITEMS` a JSON-LD en `index.html` y, opcionalmente,
añadir una sección de FAQ renderizada en el flujo normal.

**SEO-09 · `meta description` con 168 caracteres** — `index.html:7-10` (medido en producción).
*Impacto*: se recorta en la SERP (corte ≈155-160), perdiendo el final («…y asistente de IA»).
*Esfuerzo*: mínimo. *Arreglo*: acortar a ≤155 en `index.html` (y revisar los de `seo.ts:16-37`,
que están en 150-165).

**SEO-10 · Dominio espejo sin redirección** — `https://ayuda-en-cali.vercel.app` sirve el mismo
HTML con `canonical` → `ayudaencali.lat` (✅ evita duplicado) pero **no redirige** y tampoco tiene
`robots.txt`/`sitemap.xml`. *Impacto*: bajo por el canonical; residual: enlaces externos al espejo
no transfieren 100 %, y dos hosts que rastrear. *Esfuerzo*: bajo. *Arreglo*: `redirects` en
`vercel.json` (308 espejo → `https://ayudaencali.lat`) o, si el espejo es necesario para previews,
dejarlo como está y documentarlo (requiere consenso: tocaría `vercel.json`, área de infra).

**SEO-11 · Imágenes: peso y accesibilidad del mapa** —
- Hero del tablón usa una única URL `w_1600` (`src/config/images.ts:25`) sin `srcset`/`sizes` ni
  `fetchpriority="high"` (`BlogView.tsx:242-250`) ⇒ descarga ~ancho completo en móvil.
- Marcadores Leaflet sin `alt` (iconos de `MapView.tsx:147,507`); los popups sí contienen texto
  indexable tras render.
- ✅ Buenas prácticas ya presentes: `width`/`height` y `loading="lazy"` en tarjetas
  (`BlogView.tsx:465-467`), `alt={need.title}` (`BlogView.tsx:464`), `decoding="async"`.
*Esfuerzo*: bajo. *Arreglo*: `srcset`+`sizes` en `images.ts`/`BlogView`, `fetchpriority` en el hero,
`alt` en los iconos de marcador.

**SEO-12 · Interlinking interno inexistente** — El 404 enlaza bien (`404.html:159-160`: al mapa y al
FAQ) ✅, pero dentro de la app no hay **ningún** enlace de texto a otra vista/contenido, ni `<footer>`
con enlaces, ni skip-link; la navegación es exclusivamente por botones.
*Impacto*: el PageRank interno no circula (con 1 URL apenas importa, pero bloquea FEAT-03 y degrada
la señal de anclas). *Esfuerzo*: bajo. *Arreglo*: convertir la navegación a `<a>` + añadir un `<footer>`
con enlaces de texto (mapa, tablón, asistente, FAQ, 404) en `src/App.tsx`.

### P3 — mejoras y deuda técnica

**SEO-13 · Metadatos sociales dinámicos incompletos** — `seo.ts:46-53` actualiza
`title/description/og:title/og:description/twitter:title/twitter:description` pero **no** `og:url`,
`og:image`, `og:type` ni `canonical`. Hoy es inocuo (1 URL), pero si se comparte la app mientras se
está en otra pestaña, la preview mantiene la imagen/título inicial. *Esfuerzo*: mínimo. *Arreglo*:
`src/utils/seo.ts`.

**SEO-14 · CSP solo en `/`** — `vercel.json:27` usa `source: "/"`, que en Vercel sólo casa con la
raíz exacta: verificado que `/index.html`, `/map`, `/ruta-inexistente`, `/favicon.ico` y los assets
**no** llevan CSP. No es SEO estrictamente (Safari/Google no la usan para rankear), pero es
inconsistencia de seguridad/cabeceras. *Arreglo*: `vercel.json` (área de infra/backend).

**SEO-15 · La API JSON no declara `X-Robots-Tag`** — `/api/*` responde JSON con 200 y sin
`X-Robots-Tag: noindex` (verificado `/api/health`). En teoría Google puede rastrear/indexar JSON.
*Esfuerzo*: mínimo. *Arreglo*: cabecera en `server/middleware.ts` o en `vercel.json`
(área backend, dejar anotado).

**SEO-16 · Micro-arquitectura de accesibilidad con impacto SEO** — `lang="es"` en vez de `es-CO`
(`index.html:2`); ningún `<nav>` marca `aria-current` al activo; sin skip-link; sin `<footer>`
(ver grep: 0 coincidencias de `role="contentinfo"`/skip). *Esfuerzo*: mínimo. *Arreglo*:
`index.html`, `Header.tsx`, `BottomNav.tsx`, `App.tsx`.

**SEO-17 · Peso inicial ~624 KB de JS decodificado** — `vendor-clerk` (100 KB) se sirve con
`modulepreload` en el HTML de producción aunque la autenticación no es necesaria para el primer
pintado; la pestaña por defecto (`map`) fuerza el chunk `MapView` (192 KB) en la primera carga
(`AppContext.tsx:284` + `App.tsx:17-20`). Compresión brotli ✅, caché immutable ✅, chunks por pestaña ✅.
*Impacto*: LCP/TBT en móviles (no cuantificable sin navegador). *Esfuerzo*: medio. *Arreglo*:
`index.html`/`vite.config.ts` (cargar Clerk bajo interacción si es viable) y revisar el peso de
Leaflet+mapa.

**SEO-18 · Indexación y render: no verificable sin navegador/Search Console** — No se pudo
confirmar si Googlebot indexa el contenido renderizado (mapa/tablón/FAQ), ni los CWV de campo.
`site:ayudaencali.lat` → 0 resultados (evidencia débil). *Acción*: verificar en Search Console
(propiedad + sitemap) tras aplicar SEO-01/SEO-02.

---

## 4. Quick wins (top 5: esfuerzo mínimo, impacto alto)

1. **`public/robots.txt`** con `Allow: /` y `Sitemap: https://ayudaencali.lat/sitemap.xml` →
   cierra SEO-01 en minutos (1 fichero, sin tocar build ni `vercel.json`).
2. **`public/sitemap.xml`** con la URL raíz → cierra SEO-02; requisito previo para dar de alta
   Search Console y para FEAT-03.
3. **JSON-LD estático en `index.html`**: `WebSite` + `Organization`/`EmergencyService` +
   `FAQPage` con las 8 preguntas de `FaqModal.tsx:21-173` → abre la puerta a rich results (SEO-03,
   SEO-08) sin tocar el render.
4. **`<h1>` visible en `MapView`** (vista por defecto) y en `ChatView` → la página más visitada deja
   de carecer de titular temático (SEO-07), 2 líneas de JSX.
5. **HTML estático + `<noscript>` dentro de `#root`** en `index.html` (h1, párrafo, enlaces de texto)
   → contenido indexable sin JS y algo pintado antes de los 624 KB de JS (SEO-04, SEO-12).

*Honorable mention*: `public/favicon.ico` (SEO-06) y acortar la `meta description` a ≤155 (SEO-09),
ambos de un fichero.

---

## 5. Anexo — evidencia de producción (fetch 2026-10-02)

| URL | Estado | Cabecera/dato relevante |
| --- | --- | --- |
| `https://ayudaencali.lat/` | 200 | `content-encoding: br`, `cache-control: public, max-age=0, must-revalidate`, CSP presente, HSTS `max-age=63072000`, HTML 3.513 B |
| `…/robots.txt` | **404** | sirve `404.html` (`noindex,follow`) — ambos dominios |
| `…/sitemap.xml` | **404** | idem — ambos dominios |
| `…/favicon.ico` | **404** | `content-type: text/html`, `cache-control: max-age=604800` |
| `…/favicon.svg` | 200 | `image/svg+xml`, 352 B |
| `…/images/apple-touch-icon.png` | 200 | `image/png`, `cache-control: max-age=604800` |
| `…/ruta-inexistente` | **404** | `404.html` con `noindex,follow` ✅ — ambos dominios |
| `…/map` | **404** | no hay rutas (decisión 2026-09-29) |
| `…/index.html` | 200 | mismo shell; canonical → `ayudaencali.lat` (duplicado resuelto) |
| `…/?utm_source=test` | 200 | lleva CSP (sí casa con `/` + query) |
| `…/api/health` | 200 | `application/json`, sin `X-Robots-Tag` |
| `og:image` (Cloudinary) | 200 | `image/jpeg`, 145.683 B, 1200×630 |
| `/assets/index-*.js` | 200 | `br`, `cache-control: public, max-age=31536000, immutable` |
| CSP en `/index.html`, `/map`, 404 | ausente | `vercel.json:27` limita la CSP a `source: "/"` |
