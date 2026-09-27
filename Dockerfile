# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# AyudaEnCali — imagen de producción (multi-stage)
#
#   build:  docker build -t ayudaencali .
#   run:    docker run --rm -p 3000:3000 --env-file .env ayudaencali
#
# La imagen NO lleva secretos: `.dockerignore` excluye `.env`. Las claves
# secretas llegan en tiempo de ejecución (--env-file / -e). La clave *pública*
# de Clerk tampoco hace falta en el build: el servidor la lee de las variables
# de entorno y la sirve en /api/config. El build-arg siguiente es opcional y
# solo la hornea en el bundle (una petición menos al arrancar):
#
#   docker build -t ayudaencali --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx .
# ---------------------------------------------------------------------------

# --- 1) Build del frontend ---------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app

# `package*.json` funciona con o sin package-lock.json: si algún día añades
# un lockfile, el build pasa automáticamente a `npm ci` (reproducible).
COPY package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi

# Vite expone al bundle las variables del entorno que empiezan por VITE_.
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}

# node_modules está en .dockerignore: la capa de arriba lo conserva en caché.
COPY . .
RUN npm run build

# --- 2) Imagen de ejecución --------------------------------------------------
FROM node:24-slim AS runtime
WORKDIR /app

# Solo dependencias de producción (vite va en `dependencies` porque el
# servidor lo importa) + tsx, que está en devDependencies pero es runtime
# real: es con lo que arranca server.ts.
COPY package*.json ./
RUN npm install --omit=dev --no-save --no-audit --no-fund \
      "tsx@$(node -p 'const p = require("./package.json"); (p.devDependencies || {}).tsx || (p.dependencies || {}).tsx || "4"')" \
 && npm cache clean --force

# Árbol mínimo que necesita el servidor en producción:
#   dist/            -> build del frontend (incluye public/)
#   server.ts/server -> API Express
#   supabase/        -> schema.sql que lee server/schema.ts en arranque
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/server ./server
COPY --from=build /app/supabase ./supabase
# scripts/ solo para poder aplicar el esquema o sembrar datos desde la imagen:
#   docker run --rm --env-file .env ayudaencali node --import tsx scripts/apply-schema.ts
COPY --from=build /app/scripts ./scripts

ENV NODE_ENV=production \
    PORT=3000

# Usuario sin privilegios: el servidor solo lee y habla por red.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e 'const u = "http://127.0.0.1:" + (process.env.PORT || 3000) + "/api/health"; fetch(u).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

# Un único proceso como PID 1 (no passthrough de npm): recibe SIGTERM y
# ejecuta el cierre ordenado de server.ts en `docker stop` / Cloud Run.
CMD ["node", "--import", "tsx", "server.ts"]
