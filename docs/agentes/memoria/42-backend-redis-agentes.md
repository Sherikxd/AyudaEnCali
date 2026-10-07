# Log — backend: Redis + agentes (2026-10-07)

## En qué trabajé

Petición directa de la persona, fuera del tablero de la semana 1/2:

1. Integrar **Redis** para «datos rápidos solicitados» (caché de lecturas) y
   llevar allí el **límite de tasa**, que hoy estaba fragmentado por proceso.
2. Generar **múltiples agentes** de pensamiento crítico y código pesado y
   **desplegar los de GitHub Copilot CLI** (instalado y autenticado en la
   máquina).
3. Actualizar la documentación de arquitectura/diseño.

Registrado como **FEAT-13** en `tareas-semana-2.md`.

## Cambios realizados

**Nuevos (backend)**

- `server/redis.ts` → cliente `ioredis` singleton con `connectTimeout` 2 s,
  `commandTimeout` 1.5 s, `enableOfflineQueue: false` y circuit breaker (3
  fallos → 30 s de enfriamiento). Punto de acceso único `withRedis(fn)` que
  devuelve `null` en cualquier fallo: **jamás un 500 por Redis**.
  `initRedis()` desde `bootstrap.ts`, `closeRedis()` en el shutdown de
  `server.ts`, `redisStatus()` para salud.
- `server/cache.ts` → `getOrSet`/`cacheGet`/`cacheSet`/`invalidate`/
  `redisPing`. Invalidación por prefijo con `SCAN`+`UNLINK` (límite de 50
  iteraciones); solo se cachean valores no nulos.

**Tocados (backend)**

- `server/rateLimit.ts` → reescrito: script Lua `INCR`+`PEXPIRE` atómico,
  clave `aec:rl:<name>:<ip>`, respaldo en el `Map` local. `enforce()`
  ahora es `async` (firma documentada en la interfaz).
- `server/limiters.ts` → `name: write|read|chat` para las claves Redis.
- 12 call-sites con `await …enforce(…)`: `points.ts:86,206,253`,
  `needs.ts:71,140,184`, `needsSupport.ts:65`, `comments.ts:38,93`,
  `reports.ts:66,148`, `chat.ts:279`.
- `server/handlers/points.ts` → `loadPoint` y `listPoints` con Redis
  (TTL 60 s / 30 s) + `invalidate('dir')` en PATCH, PUT, DELETE y POST.
- `server/handlers/needs.ts` → igual (TTL 60 s / **10 s**, más corto por
  `supporters_count`) + invalidación en PATCH, DELETE y POST.
- `server/handlers/needsSupport.ts` → `invalidate('dir')` **antes** de
  responder tras un apoyo confirmado: es la pieza que mantiene viva la
  decisión 2026-09-28.
- `server/context.ts` → snapshot del contexto en `dir:ctx:all` (30 s) para
  que una función fría no pague los dos `SELECT`; conserva `hasLive*`.
- `server/handlers/health.ts` → `redis: up|down|disabled` (aditivo, sin
  romper los tests que solo miran `"status"`).
- `server/bootstrap.ts` · `server.ts` · `.env.example`.

**Agentes (5 × 2)**

- `.github/agents/`: `pensador-critico`, `backend-pesado`,
  `frontend-pesado`, `verificador`, `auditor-rls` (`.agent.md`, con `tools`).
- `.opencode/agent/`: los mismos 5 con `mode: subagent` y `permission`
  (`edit: deny` en los tres de solo lectura; patrones de `bash` de más amplio
  a más estrecho, que es como los evalúa opencode).
- `docs/agentes/uso-agentes.md` → guía de uso de ambas familias.

**Documentación**

- `docs/agentes/decisiones.md` → 2 entradas nuevas (2026-10-07): precisión de
  la decisión del 28-09 sobre el contador y reapertura de la del 30-09 sobre
  el rate limit.
- `README.md` → árbol (redis/cache, límites, bootstrap), flujo de datos con
  Redis, `REDIS_URL` en la tabla de env, `X-Cache`/límites compartidos en la
  API y el bloque de Vercel sobre «rate limit por función» reescrito.
- `docs/legible/03-tecnologia-infraestructura.md` → Redis en stack, en
  «cuatro niveles de almacenamiento», en rendimiento y en servicios.
- `docs/legible/01-flujo-app.md` → fila de Redis en la cadena de resiliencia.
- `docs/agentes/tareas-semana-2.md` → FEAT-13 ✅.
- **`docs/arquitectura.md`** → documento nuevo con el diagrama del sistema y
  los flujos: 7 diagramas Mermaid (componentes, Express vs Vercel, lectura,
  escritura, apoyos, chat, offline), tabla de tecnologías, capas de caché,
  seguridad, resiliencia, mapa del código y comandos. Enlazado desde
  `README.md` (sección Arquitectura y árbol) y `docs/legible/README.md`;
  los 7 parsean con la librería oficial de Mermaid y los enlaces internos
  (7) apuntan a ficheros existentes.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ (`TODO OK`) |
| `npm run test:server` | ✅ (`TODO OK`, con Redis real) |
| `npm run verify:rls` | n/a (no se tocó `schema.sql`) |
| Humo local (`PORT=3124`) | ✅ `redis:"up"` · `X-Cache MISS→HIT` en points y needs · 125 GET → 113×200 + 12×429 con `RateLimit-*` y `Retry-After` |
| Invalidación (`SCAN`+`UNLINK`) | ✅ `dir` borrado, `rl` conservado |
| `copilot -p --agent=<los 5>` | ✅ los 5 cargan y responden citando el repo |

## Decisiones tomadas (y por qué)

- **`ioredis`** en vez de `redis`: timeouts por comando, `retryStrategy` y
  `enableOfflineQueue` resuelven el caso serverless sin código propio.
- **Invalidación por prefijo (SCAN+UNLINK)** en vez de versionado por clave:
  las lecturas se quedan en un `GET` (1 ida) y el coste del SCAN cae solo en
  la escritura, que es rara.
- **TTLs cortos** (10/30/60 s): el listado de necesidades lleva
  `supporters_count`, así que su ventana es la más corta de las tres.
- **`enforce()` pasó a `async`** en lugar de añadir un segundo método: los
  12 call-sites ya estaban en funciones `async`, el cambio es local y deja
  una sola vía de código.
- **`X-Cache` como cabecera**, no como campo del cuerpo: `source` sigue
  significando «BD o respaldo local» y el contrato del cliente no cambia.
- **Roles duplicados** (Copilot + opencode) en vez de elegir uno: la persona
  trabaja con Copilot en terminal y opencode aquí; las reglas viven en los dos
  ficheros y la guía avisa de que hay que cambiarlos juntos.

## Riesgos y deuda que dejo

- **`REDIS_URL` no está en Vercel**: hasta que la persona la defina en
  Production *y* Preview, en producción seguirá el respaldo local (correcto,
  pero sin el beneficio). Mismo caso para `smoke:vercel`, que es hermético y
  no verá Redis.
- **La clave de Redis quedó escrita en una conversación**: rotarla en la
  instancia. El `.env` local está gitignored (`git check-ignore` verificado).
- **Invalidación best-effort**: si el `SCAN` se corta (50 iteraciones), las
  claves restantes viven hasta su TTL (máx. 60 s). Es el fallo asumido a
  propósito: nunca al revés.
- **Circuit breaker compartido**: tras 3 fallos seguidos se apaga Redis 30 s
  para **todas** las operaciones del proceso; durante ese rato el rate limit
  es por proceso (más permisivo en Vercel, como antes).
- **Los agentes de Copilot no están probados con tareas largas**: solo se
  verificó que cargan y responden; el rendimiento con `--fleet` queda por
  medir.
- **Ningún test cubre Redis**: `test:server` lo corre con Redis real pero no
  asserta nada de caché (la prueba de invalidación fue un script manual, ya
  borrado). Si alguien cambia `cache.ts`, la verificación es manual.

## Para el siguiente agente

- Lee `decisiones.md` (entradas 2026-10-07) antes de tocar `rateLimit.ts`,
  `cache.ts` o el contador de apoyos: la tensión con el 28-09 ya está
  resuelta y documentada, no la reabras sin motivo.
- Si amplías la caché a comentarios o reportes: crea su espacio (`cmt`,
  `rpt`) y su `invalidate()` en el handler de escritura; no metas nada en
  `dir`, que es de puntos/necesidades y ya se borra bastante a menudo.
- La guía de agentes es `docs/agentes/uso-agentes.md`. Si añades un agente
  nuevo, créalo **en los dos sitios** (`.github/agents/` y `.opencode/agent/`)
  y añádelo a la tabla de esa guía.
- En `.github/agents/*.agent.md`, **todas** las `description` van entre
  comillas: un `: ` suelto rompe el YAML y Copilot no carga el agente.
