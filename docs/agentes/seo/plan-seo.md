# Plan SEO consolidado — AyudaEnCali (2026-10-02)

> **Fuentes** (investigación hecha por 3 agentes en paralelo, solo lectura):
> [`01-tecnico.md`](01-tecnico.md) (SEO-01..18) ·
> [`02-keywords.md`](02-keywords.md) (QW-01..10, huecos H1..H5) ·
> [`03-geo-ia.md`](03-geo-ia.md) (GEO-01..10).
>
> **Objetivo único**: mejor posicionamiento para **buscadores** (Google/Bing)
> **y para agentes/IA** (ChatGPT, Gemini, Perplexity, AI Overviews). Los tres
> informes convergen en los mismos cuellos de botella, resumidos abajo.

---

## 1 · Diagnóstico consolidado (por qué hoy no posicionamos)

| # | Cuello de botella (consenso de los 3 informes) | Evidencia | Cierra |
| --- | --- | --- | --- |
| 1 | **Sin `robots.txt`, sin `sitemap.xml`, sin `llms.txt`** — 404 en producción | fetch 2026-10-02, ambos dominios | SEO-01/02 · GEO-01/04/05 · QW-01 |
| 2 | **Shell vacío para crawlers** — `<div id="root">` solo, sin `<noscript>`, sin JSON-LD (0 en el repo) | `index.html`, prod: HTML 3.513 B | SEO-03/04 · GEO-02/03 |
| 3 | **FAQ real no indexable** — `FaqModal` hace `return null` al cerrar; 8 preguntas fuera del DOM | `FaqModal.tsx:193` | SEO-08 · QW-03 · GEO-03 |
| 4 | **Sin `<h1>` en la vista por defecto (Mapa) ni en Chat** | grep `<h1` | SEO-07 |
| 5 | **Arquitectura sin rutas**: 0 `<a href>` internos, pestañas ≠ URL, interlinking nulo | `Header.tsx`/`BottomNav.tsx` = botones | SEO-05/12 · hueco H2 |
| 6 | **Marca inexistente como entidad**: `site:ayudaencali.lat` → 0 indexados, sin GBP/Wikidata/prensa | SERP de marca = solo redes | QW-09 · H5 · GEO-08 |
| 7 | **Sin medición GEO** — no hay «antes» de nada | — | GEO-10 |

**Ventaja defendible** (los 3 coinciden): los rivales son directorios
reactivos a la crisis con URLs caducadas; nosotros podemos ofrecer **páginas
vivas** (mapa + tablón + asistente + FAQ) con datos propios (`/api/points`
público) y cobertura **por barrio** (nadie la tiene) → content + datos
abiertos = material citable por buscadores **y** LLMs.

---

## 2 · Tareas asignadas (T34–T42)

> Se añaden al tablero [`../tareas-semana-2.md`](../tareas-semana-2.md).
> Áreas: **frontend** = `src/**`, `index.html`, `public/**` · **backend** =
> `server/**`, `api/**` · **persona** = acciones fuera del repo (cuentas).

### Fase 0 · Baseline (paralelo a todo, **lo primero para poder medir**)

| Tarea | Qué | Área | Esfuerzo | Cierra |
| --- | --- | --- | --- | --- |
| **T41** | **Baseline GEO + Search Console**: panel de 10 preguntas × 5 motores (ChatGPT, Gemini, Perplexity, AI Mode/Overviews, Copilot) antes de tocar nada · alta y verificación en Search Console + envío de sitemap · canal GA4 *AI Assistants* | **persona** (cuentas) + coordinador | S | GEO-10 |

### Fase 1 · Quick wins en repo (sin decisiones nuevas)

| Tarea | Qué | Área | Esfuerzo | Cierra |
| --- | --- | --- | --- | --- |
| **T34** | **Archivos base**: `public/robots.txt` (matriz 2026: bloquear entrenamiento `GPTBot`/`ClaudeBot`/`CCBot`/`Google-Extended`, permitir citación `OAI-SearchBot`/`Claude-SearchBot`/`PerplexityBot` + `Sitemap:`) · `public/sitemap.xml` (URL raíz + `lastmod`) · `public/llms.txt` (FAQ, API pública, datos, líneas de emergencia) · `public/favicon.ico` | frontend | XS–S | SEO-01/02/06 · GEO-01/04/05 · QW-01 |
| **T35** | **JSON-LD + shell indexable en `index.html`**: `WebSite`+`SearchAction`, `Organization`/`EmergencyService` (`areaServed: Cali`), `FAQPage` con las 8 preguntas reales (extraer `FAQ_ITEMS` a `src/data/faq.ts` compartido) · HTML estático dentro de `#root` (`<h1>`, párrafo, enlaces de texto) + `<noscript>` · `meta description` ≤155 · `lang="es-CO"` | frontend | S | SEO-03/04/09/16 · GEO-02(parcial)/03 |
| **T36** | **On-page por vista**: `<h1>` en `MapView` y `ChatView` · reoptimizar title/descripción de la pestaña mapa (QW-02: «Centros de acopio y albergues en Cali») · `<footer>` con enlaces de texto · `aria-current` en navs · `seo.ts` completo (`og:url`, `og:image`, canonical) · `srcset`/`fetchpriority` en el héroe del tablón · `alt` en marcadores Leaflet | frontend | S | SEO-07/11/12/13/16 · QW-02 |
| **T37** | **FAQ visible e indexable**: sección `/#preguntas-frecuentes` renderizada en el flujo normal (no modal que devuelve `null`), enlazada desde header/footer/404, con las 8 actuales + preguntas PAA de la investigación («números de emergencia en Cali», «qué llevar a un albergue»…) | frontend | M | SEO-08 · QW-03 |
| **T39** | **API sin indexar**: `X-Robots-Tag: noindex` en `/api/*` (`server/middleware.ts`/`http.ts`) | backend | XS | SEO-15 |

*Verificación habitual de la fase:* `lint` · `vite build` · `test:ui` ·
`test:server` · `smoke:vercel` en verde; Rich Results Test sin errores de
los JSON-LD nuevos.

### Fase 2 · Requiere decisión previa (no ejecutar sin luz verde)

| Tarea | Qué | Área | Esfuerzo | Bloqueo |
| --- | --- | --- | --- | --- |
| **T38** | **Pestaña ↔ URL**: sincronizar vista con `history.pushState` (`/#mapa`, `/#tablon`… o rutas simples) y convertir la navegación a `<a href>` → interlinking real y títulos por pestaña alcanzables | frontend | M | **Decisión**: la de «sin enrutador» (2026-09-29) no se rompe (no se añade router), pero sí cambia la arquitectura de URLs → proponer en `decisiones.md` |
| **T40** | **Landings keyword-driven (FEAT-03 primer lote)**: `/emergencias-cali` (QW-04), `/terremoto-cali` (QW-05), barrios Siloé/Terrón Colorado/Granada/San Antonio/El Vallado (QW-06), `/veterinarias-24-horas-cali` (QW-07), `/donar-en-cali` (QW-08), `/lluvias-cali` **antes de noviembre** (estacionalidad) · sello «actualizado el …» + `ItemList` (QW-10) | frontend | L | **T38** (sin URLs no hay landings) |
| **T43** | **Prerender del shell** en el build (HTML con contenido real de fábrica, no solo estático en `#root`) | frontend + build | M | T35 (lo hace casi innecesario; validar con crawl) |
| **T44** | **Deuda de `vercel.json`** (área calidad): redirect 308 del espejo → `ayudaencali.lat` (SEO-10), CSP en todas las rutas, no-cache de `/sw.js` | calidad | XS | consenso (fichero de otra área) |

### Fase 3 · Off-site y continuo (fuera del repo — persona)

| Tarea | Qué | Área | Esfuerzo | Cierra |
| --- | --- | --- | --- | --- |
| **T42** | **Entidad «AyudaEnCali»**: Google Business Profile (categoría ONG/emergencias, 24/7) · Wikidata con `official website` · nota de prensa en medios locales (90minutos/Occidente/Pulzo) · respuestas útiles en Reddit/hilos de Cali · directorios oficiales (Cruz Roja, Defensa Civil) | persona | L | QW-09 · H5 · GEO-08 |
| — | **Medición quincenal** (KPIs §4 de `03-geo-ia.md`): prompt panel → objetivo **≥30 % de prompts que citan `ayudaencali.lat` a 90 días** · GSC *AI features* · canal GA4 IA · logs Vercel de `OAI-SearchBot`/`PerplexityBot`/`Claude-SearchBot` | persona + coordinador | cont. | GEO-10 |

---

## 3 · Orden y paralelismo

```
T41 (persona)          ──────────────────────────────▶ medición continua
T34 ∥ T35 ∥ T36 ∥ T39  ──▶ puerta (lint/build/tests) ──▶ T37
                                          [luz verde] ▼
                                    T38 ──▶ T40 ──▶ T43
T42 (off-site, continuo desde ya)
```

- **Grupo inmediato:** `T34 ∥ T35 ∥ T36 ∥ T39` — disjuntos por fichero
  dentro del área frontend salvo `index.html` (T34 no lo toca) → ejecutar
  con **un agente frontend secuencial** (T34→T35→T36) ∥ **backend** (T39).
- **T37** tras la puerta (toca `index.html` y `src/` como T35/T36).
- **T38/T40** solo con decisión registrada en `decisiones.md`.

## 4 · Decisiones que pedimos a la persona (una línea cada una)

1. **T38 — URLs por pestaña** (pushState): ¿sí? Es la llave de todo
   FEAT-03/landings. *Recomendación: sí, sin router, solo sincronizar.*
2. **`robots.txt` — política de entrenamiento IA**: recomendado por los
   informes *bloquear entrenamiento / permitir citación*; alternativa
   (misión de una app de emergencias): permitir todo para máxima difusión.
   *Recomendación: seguir la matriz 2026 y anotar la alternativa en
   `decisiones.md`.*
3. **Espejo `ayuda-en-cali.vercel.app`**: 308 al dominio principal vs
   dejarlo como preview (SEO-10).

## 5 · KPIs del plan

| KPI | Fuente | Meta |
| --- | --- | --- |
| Indexación (`site:ayudaencali.lat`) | Search Console | > 0 tras T34+T41; landing raíz indexada en 2–4 semanas |
| Rich results (FAQ/WebSite) | Rich Results Test | 0 errores con T35 |
| Citación en motores generativos | prompt panel 5 motores | ≥ 30 % de prompts a 90 días |
| Tráfico IA | GA4 canal *AI Assistants* | tendencia mensual ↑ |
| Consultas de marca | GSC | crecimiento (proxy de atribución oscura) |
| Keywords P1 en top 100 | GSC/posiciones | «centros de acopio en Cali» y long-tail de barrio tras T40 |
