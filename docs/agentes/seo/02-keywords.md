# 02 · KEYWORDS y mercado — investigación SEO de AyudaEnCali

> **Agente:** SEO Mercado/Keywords · **Modo:** investigación (solo lectura; este es mi
> único fichero de escritura) · **Fecha:** 2026-10-02
>
> Objetivo: identificar **qué busca la gente en español (Cali/Colombia)** cuando necesita
> ayuda, emergencias o quiere donar, y **quién gana esas búsquedas hoy**, para decidir dónde
> encaja cada keyword en la app (`mapa`/`tablón`/`FAQ`/`chat`/landings futuras).

---

## 0 · Metodología y limitaciones

| Aspecto | Cómo se hizo |
|---|---|
| Búsqueda de SERPs | `websearch` devolvió «No search results found» de forma sostenida (rate-limit/caído). **Workaround:** `webfetch` contra `https://duckduckgo.com/html/?q=…` como proxy de SERP (funciona y devuelve los 10 resultados con título/dominio/snippet). |
| Estado de producción | Verificación con `curl` (solo lectura) de `https://ayudaencali.lat/` (200), `robots.txt` y `sitemap.xml` (404 → página 404 del SPA con `noindex`). |
| Dificultad | **Estimada, no hay herramienta de volumen/KD** (no hay acceso a Ahrefs/Semrush/GSC). Se estima por: (1) quién rankea hoy y su autoridad percibida (medios nacionales > medios locales > directores nuevos), (2) si el contenido es datado/efímero, (3) si hay URL dedicada a la query exacta. Escala: **Baja** = competidores débiles o ausentes · **Media** = competencia local/directorios · **Alta** = medios nacionales, gob o content generico. |
| Volumen | No estimado con dato; se sustituye por **señal de demanda**: aparición en SERP, noticias repetidas, existencia de decenas de competidores nuevos en 8 semanas, hashtags activos en redes. |
| Verificación de SERPs | 12 consultas DDG-html (ver §9). Los resultados son un **proxy de Google**, no idénticos. |

---

## 1 · Contexto de mercado (por qué ahora)

- **Terremoto 7,4 del 10-ago-2026** (epicentro San José del Palmar, Chocó), ~154 fallecidos,
  daños y colapsos estructurales en Cali → **pico masivo y sostenido de búsquedas** de
  *albergues, centros de acopio, donaciones, líneas de emergencia, mascotas afectadas*.
- La SERP de «albergues Cali» está hoy dominada por: `mapadelterremoto.com`,
  `colombiaselevanta.co/ayuda/cali` (**88 puntos**), `ayudaterremotocolombia.com`,
  `90minutos.co`, `elpais.com.co`, `cali.gov.co`, `RCN`, `Demócrata` (España) →
  **demanda real + competencia principalmente efímera (medios) y programática (3-4 directorios fuertes)**.
- **El repositorio de la Alcaldía sobre el terremoto acumuló ~76 k visitas** (dato de la
  auditoría previa) → el tráfico «crisis» es real pero se evapora al cerrar la emergencia.
- **Temporada de lluvias ~nov–abr** (picos verificados: 19-feb-2026 microrráfaga e
  inundaciones en varios barrios; Alcaldía activó el Consejo Distrital de Gestión del Riesgo
  en feb-2026) → **segunda estacionalidad** que nadie cubre con contenido permanente.
- **Hoy (02-oct-2026):** `site:ayudaencali.lat` en DDG → **0 resultados**. No somos
  candidatos a rankear ninguna de estas keywords hasta resolver indexación (ver §7 QW-01).

---

## 2 · Clusters temáticos (keywords semilla)

| # | Cluster | Semillas representativas | Demanda |
|---|---|---|---|
| A | Acopio y donación | centros de acopio en Cali · puntos de acopio cerca de mí · dónde donar en Cali · qué donar al terremoto | Muy alta (post-sismo) / estacional |
| B | Albergues y hospedaje | albergues en Cali · albergues por terremoto Cali · dónde dormir si hay terremoto · qué llevar a un albergue | Alta (post-sismo) |
| C | Líneas y números de emergencia | números de emergencia Cali · líneas de emergencia Colombia · 123 119 132 144 · línea Emcali | Alta y evergreen |
| D | Prevención / «qué hacer» | qué hacer durante un terremoto · qué hacer antes de un sismo · kit de emergencia | Alta evergreen (picos post-evento) |
| E | Mascotas y veterinarias | veterinaria 24 horas Cali · urgencias veterinarias Cali · albergue mascotas terremoto · dónde dejar mi perro | Media-alta, comercial |
| F | Salud cercana | centro de salud más cercano Cali · hospital de urgencias Cali · IPS cerca de mí | Media |
| G | Lluvias e inundaciones (estacional) | inundaciones Cali · barrios afectados por lluvias Cali · zonas de riesgo Cali · deslizamientos Cali | Media (nov–abr) |
| H | Long-tail barrio/comuna | acopio en Siloé · albergue Terrón Colorado · veterinaria Granada Cali · inundación Comuna 13 | Baja por keyword, **suma enorme** |
| I | Voluntariado y donación especial | donar sangre en Cali · donar ropa Cali · voluntariado Cali terremoto | Media, picos |
| J | Marca | ayudaencali · ayuda en Cali · #ayudaencali | Baja pero **SERP en disputa** |

---

## 3 · Tabla maestra de keywords

Leyenda **Intención:** IN = informacional · Navegacional · Local/Geo · Transaccional/Comercial.
**Prioridad:** P1 = atacar ya (quick win o estratégico) · P2 = siguiente ola · P3 = exploratorio.
**Dónde encaja:** vista actual o landing futura (ver §5).

| Keyword | Intención | Dificultad est. | Pri. | Dónde encaja en la app |
|---|---|---|---|---|
| centros de acopio en Cali | Local/Geo | Media (directores + medios, pero datados) | **P1** | Mapa (vista `map`) + landing `/acopio-cali` |
| puntos de acopio cerca de mí | Local + GBP | Media-alta (paquete local/GMB) | **P1** | Mapa con GPS + **Google Business Profile** |
| albergues en Cali (terremoto) | Local/Geo | Media | **P1** | Mapa (filtro albergue) + landing `/albergues-cali` |
| dónde donar en Cali | Local/Transaccional | Media | **P1** | Landing `/donar` + tablón |
| números de emergencia en Cali | Informacional | Alta (Pulzo, Q'hubo, Alcaldía, 90minutos) pero contenido débil | **P1** | FAQ + landing `/emergencias-cali` (datos de `initialData.ts`) |
| líneas de emergencia Colombia (123, 119, 132, 144) | Informacional | Alta (medios, gob) | **P1** | FAQ + landing `/emergencias-cali` |
| qué hacer durante un terremoto | Informacional evergreen | Alta (la cruz, Wikipedia, 119) — picos lo permiten | **P1** | FAQ/indexada + chat (asistente) |
| puntos de acopio / albergues en **\<barrio\>** (Siloé, Terrón Colorado…) | Local/Geo long-tail | **Baja** (nadie tiene URL por barrio) | **P1** | Landings `/barrio/<barrio>` (FEAT-03) |
| inundaciones en Cali / barrios afectados por lluvias | Local, estacional | Media-baja (medios locales) | **P2** | Landing estacional `/lluvias-cali` + mapa |
| veterinaria 24 horas en Cali | Comercial local | Media-alta (servivet, athenea, petspets, coolvet, colombia.com.co) | **P2** | Mapa (filtro veterinaria) + landing `/veterinarias-24-horas-cali` |
| urgencias veterinarias Cali a domicilio | Comercial local | Media-alta (vetsgo, directorios) | **P2** | Landing veterinarias |
| donar ropa en Cali | Local/Transaccional | Media-baja (medios datados) | **P2** | Landing `/donar` + tablón |
| donar sangre en Cali | Local/Transaccional | Media (Cruz Roja, medios) | **P2** | Landing `/donar` |
| qué llevar a un albergue | Informacional | **Baja** (PAA, poca URL dedicada) | **P2** | FAQ indexada |
| centro de salud más cercano Cali | Local | Media (directorios IPS: centrosdesalud.com.co, clinicasyhospitales) | **P2** | Mapa (filtro salud) + landing `/salud-cali` |
| temblor en Cali hoy / sismo Cali qué pasó | Noticioso, picos | Alta (medios) — solo capturable con contenido vivo | **P2** | Chat + landing `/sismo` (actualizada) |
| zonas de riesgo Cali por comuna | Informacional/Geo | Media-baja (Alcaldía PDFs, Scribd) | **P2** | Landings `/barrio/<barrio>` (bloque «riesgo») |
| albergue de mascotas / dónde dejar mi perro en una emergencia | Informacional | **Baja** (solo 2 artículos de prensa puntuales) | **P2** | Mapa (veterinaria/albergue) + FAQ |
| voluntariado en Cali terremoto / cómo ser voluntario | Transaccional | Media-baja | **P3** | Tablón + perfil (rol voluntario) |
| kit de emergencia qué llevar | Informacional | Alta (contenido genérico) | **P3** | FAQ + chat |
| desaparecidos Cali terremoto / reportar persona | Informacional, crisis | Media (competidores lo listan, nadie lo hace bien) | **P3** | Tablón (categoría futura) + chat |
| ayuda en Cali / ayudaencali (marca) | Navegacional | **Baja en SEO, SERP disputada en redes** | **P1** | Home `/` + GBP + redes + Wikidata |
| centros de vacunación Cali | Comercial local | Media (vacun.org) | **P3** | Mapa (salud) futuras categorías |
| dónde cobrar el Sisbén/Tránsito… (Trámites) | Transaccional | Alta, **fuera de alcance** | descartado | — |

---

## 4 · Long-tail por barrio y comuna

**Activo actual:** `src/data/caliLocations.ts` → **21 barrios** con `comuna` y coordenadas:
San Antonio, Granada, San Fernando, Tequendama, El Peñón, Versalles, Santa Mónica,
Chipichape, Menga, Ciudad Jardín, Valle del Lili, Meléndez, Siloé, Terrón Colorado,
El Vallado, Mariano Ramos, Salomia, Alfonso López, San Bosco, La Flora, Pance.
Cali tiene **22 comunas** → combinando barrio × categoría × comuna se superan holgadamente
**32+ términos geográficos** con URL propia.

**Plantillas de keyword (una URL por combinación):**

| Plantilla | Ejemplo | Intención | Dif. est. | Prioridad |
|---|---|---|---|---|
| puntos de acopio en \<barrio\> | puntos de acopio en Siloé Cali | Local | Baja | P1 |
| albergue en \<barrio\> | albergue en Terrón Colorado | Local | Baja | P1 |
| veterinaria 24 horas \<barrio\> | veterinaria 24 horas Granada Cali | Comercial | Baja | P1 |
| centro de salud cerca de \<barrio\> | centro de salud cerca de San Fernando | Local | Baja | P2 |
| inundación/desborde \<barrio\> | inundaciones en El Vallado Cali | Local estacional | Baja | P2 |
| zona de riesgo \<barrio\> / comuna N | zonas de riesgo Comuna 13 Cali | Informacional | Baja | P2 |
| donar ropa en \<barrio\> | donar ropa en Chipichape | Local | Baja | P2 |
| \<barrio\> + terremoto: daños | daños por terremoto en Alfonso López | Noticioso/local | Baja (caduca) | P3 |

**Priorización interna del long-tail** (por urgencia/social + volumen de población):
1. **Ladera/alta amenaza sísmica:** Terrón Colorado, Siloé, El Peñón, Mariano Ramos, Meléndez.
2. **Inundación/avenidas:** El Vallado, Salomia, La Flora (dorsales), San Antonio (río).
3. **Alta densidad/comercial:** Granada, San Fernando, Chipichape, San Antonio, Versalles.
4. **Periferia desatendida:** Pance, Ciudad Jardín, Valle del Lili, Menga, Santa Mónica.

> Ningún competidor de la SERP tiene URL por barrio (todos son «Cali» ciudad-entera):
> **esta es la vía de entrada con menor dificultad de toda la investigación.**

---

## 5 · Estacionalidad

| Ventana | Evento / señal | Keywords en alza | Acción de contenido |
|---|---|---|---|
| **Todo el año** | Sismo impredecible en Cali | qué hacer durante un terremoto · números de emergencia · kit de emergencia | Evergreen indexada + JSON-LD FAQ (publicar ya) |
| **Nov–Abr (lluvias)** | Microrráfagas, inundaciones, árboles caídos (verificado 19-feb-2026) | inundaciones Cali · barrios afectados lluvias · zonas de riesgo · deslizamientos | Landing `/lluvias-cali` + bloques por barrio, **listas antes de octubre** |
| **Post-sismo (pico ya ocurrido: ago-2026, volverá)** | Cualquier nuevo sismo/replique | albergues · centros de acopio · dónde donar · donar ropa · desaparecidos | Mapa + landings siempre «actualizado hace X» visibles (confianza) |
| **Feb–Abr** | Temporada de lluvias + Semana Santa (viajes) | mascotas: veterinarias 24h, quién cuida mi perro | Landing veterinarias + FAQ mascotas |
| **Picos de donación** | Campañas de fin de año, tragedias locales | donar sangre · donar ropa · voluntariado | Landing `/donar` (contenido estable, no datado) |
| **Marca** | Crisis → redes | #ayudaencali, «ayuda en Cali» | SERP de marca: home + GBP + perfiles sociales verificados |

**Regla de oro:** los competidores publican **contenido datado** (URLs con fecha:
`…-11-08-2026/`, «actualizado hace 3 h»). Nuestra ventaja es contenido **vivo y permanente**
con sello «actualizado el …» → rankea en todas las temporadas, no solo la semana del desastre.

---

## 6 · Preguntas reales (FAQ / PAA) detectadas en las SERPs

Todas son candidatas a **FAQ indexada con `FAQPage` JSON-LD** (hoy `FAQ_ITEMS` vive en un
modal de React → invisible para Google; enlazada desde `404.html` con `#preguntas-frecuentes`).

| Pregunta (real, verificada en SERP/PAA) | Keyword objetivo | ¿Dónde encaja? |
|---|---|---|
| ¿Qué llevar a un albergue? / qué necesitan los albergues | qué llevar a un albergue | FAQ indexada + tablón (necesidades) |
| ¿Dónde donar en Cali? | dónde donar en Cali | Landing `/donar` + FAQ |
| ¿Qué números de emergencia debo guardar? (123, 119, 132, 144, 125, 127, 177) | números de emergencia Cali | Landing `/emergencias-cali` + FAQ |
| ¿Qué hacer durante y después de un terremoto? | qué hacer durante un terremoto | FAQ indexada + chat |
| ¿Dónde está el centro de atención más cercano? | centro de salud más cercano Cali | Mapa (geolocalización) + landing salud |
| ¿Qué hago con mi mascota en una emergencia? / dónde llevarla? | albergue mascotas Cali | FAQ + mapa (veterinarias) |
| ¿Qué NO llevar a un punto de acopio? | qué donar / qué no donar | Landing `/donar` (snippets de ayudacolombia.org lo usan ya) |
| ¿Los albergues siguen abiertos? (dudas de estado) | albergues Cali ahora | Mapa con estado/fecha de actualización |
| ¿Dónde reportar una persona desaparecida tras el sismo? | desaparecidos Cali | Tablón (categoría futura) |
| ¿Dónde queda la línea de zoonosis de Cali? (441 1525) | línea zoonosis Cali | FAQ + mapa veterinarias |
| ¿Cuánto duró el sismo / hubo réplicas? | terremoto Cali 10 de agosto | Chat + contenido «qué pasó» |
| ¿Dónde hay agua potable/puntos de agua cerca? | punto de agua Cali | Mapa (categoría) |

---

## 7 · Top 10 quick wins (keyword → URL/vista que la capturaría)

| # | Quick win | Keyword(s) que captura | URL / vista | Esfuerzo |
|---|---|---|---|---|
| QW-01 | **Salir de 0 en indexación:** `public/robots.txt` + `public/sitemap.xml` con `https://ayudaencali.lat/`, alta en Search Console, solicitud de indexación de `/` | (habilitador de todas) | `/robots.txt`, `/sitemap.xml`, GSC | XS |
| QW-02 | Reescribir title/description de la vista mapa con las head terms exactas: «Centros de acopio y albergues en Cali» | centros de acopio en Cali · albergues en Cali | vista `map` en `src/utils/seo.ts` | XS |
| QW-03 | **FAQ pública indexable en HTML** (desde `FAQ_ITEMS` + nuevas preguntas de emergencias) con `FAQPage` JSON-LD | números de emergencia · qué hacer durante un terremoto · qué llevar a un albergue | `/#preguntas-frecuentes` (ya enlazada en `404.html`) | S |
| QW-04 | **Landing «Números y líneas de emergencia en Cali»** con los datos de `initialData.ts` (123, 119, 132, 144, 125, 127, Emcali 177, Zoonosis 441 1525) | números de emergencia Cali · líneas de emergencia Colombia | `/emergencias-cali` | S |
| QW-05 | **Landing evergreen «Qué hacer durante un terremoto»** (checklist + kit, actualizada con el sismo del 10-ago-2026) | qué hacer durante un terremoto · kit de emergencia | `/terremoto-cali` | S |
| QW-06 | **Primer lote de landings por barrio (FEAT-03):** Siloé, Terrón Colorado, Granada, San Antonio, El Vallado | puntos de acopio en \<barrio\> · albergue en \<barrio\> · inundaciones \<barrio\> | `/barrio/siloé` … (5-8 URLs) | M |
| QW-07 | **Landing «Veterinarias 24 horas en Cali»** alimentada por los puntos del mapa + Centro de Bienestar Animal (notas El Tiempo/90minutos) | veterinaria 24 horas Cali · urgencias veterinarias · albergue mascotas | `/veterinarias-24-horas-cali` | S |
| QW-08 | **Landing «Dónde donar en Cali»** (acopio, ropa, sangre, enlaces a canales oficiales + «qué NO llevar») | dónde donar en Cali · donar ropa · donar sangre | `/donar-en-cali` | S |
| QW-09 | **Google Business Profile** (categoría ONG/emergencias, sitio = ayudaencali.lat, horario 24/7, fotos del mapa) + citas locales | puntos de acopio cerca de mí · ayuda en Cali | GBP (off-site) | S |
| QW-10 | **Sello «actualizado el …» + `dateModified`** en mapas/landings y `ItemList` JSON-LD de los puntos (API pública `/api/points`) | albergues Cali ahora · centros de acopio «cerca» | vista `map` + landings | S |

---

## 8 · Mapa de contenidos: keyword → vista/página

| Vista / página (estado) | URL real | Keywords cluster | Notas SEO |
|---|---|---|---|
| Home + vista **Mapa** (existe) | `/` (SPA, meta en cliente) | centros de acopio en Cali · albergues · veterinarias · salud · cerca de mí | Única URL indexable hoy; title = «Mapa de ayuda y emergencias en Cali» → **reoptimizar (QW-02)** |
| Vista **Tablón** «blog» (existe, meta en cliente) | `/` (misma URL) | necesidades urgentes · donar insumos · voluntariado | Sin URL propia: solo rankea vía title en cliente → **necesita enrutador/landings** |
| Vista **Chat** (existe) | `/` (misma URL) | preguntas conversacionales («qué hago si…») | Contenido no indexable (POST); su SEO está en las **respuestas llevadas a FAQ/landings** |
| Vista **Perfil** (existe) | `/` | cuenta comunitaria | No es keyword-objeto (noindexable razonable) |
| **FAQ indexada** (futuro) | `/#preguntas-frecuentes` | cluster D + PAA §6 | Prioridad máxima (QW-03) |
| **Landing emergencias** (futuro) | `/emergencias-cali` | cluster C | QW-04 |
| **Landing terremoto** (futuro) | `/terremoto-cali` | cluster D + «qué pasó» | QW-05 |
| **Landings por barrio** (FEAT-03) | `/barrio/<barrio>` | cluster H (§4) | QW-06 — **núcleo de la estrategia** |
| **Landing veterinarias** (futuro) | `/veterinarias-24-horas-cali` | cluster E | QW-07 |
| **Landing donar** (futuro) | `/donar-en-cali` | clusters A/I | QW-08 |
| **Landing lluvias** (estacional) | `/lluvias-cali` | cluster G | Publicar antes de noviembre |
| **Landing salud** (futuro) | `/salud-cali` | cluster F | Mapa filtro salud |
| **Blog editorial** (futuro, si el tablón lo permite) | `/guias/*` | long-tail informacional | Solo si hay SSR/prerender |

---

## 9 · Competencia y huecos

### 9.1 Competidores directos (directorios de emergencia)

| Competidor | Qué hace | Puntos fuertes (vistos en snippet) | Debilidades detectadas |
|---|---|---|---|
| `colombiaselevanta.co/ayuda/cali` | 88 puntos por categoría (6 albergues, 64 acopios…) | Desglose por tipo, «qué necesita cada uno» | Solo sismo ago-2026, ciudad-entera |
| `mapadelterremoto.com/albergues/cali` (+ `/albergues`, 595 pts/128 municipios) | Programático, «actualizado hace 3 h» | Escala + frescura + URL por ciudad | Respuestas datadas; sin barrios; sin servicios (mapa/tablón/chat) |
| `ayudacolombia.org/acopios/cali` | 4 puntos, «verificado por voluntarios», **«qué NO llevar»** | Confianza y microcontenido útil | Poquísimos puntos; solo acopio |
| `unacopio.co/acopio/cali` + `/mapa` | Directorio verificado «por teléfono» | Verificación, «mirá qué necesitan antes de salir» | Cobertura incompleta |
| `colombiaenpie.com` | Punto principal + enlaces Google Maps/Waze + «actualizar estado» | Estado en vivo, CTA de navegación | Una sola ciudad/tracked a crisis |
| `apoyacolombia.com` | Acopio + voluntarios + **reportar desaparecidos** | Función de desaparecidos (nadie más) | Landing genérica, poco local |
| `ayudacolombia.co/puntos.php?ciudad=cali`, `acopiove.org`, `ayudaterremotocolombia.com/recursos/cali`, `caliresponde.com`, `unidosporcali.info`, `terremotocali.com`, `ayudacali.org`, `dondeayudar.org`, `redsolidariacolombia.com`, `calisolidario.triadaaliados.com`, `recursos-psi.vercel.app/mapa` | Derivados del mismo evento | Muy nicho | **Decenas de dominios jóvenes que morirán al cerrarse la crisis**; quality variable |
| Vets: `servivet.co`, `vetsgo.com.co`, `atheneaveterinaria.com/veterinaria-en-cali-24-horas/`, `petspets.co`, `coolvet.com.co/valle-del-cauca/cali/`, `colombia.com.co/urgencias-veterinarias-cali/` | Urgencias 24h y directorios | Páginas dedicadas con la keyword en la URL | Son **comerciales**: no cubren emergencia civil ni mascotas en desastre |

### 9.2 Competidores indirectos (autoridad alta)

- **Medios:** `90minutos.co`, `occidente.co`, `pulzo.com`, `elpais.com.co`, `eltiempo.com`,
  `rcnradio.com`, `semana.com`, `cablenoticias.com`, `elcolombiano.com` → ganan por autoridad
  pero con **URLs fechadas que caducan** (ej. `…/puntos-acopio-albergues-temporales-cali-11-08-2026/`).
- **Oficial:** `cali.gov.co` (boletines, Mapas de Riesgo, líneas de emergencia, galería de
  números) → autoridad máxima, UX y frescura bajas.
- **Enciclopedia/vertical:** Wikipedia/Wikidata (datos duros de Cali), `centrosdesalud.com.co`,
  `clinicasyhospitales.com.co`, `vacun.org`, `sucursales.net`, `publipet.com`.

### 9.3 Los 5 huecos de competencia más claros

| # | Hueco | Evidencia | Nuestra jugada |
|---|---|---|---|
| **H1** | **Contenido eterno vs contenido caducado.** Todos los rivales del clúster A/B son reactivos al sismo del 10-ago-2026 (URLs con fecha, «actualizado hace 3 h»). Nadie cubre la emergencia **el resto del año** ni la temporada de lluvias (nov–abr). | SERPs de acopio/albergues: solo 2-3 actores con fecha en URL; SERP de inundaciones: solo medios locales puntuales (feb-2026) | Páginas **vivas** con sello «actualizado el …», que envejecen bien y capturan las dos estacionalidades |
| **H2** | **Sin cobertura por barrio/comuna.** Todos compiten por «Cali» ciudad-entera; ninguno tiene URL por barrio. | `colombiaselevanta.co/ayuda/cali`, `mapadelterremoto.com/albergues/cali`, `unacopio.co/acopio/cali` → ninguna URL de barrio en toda la SERP | **21+ landings `/barrio/<barrio>`** (FEAT-03) con long-tail de §4: keywords con dificultad **baja** y cero competencia directa |
| **H3** | **Listas estáticas vs experiencia de utilidad.** Los rivales son tablas/directorios: sin mapa vivo, sin tablón de necesidades, sin «a quién llamar + qué llevar + dónde ir» integrado, sin asistente. | Todos los snippets rivales describen «lista con dirección y horario»; nadie ofrece servicios interactivos | Nuestro triángulo **mapa + tablón + asistente/FAQ** (y `/api/points` público) como propuesta única; es además el material citable para IA (ver `03-geo-ia.md`) |
| **H4** | **Mascotas en emergencias: nicho sin hub.** Solo 2 artículos de prensa puntuales (El Tiempo 3580226, 90minutos 11-08-2026) y comerciales de veterinarias; nadie tiene una página permanente «qué hago con mi perro/gato si hay sismo / dónde dejarlo». | SERP «albergue mascotas terremoto Cali» = prensa datada + fundaciones; SERP «veterinaria 24h» = directorios comerciales | Landing híbrida **emergencia + mascotas** (Centro de Bienestar Animal, zoonosis, vets 24h) → dificultad baja-nichoy marca diferencial |
| **H5** | **Carrera de entidad off-site abierta.** Los competidores son dominios jóvenes **sin** presencia consolidada en Google Business Profile, Wikipedia/Wikidata, Reddit ni prensa que los cite; nosotros tampoco (0 indexados). La SERP de marca «ayudaencali» ya está **ocupada por hashtags de X/TikTok/IG**. | `site:ayudaencali.lat` → 0; SERP «"ayudaencali"» → solo redes; ningún directorio del §9.1 aparece en prensa | **Ronda off-site**: GBP (P1), Wikidata con `official website`, respuestas útiles en Reddit/hilos de Cali, nota de prensa en medios locales (90minutos/Occidente/Pulzo) → por primera vez la entidad «AyudaEnCali» existirá para Google |

*(Hueco adicional de refuerzo: **FAQ con `FAQPage` + respuestas citables en español** —
los rivales no tienen bloque de preguntas indexable; conecta con el trabajo de `03-geo-ia.md`.)*

---

## 10 · Fuentes consultadas

**SERPs (DuckDuckGo HTML, 12 consultas, 2026-10-02):**

- `albergues Cali terremoto 2026 dónde estar` → mapadelterremoto.com/albergues/cali · colombiaselevanta.co/ayuda/cali · 90minutos.co/cali/puntos-acopio-albergues-temporales-cali-11-08-2026/ · elpais.com.co (albergues→hoteles) · cali.gov.co/boletines/publicaciones/193628 y /193851 · newsroom.rcnradio.com · ayudaterremotocolombia.com/recursos/cali · democrata.es
- `veterinaria 24 horas Cali urgencia mascota` → servivet.co · vetsgo.com.co · atheneaveterinaria.com/veterinaria-en-cali-24-horas/ · petspets.co · coolvet.com.co/valle-del-cauca/cali/ · colombia.com.co/urgencias-veterinarias-cali(-guia)/ · sucursales.net · publipet.com/dir/dogspital-cali/
- `línea de emergencias Cali números utiles 123 125` → pulzo.com/nacion/numeros-de-emergencia-en-cali… · qhubocali.com/lineas-de-emergencia/ (123, 177, 119, 165, 132, 147, 144, 127, 116, 164, zoonosis 4411524) · 90minutos.co/cali/lineas-de-emergencia-cali-10-08-2026/ · cali.gov.co/galeria/16514 y /gestiondelriesgo/publicaciones/140522 · ayudacolombia.co/lineas.php · emergencias-colombia.com/emergencias/
- `dónde donar ropa en Cali puntos de acopio` → occidente.co/cali/centros-de-acopio-en-cali… · ayudacolombia.org/acopios/cali/ · cambiocolombia.com · acopiove.org/centros/colombia/cali · ayudacolombia.co/puntos.php?ciudad=cali · lafm.com.co · valoraanalitik.com · tiktok.com/@pipeferrin27 (Chiminangos 2)
- `inundaciones Cali barrios riesgo lluvias 2026` → cali.gov.co/documentos/2268/mapas-de-riesgo/ · cali.gov.co/boletines/publicaciones/191299 (temporada de lluvias 2026) · occidente.co (microrráfaga) · cwmas.com.co (19-feb-2026) · caliescribe.com/2026/02/20/… · repository.unad.edu.co (zonas de riesgo inundación)
- `"ayudaencali"` → x.com/hashtag/ayudaencali · facebook.com/… · instagram.com/p/Db5jGDfPFzk/ · tiktok.com/@phes444 (marca disputada en redes)
- `albergue mascotas terremoto Cali donde dejar mi perro` → eltiempo.com/colombia/cali/huellas-de-resiliencia…3580226 · caracol.com.co/2026/08/11/donde-reportar-refugiar-y-donar… · 90minutos.co/colombia/animales-afectados…11-08-2026/ · cablenoticias.com (Centro de Bienestar Animal) · semana.com/4patas/…
- `centro de salud más cercano Cali dirección` → clinicasyhospitales.com.co/ips/… · info-hospitales.epsenlinea.com.co · centrosdesalud.com.co/comuna/cali/ · co.establecimientosdesalud.info · vacun.org/centros-vacunacion-cali
- `puntos de acopio cerca de mí Cali` → ayudacolombia.org/acopios/cali/ · colombiaselevanta.co/ayuda/cali · unacopio.co/acopio/cali y /mapa · colombiaenpie.com · apoyacolombia.com
- `reddit Colombia terremoto Cali ayuda dónde donar` → colombia.com/actualidad/… · cambiocolombia.com · cablenoticias.com · elcolombiano.com · 90minutos.co/cali/canales-habilitados-donar… · impactamag.com · matubyte.com (sin resultados de Reddit → **hueco Reddit por verificar**)
- Búsquedas anteriores de la sesión: puntos de acopio/albergues Cali, terremoto 10-ago-2026, donaciones ropa/sangre, «qué hacer sismo» PAA, «qué llevar a un albergue» PAA, long-tail barrio.

**Producción y repo (solo lectura):**

- `curl -sI https://ayudaencali.lat/` → 200 · title «AyudaEnCali — Red de ayuda y emergencias de Cali» · `robots: index,follow` · canonical OK.
- `curl -sL https://ayudaencali.lat/robots.txt` y `/sitemap.xml` → **404 (página del SPA con `noindex,follow`)**.
- `src/utils/seo.ts` (PAGE_META map/blog/chat/profile) · `src/components/FaqModal.tsx` (`FAQ_ITEMS`, 8 preguntas, en modal) · `src/App.tsx:53` (`#preguntas-frecuentes` desde 404) · `src/data/caliLocations.ts` (21 barrios + comuna) · `src/data/initialData.ts` (líneas 123/132/119/144/125, zoonosis) · `docs/agentes/tareas-semana-2.md` (FEAT-03 `/barrio/<barrio>`) · `docs/agentes/auditoria-semana-2.md` · `docs/agentes/seo/03-geo-ia.md` (informe hermano GEO).
