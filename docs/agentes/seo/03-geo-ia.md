# 03 · GEO (Generative Engine Optimization) — posicionamiento en motores de IA

> **Agente:** GEO · **Modo:** investigación (solo lectura; este es mi único fichero de
> escritura) · **Fecha:** 2026-10-02
>
> Objetivo: que **ChatGPT, Gemini, Perplexity, Google AI Overviews/AI Mode y Copilot**
> descubran, entiendan y **citen AyudaEnCali** como fuente de emergencias de Cali,
> sin perder el SEO tradicional. Todas las prácticas están verificadas con fuentes
> de 2026 (cada hallazgo lleva URL); lo que no pude comprobar se marca como tal.

---

## 1 · Estado actual de AyudaEnCali frente a GEO

Comprobado en el repo y contra producción (`https://ayudaencali.lat`, despliegue
Vercel Hobby según `docs/agentes/decisiones.md`, 2026-09-29).

| # | Comprobación | Estado | Evidencia |
|---|---|---|---|
| 1 | `robots.txt` | ❌ | `GET https://ayudaencali.lat/robots.txt` → **404**; no existe `public/robots.txt` (en `public/` solo hay `favicon.svg`, `404.html`, `images/`). `grep` de `User-agent` en todo el repo: 0 resultados. |
| 2 | `sitemap.xml` | ❌ | `GET https://ayudaencali.lat/sitemap.xml` → **404**; sin fichero ni declaración `Sitemap:`. |
| 3 | `llms.txt` | ❌ | No existe en `public/` ni en prod; ningún referente en el repo. |
| 4 | JSON-LD / schema.org | ❌ | `grep "application/ld+json\|schema.org\|FAQPage"` en todo el repo → **0 resultados**. |
| 5 | Indexabilidad del contenido (SPA sin prerender) | ⚠️ | `index.html` tiene `meta robots index,follow`, canonical y OG, pero el `<body>` es solo `<div id="root"></div>`: **FAQ, mapa, tablón y asistente no existen en el HTML servido**. Los crawlers de IA (que no ejecutan JS, ver GEO-02) ven una página casi vacía. |
| 6 | Única URL indexable | ⚠️ | Sin enrutador; toda URL distinta de `/` devuelve `404.html` real con `noindex` (decisión 2026-09-29). Bien para no indexar basura, pero **no hay landings** (`FEAT-03` pendiente). |
| 7 | Título/descripción por vista | ⚠️ | `src/utils/seo.ts` (`updatePageMeta`) cambia title/description **solo en cliente**: un crawler sin JS solo ve lo de `index.html`. |
| 8 | FAQ real (8 preguntas) | ⚠️ | Existe y es buena materia prima citable (`src/components/FaqModal.tsx`, `FAQ_ITEMS`), pero vive dentro de un **modal de React**: inaccesible sin JS y sin marcado `FAQPage`. |
| 9 | API de datos abiertos | ✅ | `GET /api/points` y `GET /api/needs` **públicos sin auth** (`server/handlers/points.ts:250`, `needs.ts`), paginados → base para ser «fuente primaria» de datos. |
| 10 | Asistente `CaliSolidaria IA` | ⚠️ | `POST /api/chat` **solo POST** (`server/handlers/chat.ts:189` → `notFoundResult` para otros métodos). Correcto: un crawler no puede «conversar», y evita que el LLM de terceros scrapee el chat; pero también significa que **las respuestas del asistente no son contenido indexable**. |
| 11 | Open Graph / Twitter Cards | ✅ | Completos en `index.html` (imagen Cloudinary 1200×630) — bueno para citación en redes/respuesta social. |
| 12 | Fechas `dateModified` / fuentes visibles | ❌ | No hay datos estructurados de fecha ni pie «actualizado el …» detectable; clave para temas de emergencias (ver GEO-09). |
| 13 | `sameAs` / redes sociales | ❌ | No hay perfiles sociales declarados en HTML ni schema. No verificado si la marca tiene perfiles oficiales. |
| 14 | Search Console / GA4 configurados | ❌/⚠️ | No hay evidencia en el repo de la propiedad de GSC ni de canal GA4 de tráfico IA. **No pude comprobarlo desde aquí** (requiere acceso a las cuentas). |

**Resumen:** indexación básica aprobada (title/description/canonical/OG), pero en GEO
partimos de **casi cero infraestructura**: sin robots, sin sitemap, sin JSON-LD,
sin llms.txt y con todo el contenido tras JavaScript.

---

## 2 · Hallazgos priorizados (GEO-01 … GEO-10)

Prioridad: **P1** = hacer ya (impacto alto, esfuerzo bajo) · **P2** = siguiente oleada · **P3** = exploratorio.
Esfuerzo: XS < 1 h · S ≤ medio día · M 1–2 días · L > 1 semana (con pruebas).

### GEO-01 · `robots.txt`: política «bloquea entrenamiento, permite citas» (P1)

- **Práctica recomendada (2026):** los grandes laboratorios **separaron el crawler de
  entrenamiento del de búsqueda**, y son user-agents distintos: `GPTBot` ≠ `OAI-SearchBot`,
  `ClaudeBot` ≠ `Claude-SearchBot` ≠ `Claude-User`, `Amazonbot` ≠ `Amzn-SearchBot`.
  El default defendible es **bloquear los de entrenamiento** (`GPTBot`, `ClaudeBot`,
  `CCBot`, `Google-Extended`, `Applebot-Extended`, `Amazonbot`) y **permitir los de
  respuesta/búsqueda** (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`,
  `Perplexity-User`, `Amzn-SearchBot` + `Googlebot`/`Bingbot` normales).
  Bloquear «todo lo IA» en una sola regla te borra de las citas de IA — el error más
  común (~71% de los grandes editores bloquea sin querer un bot de búsqueda).
  `Bytespider` ignora robots.txt de forma intermitente: solo se frena en WAF/IP
  (no aplica a nosotros en Vercel Hobby; dejar constancia).
- **Fuente:**
  - Matriz bot-a-bot 2026 (con referencias a `openai.com/gptbot.json`,
    `openai.com/searchbot.json`, `claude.com/crawling/bots.json`): <https://www.digitalapplied.com/blog/ai-crawler-access-control-2026-robots-llms-txt-decision-matrix>
  - «AI Crawlers Explained… allow their search and user agents in robots.txt»: <https://www.anagram.ai/blog/ai-crawlers-explained-gptbot-claudebot-perplexitybot-and-how-to-let-them-in-2026>
  - Guía oficial Google de IA en Search (robots accesibles = requisito): <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
- **Matiz propio para una app de emergencias (apertura vs control):** somos contenido
  cívico cuyo valor es **difundirse**. Hay un argumento legítimo para permitir también
  `GPTBot`/`ClaudeBot` (que el dato de ayuda esté en los modelos), pero eso cede
  contenido comunitario a corporaciones sin atribución. **Recomendación:** aplicar el
  default de la matriz (bloquear entrenamiento / permitir búsqueda) y **anotar la
  alternativa en `docs/agentes/decisiones.md` para consenso** — no toco ese fichero.
- **Implementación en ESTE repo:** crear **`public/robots.txt`** (Vite lo copia a
  `dist/`, Vercel lo sirve en la raíz; también funciona en local/Docker con `server.ts`).
  Contenido: `Allow: /` para `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`,
  `Perplexity-User`, `Googlebot`, `bingbot`; `Disallow: /` para `GPTBot`, `ClaudeBot`,
  `CCBot`, `Google-Extended`, `Applebot-Extended`, `Amazonbot`, `Bytespider`; cerrar con
  `Sitemap: https://ayudaencali.lat/sitemap.xml`. **Verificar los user-agents en la
  documentación de cada operador antes de subir** (cambian).
- **Esfuerzo:** XS (fichero estático + validador de robots.txt de GSC).

### GEO-02 · El HTML servido está vacío: prerender / contenido visible sin JS (P1)

- **Práctica recomendada:** desde 2026 **ningún crawler de IA importante ejecuta
  JavaScript de forma fiable** (GPTBot, ClaudeBot, PerplexityBot leen el HTML crudo;
  Googlebot/Bingbot renderizan). Todo lo que vive en `<div id="root">` —FAQ, tablón,
  mapa, textos del asistente— es **invisible para ChatGPT/Perplexity/Gemini**. Esto no
  es cloaking (todos ven lo mismo), pero sí **invisibilidad**; el riesgo de cloaking
  real aparece si algún día servimos HTML distinto por user-agent — evitar.
- **Fuentes:**
  - «Do AI Crawlers Render JavaScript in 2026? … No major AI crawler reliably renders
    JavaScript» (secundaria, consistente con el resto): <https://hamzashabbir.dev/article/ai-crawlers-javascript-rendering-nextjs-spa-invisible-2026>
  - «AI Crawlers Do Not Render JavaScript»: <https://www.asklantern.com/blogs/ai-crawlers-do-not-render-javascript>
  - JS SEO oficial de Google (Googlebot renderiza; el resto no está garantizado): <https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics>
  - Guía «agent-friendly sites» de web.dev (qué leen los agentes: HTML, árbol de
    accesibilidad, screenshots): <https://web.dev/articles/ai-agent-site-ux>
- **Implementación en ESTE repo (por orden de coste):**
  1. **S (rápido):** meter en `index.html` un bloque de contenido estático real
     (sección `<main>` visible con el FAQ resumido + qué es la app + teléfonos 123,
     o al menos `<noscript>` semántico) **y** el JSON-LD de GEO-03. Mismo contenido
     para humanos y bots (sin cloaking).
  2. **M:** prerender estático del shell con `react-sprеg`/`vite-plugin-ssg` en el
     build de Vercel (`vercel.json` → `buildCommand`), de modo que `dist/index.html`
     salga con el contenido ya montado.
  3. **M/L (cuando exista router):** SSR/SSG de las landings `FEAT-03`
     (`/barrio/<barrio>`, pendiente en `tareas-semana-2.md:680`).
- **Esfuerzo:** S (paso 1) / M (paso 2).

### GEO-03 · JSON-LD citable en `index.html` (P1)

- **Práctica recomendada:** el JSON-LD estático en el `<head>` es lo único de
  estructura que **todos** los crawlers leen sin JS. Priorizar:
  - **`FAQPage`** con las 8 preguntas reales de `FaqModal.tsx` (es el activo citable
    número uno: los motores de respuesta adoran FAQ marcado). *Matiz verificado:*
    Google dejó de mostrar *rich results* de FAQ (mayo 2026) y retiró la doc, pero su
    guía de IA dice textualmente que el structured data **no es obligatorio para IA
    pero conviene seguir usándolo**; y hay datos de que las páginas citadas por IA
    llevan `FAQPage` muy por encima de la media del índice.
  - **`WebSite` + `SearchAction`** (la app tiene buscador de puntos en el mapa).
  - **`Organization`/`WebSite` con `sameAs`** (redes oficiales cuando existan) e
    `identifier`/`url` → `https://ayudaencali.lat`.
  - **`Dataset`** (ver GEO-07) para los datos abiertos de puntos → autoridad de datos.
  - **`GovernmentService`/`EmergencyService`** es *tentador* pero **no aplica**: no
    somos entidad oficial; usar `Organization` + `areaServed: Cali` para no arriesgar
    penalización por datos engañosos. `LocalBusiness` solo si hubiera sede física
    declarada (no la hay verificada).
- **Fuentes:**
  - Guía Google «Optimizing your website for generative AI features» (structured data
    recomendado como parte de la estrategia, sin markup «especial» obligatorio):
    <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
  - FAQ rich results retirados (matiz mayo/junio 2026): <https://webserv.io/resources/blog/faq-schema-after-march-2026-core-update-behavioral-health/>
  - Datos de sobrerrepresentación de `FAQPage` en páginas citadas por IA (secundaria): <https://arcalea.com/blog/how-ai-search-engines-understand-and-rank-content-in-2026-arcalea>
  - Formato JSON-LD preferido por Google: <https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data>
- **Implementación en ESTE repo:** bloque `<script type="application/ld+json">` en
  **`index.html`** (los *data blocks* no ejecutados no están sujetos a `script-src`
  de la CSP de `vercel.json` — verificar con el informe de CSP tras desplegar).
  Mantener las 8 FAQ **en un único sitio de verdad** (ideal: extraer `FAQ_ITEMS` a un
  módulo compartido `src/data/faq.ts` que consuman `FaqModal.tsx` y el generador del
  JSON-LD, para que no diverjan).
- **Esfuerzo:** S.

### GEO-04 · `llms.txt` en la raíz (P1)

- **Práctica recomendada:** fichero **Markdown en `/llms.txt`** con: H1 (nombre),
  blockquote (resumen con la propuesta clave), secciones H2 con listas de enlaces de
  alto valor (20–50 links curados), y por convención una sección final `## Optional`.
  Desde la v2 (ago 2026) se recomienda también servir versiones `.md` de las páginas
  y cabeceras `Link: </llms.txt>; rel="describedby"`. **`llms.txt` NO es un opt-out de
  entrenamiento** (eso es robots.txt): es navegación en tiempo de inferencia.
  **Google Search lo ignora oficialmente** (guía Google, ver fuentes), pero Chrome
  Lighthouse lo audita (*agentic browsing*), OpenAI/Anthropic/Gemini lo publican en
  sus propias docs, y otros agentes/motores sí lo usan → bajo riesgo, beneficio
  esperado en ChatGPT/Gemini/agentes.
- **Fuentes:**
  - Spec oficial v2 con formato exacto: <https://llmstxt.org/>
  - Google («Google Search doesn't use them; fine to create for other services»):
    <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
  - Buenas prácticas (H1 + propuesta, 20–50 enlaces, raíz): <https://aigrowthagent.co/articles/llms-txt-best-practices/>
  - Lighthouse audita `llms.txt`: <https://www.searchenginejournal.com/googles-llms-txt-guidance-depends-on-which-product-you-ask/575431/>
- **Implementación en ESTE repo:** crear **`public/llms.txt`** con, como mínimo:
  - `# AyudaEnCali` + blockquote: plataforma comunitaria de emergencias de Santiago
    de Cali (qué es, para quién, «no sustituye al 123»).
  - `## Preguntas frecuentes` → enlace al FAQ (una vez publicado como contenido
    estático/enrutado, GEO-02).
  - `## Datos abiertos y API` → `GET https://ayudaencali.lat/api/points`,
    `/api/needs`, `/api/health` con nota de formato y paginación.
  - `## Mapa y tablón`, `## Asistente (CaliSolidaria IA)` → nota de que el chat es
    `POST /api/chat` y no está pensado para crawlers.
  - `## Emergencias oficiales` → 123, fuentes oficiales de Cali (para que el modelo
    ancle lo oficial vs lo comunitario).
  - `## Optional` → repo/docs si se quiere abrir.
  - Efecto red: el enlace a `/api/points` convierte al crawler en usuario de la API.
- **Esfuerzo:** S (redacción curada; mantenerla viva).

### GEO-05 · `sitemap.xml` + Search Console (P1)

- **Práctica recomendada:** aunque hoy solo hay una URL, el sitemap es el canal
  oficial de descubrimiento para Google (y Google es la base de AI Overviews/AI Mode
  — la guía de Google es explícita: **para aparecer en features generativas la página
  debe estar indexada y con snippet**, y debe estar activada la visibilidad en el
  informe de IA de Search Console). Con `FEAT-03` (landings por barrio) el sitemap
  pasa a ser imprescindible.
- **Fuentes:**
  - <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
  - Sitemaps: <https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview>
  - Visibilidad en features generativas: <https://support.google.com/webmasters/answer/16908024>
- **Implementación en ESTE repo:** **`public/sitemap.xml`** (una URL hoy:
  `https://ayudaencali.lat` con `lastmod` real) + `Sitemap:` en `robots.txt`
  (GEO-01) + dar de alta la propiedad en **Search Console** y enviarlo.
- **Esfuerzo:** XS.

### GEO-06 · Datos abiertos + API como estrategia de citación (P2)

- **Práctica recomendada:** que los motores traten `ayudaencali.lat` como **fuente
  primaria** de «puntos de ayuda activos en Cali» (no como resumen de otro). Los GET
  públicos ya existen; el salto es **documentarlos y declararlos**: `Dataset` JSON-LD
  con `distribution` (los endpoints), `license`, `temporalCoverage`/`dateModified`,
  y un contrato estable `/api/v1` (`FEAT-06`, `tareas-semana-2.md:685`). Cuando un
  LLM cita un dato que solo tú sirves con fecha, la citación se atribuye a la fuente.
- **Fuentes:**
  - Schema `Dataset` de Google: <https://developers.google.com/search/docs/appearance/structured-data/dataset>
  - «Statistics + citations boost visibility >40%» (estudio Princeton GEO): <https://arxiv.org/pdf/2311.09735>
  - Guía Google (crawlable y público = requisito para grounding/RAG): <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
- **Implementación en ESTE repo:**
  - JSON-LD `Dataset` en `index.html` apuntando a `/api/points` y `/api/needs`
    (título «Puntos de ayuda activos en Santiago de Cali», distribución en JSON,
    `dateModified` desde el servidor).
  - `public/llms.txt` → sección «Datos abiertos» (GEO-04).
  - Futuro: `server/handlers/*.ts` (núcleos) o `server/app.ts` para añadir
    `GET /api/v1/...` con contrato y `Link` headers; **coordinar con agente-backend**
    (no toco `server/**`).
- **Esfuerzo:** M.

### GEO-07 · Contenido citable: definiciones upfront, tablas, cifras con fuente, fechas (P2)

- **Práctica recomendada (evidencia académica):** en el estudio original de GEO
  (Princeton/ACM), **citas, citas textuales de fuentes relevantes y estadísticas
  suben la visibilidad >40%** (citas de experto con credencial +40,9%; estadística con
  fuente +30,6%). Aplicado a nosotros:
  - Respuesta **primero** («AyudaEnCali es…») y contexto después; frases
    autocontenidas que un LLM pueda extraer tal cual.
  - **Tablas** (categorías de puntos, teléfonos útiles, barrios cubiertos).
  - **Cifras con fuente y fecha**: «217 puntos activos en Cali · actualizado
    2026-10-02» — nada de cifras sin sello temporal (mitigación anti-alucinación).
  - Rol del asistente: `CaliSolidaria IA` **no produce contenido indexable**
    (`POST /api/chat`); por eso el FAQ y los datos publicados son la cara «citable»
    del asistente. Mantener la práctica actual de que el asistente **cita los datos
    de la plataforma y el 123**, y publicar esa política en el FAQ (ya está en
    `FaqModal.tsx`).
- **Fuentes:**
  - Aggarwal et al., «GEO: Generative Engine Optimization»: <https://arxiv.org/pdf/2311.09735>
  - Guía Google (contenido «non-commodity», único, con punto de vista propio;
    prohibido *scaled content abuse*): <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
- **Implementación en ESTE repo:** redacción en `index.html`/FAQ (GEO-02), módulo
  `src/data/faq.ts` compartido, y una **«ficha de datos» visible** con
  `Actualizado: <fecha>` (posiblemente generada en build por `scripts/**` — coordinar).
  `src/utils/seo.ts` puede seguir afinando títulos por pestaña, pero recuerda: eso
  **solo lo ven humanos con JS**.
- **Esfuerzo:** M.

### GEO-08 · Autoridad E-E-A-T y menciones de marca en fuentes citadas por los LLM (P2)

- **Práctica recomendada:** los motores de respuesta se apoyan en lo que **otras
  fuentes dicen de la marca**: Wikipedia/Wikidata, prensa local (El País Cali,
  Santiago Post), directorios oficiales/datos abiertos de la Alcaldía, ONG de
  emergencias, y menciones consistentes «AyudaEnCali» (mismo NAP/nombre/descripción
  en todas partes). Google advierte que **buscar menciones inauténticas no funciona**
  (y es spam); lo que funciona es presencia real en sitios de confianza. Además, desde
  mayo 2026 existen las **Preferred Sources** de Google: el usuario puede fijarse
  `ayudaencali.lat` y aparecer en AI Overviews/AI Mode → pedirlo a la comunidad y
  enlazar instrucciones.
- **Fuentes:**
  - Menciones inauténticas ≠ táctica (guía Google): <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
  - Preferred Sources en AI Overviews/AI Mode (mayo 2026): <https://developers.google.com/search/docs/appearance/preferred-sources> y <https://blog.google/products-and-platforms/products/search/original-high-quality-content-search/>
  - E-E-A-T: <https://developers.google.com/search/docs/fundamentals/creating-helpful-content>
- **Implementación en ESTE repo:**
  - Añadir schema `sameAs` en `index.html` cuando existan perfiles oficiales
    (Wikipedia/Wikidata/Instagram/WhatsApp del proyecto).
  - Página «Quiénes somos / contacto» accesible **sin JS** (hoy no existe como URL:
    todo es modal) — es la landing que citan los LLM al describir la fuente.
  - Fuera del repo (acción humana/consenso): ficha en directorios de datos abiertos
    de Cali, mención en prensa local, posible artículo Wikipedia (revisión de
    notabilidad por humanos, no por agente).
- **Esfuerzo:** L (parte es trabajo de comunidad, no de código).

### GEO-09 · Riesgos y mitigaciones (P2, continuo)

| Riesgo | Concreción en ESTE repo | Mitigación |
|---|---|---|
| **Cloaking accidental** | La SPA sirve el mismo shell vacío a todos (no es cloaking, pero…) | Nunca servir HTML distinto por user-agent; si se prerendera (GEO-02), el mismo HTML para humanos y bots. `404.html` con `noindex` ya es correcto (decisión 2026-09-29). |
| **Alucinaciones sobre datos de emergencias** | El asistente responde con Gemini + fallback local (`server/handlers/chat.ts`, `chatFallback.ts`) | Todo dato publicado con **fecha de actualización + fuente**; JSON-LD `Dataset.dateModified`; FAQ con «esto no sustituye al 123»; en `llms.txt` distinguir explícitamente **datos comunitarios no verificados vs servicios oficiales**; faltaría un disclaimer de frescura junto a los datos en vivo (GE-07). |
| **Contenido IA de baja calidad penalizado** | Tengo capacidad de generar muchas páginas/FAQ con IA | Google: *scaled content abuse* = spam. Publicar solo **FAQ real, curado y con experiencia propia** (las 8 preguntas actuales están bien hechas); sin granjas de landings sintéticas cuando llegue `FEAT-03`. Fuente: <https://developers.google.com/search/docs/essentials/spam-policies#scaled-content> |
| **Dependencia de un solo canal** | Todo el descubrimiento hoy pasa por Google | robots.txt/política multi-motor (GEO-01), sitemap + GSC, y medición por motor (GEO-10) para no descubrir un bloqueo tarde. |
| **Sobre-optimización GEO (hacks)** | — | La guía Google 2026 lista lo inútil: *chunking*, reescrituras solo para IA, menciones inauténticas, obsesión con schema. Evitarlos; enfocarnos en lo verificado aquí. |

### GEO-10 · Métricas GEO: cómo medir citaciones (P1, paralelo a todo lo demás)

- **Práctica recomendada (tres capas):**
  1. **Search Console → informe de rendimiento en features generativas**
     (impresiones/clics de AI Overviews/AI Mode) + inspección de URL + sitemap.
     Es la métrica oficial de Google y evita herramientas «third-party» que prometen
     rankings internos.
  2. **GA4 → canal de tráfico IA:** canal nativo **AI Assistants** (desde
     2026-05-13) + *custom channel group* con regex sobre referrers
     (`chatgpt\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai|edgeservices\.bing\.com`).
     Ojo: gran parte llega como *Direct* (los apps stripan referrer) → emparejar con
     **búsqueda de marca** en GSC y con prueba manual.
  3. **Prueba manual tipo «prompt panel»:** batería de ~10 preguntas en español
     («¿dónde donar agua en Cali?», «centros de acopio en Cali esta semana»,
     «qué hacer en una emergencia en Santiago de Cali», «albergues de mascotas Cali»)
     en ChatGPT (con búsqueda), Gemini, Perplexity, Google AI Mode/AI Overviews y
     Copilot; registrar: ¿citan ayudaencali.lat? ¿qué URL? ¿posición? ¿con la fecha?
     Cada 2 semanas.
  4. **Logs de bots (Vercel):** ¿pasan `OAI-SearchBot`, `PerplexityBot`,
     `Claude-SearchBot`, `Google-Extended`? Valida GEO-01 tras desplegar.
- **Fuentes:**
  - Informe «Generative AI performance» (oficial): <https://support.google.com/webmasters/answer/16984139>
  - Guía Google de IA (usa el informe de GSC; desconfía de herramientas externas): <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
  - Canal AI Assistants de GA4: <https://www.digitalapplied.com/blog/ga4-ai-assistant-channel-2026-measure-ai-traffic-playbook>
  - Seguimiento de citaciones/fuentes: <https://otterly.ai/blog/how-to-track-ai-search-engine-citations-sources/>
  - Medición combinada GSC+GA4+pruebas manuales: <https://mintec.co/blog/medir-visibilidad-busqueda-ia-2026/>
- **Implementación en ESTE repo:** no hay código; sí **checklist operativa**
  (GSC + GA4 + prompt panel). Opcionalmente, más adelante, un script de sondeo de
  citación en `scripts/**` (coordinar con backend).
- **Esfuerzo:** S (setup) + ritmo quincenal.

---

## 3 · Quick wins (top 5, esta semana)

1. **`public/robots.txt`** con la matriz 2026 (bloquear entrenamiento / permitir
   `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`) + `Sitemap:` → **GEO-01**, XS.
2. **JSON-LD estático en `index.html`**: `FAQPage` (las 8 preguntas reales) +
   `WebSite`/`SearchAction` + `Organization` (+ `sameAs` cuando haya redes) → **GEO-03**, S.
3. **`public/llms.txt`** (H1 + blockquote + secciones: FAQ, API pública
   `/api/points`·`/api/needs`, datos abiertos, 123) → **GEO-04**, S.
4. **`public/sitemap.xml`** + dar de alta/verificar en Search Console y enviar el
   sitemap → **GEO-05**, XS.
5. **Baseline GEO antes de tocar nada**: prompt panel (5 motores × 10 preguntas) +
   canal GA4 AI + activar/consultar el informe de IA en GSC → **GEO-10**, S.
   *(Se hace primero para poder comparar; sin baseline no hay impacto demostrable.)*

Siguiente oleada: prerender del shell (**GEO-02**), `Dataset` + docs de API
(**GEO-06**) y contenido con cifras/fechas (**GEO-07**).

---

## 4 · Plan de medición GEO (breve)

| Cadencia | Qué | Dónde | KPI |
|---|---|---|---|
| Continuo | Impresiones/clics en features generativas | Search Console → *Rendimiento en AI features* | Tendencia mensual |
| Continuo | Tráfico referido IA | GA4 → canal *AI Assistants* + custom channel `AI Search` (regex de referrers) | Sesiones/mes, % sobre total |
| Quincenal | Prompt panel (10 preguntas × 5 motores: ChatGPT, Gemini, Perplexity, AI Mode/Overviews, Copilot) | Manual/herramienta de citación | **% de prompts donde citan ayudaencali.lat** (objetivo: ≥30% a 90 días en los 5 motores) y URL citada |
| Quincenal | ¿Responden con datos correctos y con fecha? (anti-alucinación) | Manual | % respuestas con dato correcto + mención 123 correcta |
| Tras cada deploy | Crawl de bots | Logs Vercel | Presencia de `OAI-SearchBot`/`PerplexityBot`/`Claude-SearchBot` |
| Mensual | Validez técnica | Rich Results Test + validador schema; Lighthouse (*agentic browsing* incluye `llms.txt`); robots.txt de GSC | 0 errores |
| Mensual | Señal de marca | GSC → *Consultas de marca* («ayudaencali») | Crecimiento (proxy del dark traffic IA) |

**Regla:** si el prompt panel sube pero el tráfico no, mide atribución oscura
(búsqueda de marca + UTM en enlaces que pongamos en directorios).

---

## 5 · Los 10 hallazgos/acciones más importantes (ordenados por impacto)

| # | Hallazgo | Prioridad | Impacto GEO | Esfuerzo | Fichero concreto |
|---|---|---|---|---|---|
| 1 | **GEO-10 · Baseline y medición** (prompt panel 5 motores + GSC *AI features* + canal GA4 IA): sin esto no se demuestra nada y se pierde el «antes» | P1 | Muy alto (habilita todo lo demás) | S | (operativo, sin código) |
| 2 | **GEO-01 · `robots.txt`** política bloquear-entrenamiento / permitir-citación | P1 | Muy alto (de nada sirve el contenido si el crawler de respuesta está sin decidir; hoy ni siquiera hay fichero) | XS | `public/robots.txt` |
| 3 | **GEO-02 · Hacer visible el contenido sin JS** (shell prerenderado + sección estática de FAQ/datos) | P1 | Muy alto (hoy los LLM ven una página casi vacía) | S→M | `index.html` (+ build `vercel.json` para prerender) |
| 4 | **GEO-03 · JSON-LD `FAQPage` + `WebSite`/`SearchAction` + `Organization`** | P1 | Alto (lo único estructurado que todos los crawlers leen) | S | `index.html` (+ `src/data/faq.ts` compartido) |
| 5 | **GEO-04 · `llms.txt`** curado (FAQ + API + datos + 123) | P1 | Alto en ChatGPT/Gemini/agentes (Google lo ignora; Lighthouse lo audita) | S | `public/llms.txt` |
| 6 | **GEO-05 · `sitemap.xml` + alta en Search Console** | P1 | Alto (requisito de base para AI Overviews/AI Mode) | XS | `public/sitemap.xml` |
| 7 | **GEO-06 · Datos abiertos como fuente primaria**: `Dataset` JSON-LD + docs de los GET públicos + futuro `/api/v1` (FEAT-06) | P2 | Alto y duradero (citación de datos que solo nosotros servimos) | M | `index.html`; `server/**` (coordinar con backend) |
| 8 | **GEO-07 · Contenido citable**: respuestas upfront, tablas, cifras **con fuente y fecha**, política anti-alucinación del asistente | P2 | Alto (+40% visibilidad según estudio GEO de Princeton) | M | `index.html`, `src/data/faq.ts`, FAQ |
| 9 | **GEO-08 · Autoridad E-E-A-T**: presencia en fuentes citadas (Wikidata/prensa local/directorios oficiales), `sameAs`, Preferred Sources, contacto sin JS | P2 | Alto a medio plazo (fuera del repo en parte) | L | `index.html`; acciones de comunidad |
| 10 | **GEO-09 · Riesgos**: frescura y fuentes de los datos de emergencias, sin contenido IA masivo, sin cloaking por user-agent | P2 | Protector (evita penalización/alucinación) | continuo | `index.html`, docs, `server/handlers/chat.ts` (coordinar) |

---

## 6 · Fuentes consultadas (todas 2026, verificadas)

**Oficiales**
- Google — *Optimizing your website for generative AI features on Search* (act. 2026-07-10): <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
- Google — informe *Generative AI performance* en Search Console: <https://support.google.com/webmasters/answer/16984139>
- Google — visibilidad en features generativas: <https://support.google.com/webmasters/answer/16908024>
- Google — *Preferred Sources*: <https://developers.google.com/search/docs/appearance/preferred-sources> · anuncio (2026-05-27): <https://blog.google/products-and-platforms/products/search/original-high-quality-content-search/>
- Google — structured data, `Dataset`, `Local business`, JS SEO, sitemaps, spam policies (mismos dominios `developers.google.com/search/docs/...`)
- web.dev — *Build agent-friendly websites* (act. 2026-04-01): <https://web.dev/articles/ai-agent-site-ux>
- Spec `llms.txt` v2 (act. 2026-08-10): <https://llmstxt.org/>

**Investigación / análisis**
- Aggarwal et al., *GEO: Generative Engine Optimization* (Princeton, ACM KDD 2024): <https://arxiv.org/pdf/2311.09735>
- Digital Applied — matriz de control de crawlers IA 2026 (con referencias a docs de OpenAI/Anthropic/Cloudflare): <https://www.digitalapplied.com/blog/ai-crawler-access-control-2026-robots-llms-txt-decision-matrix>
- Digital Applied — canal *AI Assistants* de GA4: <https://www.digitalapplied.com/blog/ga4-ai-assistant-channel-2026-measure-ai-traffic-playbook>
- Anagram — crawlers IA y permisos en robots.txt: <https://www.anagram.ai/blog/ai-crawlers-explained-gptbot-claudebot-perplexitybot-and-how-to-let-them-in-2026>
- Otterly — seguimiento de citaciones: <https://otterly.ai/blog/how-to-track-ai-search-engine-citations-sources/>
- Mintec — medición de visibilidad IA (GSC+GA4+manual): <https://mintec.co/blog/medir-visibilidad-busqueda-ia-2026/>
- Search Engine Journal — postura de Google vs Lighthouse ante `llms.txt`: <https://www.searchenginejournal.com/googles-llms-txt-guidance-depends-on-which-product-you-ask/575431/>
- Matiz retiro de rich results FAQ (mayo/junio 2026): <https://webserv.io/resources/blog/faq-schema-after-march-2026-core-update-behavioral-health/>
- Consenso «los crawlers de IA no renderizan JS» (fuentes secundarias): <https://hamzashabbir.dev/article/ai-crawlers-javascript-rendering-nextjs-spa-invisible-2026>, <https://www.asklantern.com/blogs/ai-crawlers-do-not-render-javascript>, <https://needle.sh/blog/javascript-invisible-to-ai-spa-problem/>

**Verificado en producción/repo el 2026-10-02:** `robots.txt` → 404,
`sitemap.xml` → 404, `llms.txt` → 404, JSON-LD → 0 resultados, `POST /api/chat`
solo POST (`server/handlers/chat.ts:189`), `GET /api/points` público
(`server/handlers/points.ts:250`), SPA sin prerender (`index.html` → `<div id="root">`).

---

*No se ha tocado ningún fichero de código ni otros documentos. Acciones fuera de mi
área (server/**, decisiones.md, trabajo con prensa/directorios) quedan anotadas para
coordinación con los demás agentes.*
