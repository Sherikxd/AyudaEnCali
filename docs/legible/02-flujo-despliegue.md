# Flujo de despliegue: de mi ordenador a producción

Cuatro caminos distintos para el **mismo código**, y una barrera de calidad
(Continuous Integration) que evita que algo roto llegue a la web pública.

---

## 1. El mapa del recorrido

```
                    ┌──────────────────────────────────────────┐
  git push a main → │  GitHub Actions (CI)                     │
                    │  lint → build → tests → humo → RLS       │
                    └───────────────┬──────────────────────────┘
                                    │ ¿verde?
                                    ▼
                    ┌──────────────────────────────────────────┐
                    │  Vercel (producción pública)             │
                    │  lint + test:ui + vite build             │
                    │  → 10 funciones + sitio estático         │
                    └───────────────┬──────────────────────────┘
                                    ▼
                     https://ayuda-en-cali.vercel.app
                     (308 → https://www.ayudaencali.lat)

  Rutas alternativas (mismo repo, distinto proceso):
    npm run build && npm start   → servidor Node único (Railway, Fly.io…)
    docker build + docker run    → contenedor → Cloud Run / cualquier host
```

---

## 2. Desarrollo local

```bash
npm install          # dependencias
cp .env.example .env # claves (Supabase, Clerk, Gemini…)
npm run dev          # API + frontend en el mismo puerto
```

Se abre en `http://localhost:3000`. Un solo proceso (`server.ts`) hace de
servidor Express y, además, sirve el frontend de Vite en modo *middleware*:
sin necesidad de dos ventanas ni de un proxy.

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Desarrollo (recarga en caliente) |
| `npm run build` | Compila el frontend a `dist/` |
| `npm start` | Producción local: sirve la API y `dist/` |
| `npm run lint` | Tipos estrictos (`tsc --noEmit`) |
| `npm run test:ui` | Tests de interfaz en jsdom (sin navegador) |
| `npm run test:server` | Tests de los núcleos del servidor |
| `npm run smoke:vercel` | Humo de las funciones de Vercel (60 comprobaciones) |
| `npm run verify:rls` | Valida el esquema y los permisos de BD en un Postgres temporal |

Sin `.env` la app arranca de todas formas: usa datos semilla en memoria y
muestran un aviso de lo que falta. Sirve para tocar la interfaz sin claves.

---

## 3. La barrera de calidad (CI)

**¿Por qué existe?** Vercel solo ejecuta `vite build`. Si no hubiera nada
más, tipos rotos, tests caídos o una API rota llegarían a producción igual.
El pipeline de GitHub Actions (`.github/workflows/ci.yml`) es el filtro
previo; corre en cada *push* y *pull request* a `main`, y a mano con
`workflow_dispatch`.

Orden exacto:

| # | Paso | Qué comprueba |
| --- | --- | --- |
| 1 | `npm run lint` | Tipos correctos, sin `any`, sin variables sin usar |
| 2 | `npx vite build` | Que el bundle de producción compila (code splitting incluido) |
| 3 | `npm run test:ui` | El modal de registro y la UI montados en jsdom |
| 4 | `npm run test:server` | Núcleos de la API (se omite si el fichero no existe) |
| 5 | `npm run smoke:vercel` | Importa las funciones de `api/`, valida `vercel.json` y dispara la matriz de rutas |
| 6 | `npm run verify:rls` | **Solo si cambió** `supabase/schema.sql`; si cambió y falla, **para el pipeline** |

Detalles del runner: Ubuntu, Node 22, `npm ci || npm install` (el repo usa
`bun.lock`, no hay `package-lock.json`) y `fetch-depth: 0` para poder
comparar el esquema con el commit anterior.

**Vercel también es puerta**: su `buildCommand` no es solo `vite build`,
sino `npm run lint && npm run test:ui && vite build`. Es el doble filtro:
GitHub lo intenta antes, Vercel lo repite justo antes de publicar.

---

## 4. Los tres destinos de despliegue

| Dónde | Qué procesa las peticiones | Cuándo usarlo |
| --- | --- | --- |
| **Vercel** (producción real) | **Una función por ruta** (`api/*.ts`) + CDN para lo estático. `server.ts` no se ejecuta | Plan gratuito, ya está en producción |
| **Node** (`npm start`) | Un solo proceso `server.ts` con Express | Railway, Fly.io, un VPS |
| **Docker / Cloud Run** | La misma imagen con `server.ts` como PID 1 | Cuando se quiere contenedor y escalado por imagen |

Los tres comparten el **mismo núcleo**: `server/handlers/*` es código
framework-agnóstico. Express y las funciones de Vercel son dos adaptadores
distintos que llaman a idéntica lógica.

### 4.1 Vercel (gratis, plan Hobby)

1. Subir el repositorio a GitHub **sin `.env`** (ya está ignorado).
2. [vercel.com/new](https://vercel.com/new) → importar el repo.
3. En *Project → Settings → Environment Variables* definir las claves
   (ver tabla en el README raíz). Importante: definirlas en **Production y
   Preview**.
4. *Deploy*. Vercel ejecuta `lint + test:ui + vite build`, sirve `dist/`
   desde su CDN y empaqueta **10 funciones**.

Reparto de responsabilidades:

| Ruta | Quién la atiende |
| --- | --- |
| `/`, `/preguntas-frecuentes/`, `/assets/*`, imágenes | CDN de Vercel desde `dist/` |
| `/api/*` con función propia (`health`, `config`, `points`, `needs`, `comments`, `chat`, `sql`, `needs-support`, `support-mine`) | La función correspondiente de `api/` |
| Cualquier otro `/api/*` | `api/index.ts` → **404 JSON** |
| Cualquier otra URL de página | `dist/404.html` con estado **404** |

`vercel.json` hace el cableado: `rewrites` de lo específico al *catch-all*,
cabeceras de caché (`/assets/*` inmutable 1 año), redirecciones (el dominio
`*.vercel.app` → `www.ayudaencali.lat`) y el `buildCommand`.

Límites del plan Hobby que conviene conocer:

- Uso **no comercial**: 100 GB de tráfico, 1 M de peticiones de borde,
  1 M de invocaciones, 4 CPU-h, 300 s por función, ~100 builds al día.
- **Máximo 12 funciones por despliegue**: hay 10, quedan 2 libres.
- Cada función arranca por su cuenta → cada una paga su propio *cold start*
  (~250-500 ms) tras un despliegue o una pausa por inactividad.
- El rate limit y la caché viven **en memoria y por función**: en Express
  hay una cuenta compartida de 60 escrituras/min; en Vercel son 4 cuentas
  independientes (hasta 60/min por ruta). Nunca es más restrictivo que
  Express, solo más permisivo.

**Verificación contra producción:**

```bash
SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel
```

Comprueba 60 comportamientos reales: `200` en salud, `401` sin sesión,
`404` JSON en espejos de ruta, `400` en JSON malformado, cabeceras de caché
y estado 404 de página.

### 4.2 Node (un solo proceso)

```bash
npm run build   # genera dist/
npm start       # NODE_ENV=production → API + dist/ en el mismo puerto
```

El proceso sirve todo: la API, los estáticos comprimidos (gzip) con su
caché, la 404 de página y el apagado ordenado ante `SIGINT`/`SIGTERM`. La
variable `PORT` la inyecta la plataforma.

### 4.3 Docker / Cloud Run

```bash
docker build -t ayudaencali .                                  # build
docker run --rm -p 3000:3000 --env-file .env ayudaencali       # ejecutar

# esquema y datos iniciales (una vez, desde la propia imagen)
docker run --rm --env-file .env ayudaencali node --import tsx scripts/apply-schema.ts
docker run --rm --env-file .env ayudaencali node --import tsx scripts/seed-db.ts
```

El `Dockerfile` es **multi-stage**:

1. Etapa `build` (`node:24-slim`): instala todo y compila con Vite → `dist/`.
2. Etapa `runtime` (`node:24-slim`): solo dependencias de producción +
   `tsx`, y el árbol mínimo (`dist/`, `server.ts`, `server/`, `supabase/`,
   `scripts/`).

Buenas prácticas del contenedor: `.dockerignore` excluye `.env` (cero
secretos horneados), usuario sin privilegios (`USER node`), `HEALTHCHECK`
contra `/api/health`, y un único proceso como PID 1 para que `docker stop`
cierre las peticiones en curso en lugar de matarlas.

---

## 5. Configuración: cuándo se leen las variables de entorno

| Tipo | Cuándo se lee | Ejemplo | ¿Requiere recompilar? |
| --- | --- | --- | --- |
| `VITE_*` | **Al compilar** (`vite build`) y queda escrita en el JavaScript | `VITE_CLERK_PUBLISHABLE_KEY` | **Sí** |
| El resto | **En tiempo de ejecución**, en el servidor | `CLERK_SECRET_KEY`, `SUPABASE_*`, `GEMINI_API_KEY` | No |

Por eso la clave pública de Clerk tiene doble vía: se puede hornear en el
bundle **y** el servidor la sirve en `/api/config`, así que en la práctica
desplegar solo exige definir la variable. Cualquier otra `VITE_*` nueva sí
exigirá recompilar.

Reglas de oro:

- **Nunca** subir `.env` al repositorio (está ignorado; `.env.example` es la
  plantilla sin secretos).
- El navegador solo ve lo que empieza por `VITE_` o lo que expone
  `/api/config` (que dice *si* un servicio está configurado, nunca la clave).
- La clave secreta de Clerk y la de servicio de Supabase viven **solo** en el
  servidor.

---

## 6. Base de datos: primer despliegue

1. Crear el proyecto en Supabase y copiar las claves a `.env` (o al panel de
   Vercel).
2. Crear las tablas, de dos formas:
   - **Automática:** definir `SUPABASE_ACCESS_TOKEN` → el servidor detecta
     tablas que faltan y las crea solo (`npm run db:setup` para forzarlo).
   - **Manual:** pegar `supabase/schema.sql` en el SQL Editor de Supabase.
3. Cargar datos de ejemplo: `npm run db:seed` (idempotente: repetir no duplica).
4. El resultado se ve en `GET /api/config` y en la tarjeta «Conexión en
   Producción» del perfil. Cuando las tablas responden, los listados pasan a
   `"source": "supabase"` **sin reiniciar nada**.

El esquema es idempotente (`CREATE TABLE IF NOT EXISTS`): repetirlo nunca
borra datos.

---

## 7. Checklist antes de dar el botón de deploy

```bash
npm run lint          # tipos
npx vite build        # build de producción
npm run test:ui       # UI en jsdom
npm run test:server   # núcleos de la API
npm run smoke:vercel  # humo hermético de las funciones
npm run verify:rls    # solo si tocaste supabase/schema.sql
```

Después del deploy:

- `GET /api/health` → `200 {"status":"ok"}`
- `GET /api/config` → `200` con el estado de los servicios
- `POST /api/needs/<id>/support` sin sesión → `401` (**no** `404`)
- `/api/ninguna` → `404` JSON
- `/ruta-inexistente` → `404` con la página 404
- `/assets/*.js` → `cache-control: public, max-age=31536000, immutable`
- o directamente: `SMOKE_BASE_URL=<url> npm run smoke:vercel`
