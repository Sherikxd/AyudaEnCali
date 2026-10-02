# Log — backend (2026-10-02)

## En qué trabajé

- **T39 · API sin indexar (`X-Robots-Tag`)** — plan SEO
  (`docs/agentes/seo/plan-seo.md` §2, hallazgo **SEO-15** de
  `docs/agentes/seo/01-tecnico.md`).
- Área propia tocada: `server/http.ts`, `server/middleware.ts`,
  `server/app.ts`, `server/vercel.ts`, `scripts/test-nucleos.mjs`,
  `scripts/smoke-vercel.mjs` (más este log). **No** toqué `src/**`,
  `index.html`, `public/**`, `vercel.json`, `package.json`, `README.md`
  ni ningún otro doc (ni siquiera el tablero: ver «deuda» abajo).
- `verify:rls` → **n/a** (no toqué `supabase/schema.sql`).

## Cambios realizados

### Servidor (los dos adaptadores)

- `server/http.ts` → helper nuevo **`setApiRobotsHeaders(res)`** que pone
  `X-Robots-Tag: noindex`. Vive **fuera** de `setSecurityHeaders` (T32):
  ese set sigue exactamente igual (5 cabeceras de `vercel.json` + COOP) y
  **no** arrastra la cabecera nueva.
- `server/middleware.ts` → middleware nuevo **`apiRobotsHeaders`** que
  delega en el helper. El `securityHeaders` global de T32 queda intacto.
- `server/app.ts` → `app.use('/api', apiRobotsHeaders)` montado en
  **`/api`**, justo tras `securityHeaders` y **antes de `express.json`**:
  así cubre también los 400 de JSON malformado (que responden sin llegar
  al router) y los 404 de `apiNotFound`. El HTML de la SPA (`/`, estáticos
  de `dist/`, 404 y el shell de Vite en dev) **no pasa por este montaje**.
- `server/vercel.ts` → `createApiRoute` llama `setApiRobotsHeaders(res)`
  tras `setSecurityHeaders(res)`: todas las funciones `api/*.ts` (incluido
  el catch-all `api/index.ts` y el rewrite de `/api/reports` de T28) llevan
  la cabecera. Los estáticos de Vercel **no** pasan por esa función, así
  que el HTML del despliegue queda fuera por construcción.

### Tests

- `scripts/test-nucleos.mjs` → sección **S20–S25** (6 checks nuevos):
  S20 `setSecurityHeaders` (compartido API+HTML) **NO** pone
  `X-Robots-Tag` · S21 `setApiRobotsHeaders` pone exactamente `noindex`
  (y nada de cabeceras T32) · S22 Express real `/api/health` →
  `noindex` · S23 el 404 de `/api/ruta-inexistente` → también
  `noindex` · S24 Express real `/` → **sin** la cabecera · S25 función de
  Vercel (`/api/points`) → `noindex`. Para S25, `callVercel` devuelve
  ahora también `res` (antes solo status/body; `contrato` no lo usa, no
  cambia nada). Cabecera del fichero actualizada (S = T29 + T32 + T39).
- `scripts/smoke-vercel.mjs` → **2 casos nuevos** en la matriz (51 → 53):
  `X-Robots-Tag: noindex` en `/api/health` y **`/` sin la cabecera**
  (`statusAny: [200, 404]`: 404 en el emulador local, que no sirve
  estáticos; 200 contra el despliegue). Aviso al estilo T32 sobre
  `SMOKE_BASE_URL` + doc del fichero actualizada. El desajuste de header
  ahora dice «esperado ausente» cuando se espera que no esté.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ (0 errores, TS estricto) |
| `npx vite build` | ✅ (`✓ built in 431ms`) |
| `npm run test:ui` | ✅ (**40/40** · `TODO OK`) |
| `npm run test:server` | ✅ (**146/146** · `TODO OK`; S1–S25) |
| `npm run smoke:vercel` | ✅ (**53/53 · 0 fallos** · `TODO OK`) |
| `npm run verify:rls` | n/a (no toqué `supabase/schema.sql`) |

**Evidencia `curl -I` (servidor de producción de esta sesión,
`NODE_ENV=production PORT=3125 node --import tsx server.ts`, cerrado después):**

| Ruta | Resultado |
| --- | --- |
| `GET /api/health` | `200` + **`X-Robots-Tag: noindex`** + las 6 cabeceras T32 intactas (CSP, nosniff, XFO, Referrer-Policy, Permissions-Policy, COOP) |
| `GET /api/xyz` | `404` + **`X-Robots-Tag: noindex`** (los 404 de API también) |
| `POST /api/points` con JSON malformado | `400` + **`X-Robots-Tag: noindex`** (montaje antes de `express.json`) |
| `GET /` (HTML de la SPA) | `200 text/html` · **0 ocurrencias** de `x-robots` |
| `GET /ruta-inexistente` | `404` (sin la cabecera) |

**Sabotaje (rojo deliberado, restaurado después; `diff` contra backup = 0):**

Comenté el montaje en `server/app.ts` **y** la llamada en
`server/vercel.ts` → `test:server` con **3 fallos** (`S22`, `S23`, `S25`)
y `smoke:vercel` con **1 fallo** («X-Robots-Tag: noindex en la API»).
Restaurado → 146/146 y 53/53 en verde.

## Decisiones tomadas (y por qué)

- **Alcance: cabecera SOLO en `/api/*`, y por código (no en
  `vercel.json`).** `setSecurityHeaders` es la fuente única de cabeceras
  de T32 y sirve a HTML **y** API: meter `X-Robots-Tag` ahí desindexaría
  la home (peor que el hallazgo SEO-15). Por eso hay helper +
  middleware propios, montados en la rama de API. En Vercel la cabecera
  sale de `createApiRoute`, que solo ven las funciones de API; tocar
  `vercel.json` (bloque `/`) habría puesto `noindex` en el HTML estático
  y además ese fichero es de otra área.
- **Montaje en `/api` antes de `express.json`, no dentro del router:**
  los 400 de body-parser y los 404 responden sin pasar por `mount()`;
  con el middleware en la entrada de `/api` toda respuesta de API la
  lleva, sea cual sea el status (200/400/401/404/429/500).
- **Valor exacto `noindex`** (sin `nofollow`): no queremos que los
  crawlers dejan de *seguir* los enlaces de la API/JSON-LD público; solo
  que no la indexen.
- **Tests en las dos suites que ya validan cabeceras** (S para Express +
  adaptadores, matriz del humo para la función real): así el rojo sale en
  CI y contra el despliegue, no a ojo con `curl`.

## Riesgos y deuda que dejo

- **Tablero no actualizado a propósito:** `docs/agentes/tareas-semana-2.md`
  (T39 ⬜ → ✅) queda para la persona/coordinador: esta ronda solo puede
  escribir su propio log en `docs/`.
- **Tras el push, repetir** `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app
  npm run smoke:vercel`: el check «X-Robots-Tag: noindex en la API» sale
  **rojo contra un deploy viejo** (mismo comportamiento documentado para
  T32); el check del HTML tiene que seguir verde siempre.
- **El check del HTML en local es débil a propósito** (el emulador del
  humo responde 404 en `/`, sin estáticos): su valor real es contra el
  despliegue. En local manda S24 (Express real) + la evidencia `curl -I`.
- Si **agente-calidad** añade algún día `X-Robots-Tag` al bloque `/` de
  `vercel.json` (o un header global), el check del HTML del humo irá a
  rojo con la instrucción clara: esa cabecera no debe tocar los estáticos.
- Si alguien mueve `apiRobotsHeaders` dentro de `securityHeaders` o lo
  desmonta, **S20/S22–S25 + humo** se ponen rojos solos (sabotaje
  comprobado arriba).
- No hice `git commit` (lo gestiona la persona). El árbol de trabajo
  trae cambios de otras áreas de la semana (frontend en `src/**`,
  `index.html`, `public/**`; `vercel.json`; otros logs): no los toqué.

## Para el siguiente agente

- `setApiRobotsHeaders` / `apiRobotsHeaders` es la **única** puerta de
  esta cabecera; si amplías rutas de API, no hay que hacer nada (el
  montaje es por prefijo `/api`).
- **No «arreglar»** la cabecera añadiéndola a `setSecurityHeaders`: eso
  desindexa la SPA. S20 existe exactamente para impedirlo.
- Si se amplía la API más allá de `/api/*` (p. ej. `/rss`), revisar el
  alcance del montaje en `server/app.ts`.
- Números de esta ronda: `test:server` **146** (S1–S25), `smoke:vercel`
  **53**. Las secciones S20–S25 son la puerta de T39.
