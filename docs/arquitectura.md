# Arquitectura del sistema

> Diagrama y flujos de **AyudaEnCali**. Documento complementario a
> [`legible/03-tecnologia-infraestructura.md`](legible/03-tecnologia-infraestructura.md)
> (la versión en lenguaje llano) y al árbol de `README.md`.

---

## 1. Visión general

Una plataforma comunitaria de emergencias para Santiago de Cali: mapa de
centros de ayuda, tablón de necesidades con apoyos, asistente IA y perfiles
con roles.

El diseño gira en torno a **tres ideas**:

1. **Un solo núcleo, dos formas de ejecutarse**: los handlers viven en
   `server/handlers/` sin depender de Express; Express los monta en local
   (`server/app.ts`) y Vercel los monta como una función por ruta
   (`api/*.ts`). Misma lógica, distinto proceso.
2. **Cadenas de respaldos, nunca pantalla en blanco**: cada servicio
   externo tiene detrás un respaldo (Redis → memoria local → semilla;
   Gemini → directorio local; servidor → `localStorage` con cola).
3. **La verdad solo está en Supabase**: todo lo demás (Redis, memoria,
   localStorage) es velocidad o respaldo con vida limitada.

---

## 2. Diagrama de componentes

```mermaid
flowchart TB
    subgraph CLIENT["Navegador · React 19 + TypeScript + Vite 8"]
        UI["UI: mapa, tablón, chat, perfil<br/>Leaflet · Tailwind 4 · lucide-react"]
        CTX["Estado global<br/>src/context/AppContext.tsx"]
        API["Cliente HTTP<br/>src/services/api.ts"]
        OFF["Capa offline<br/>src/utils/storage.ts + sync.ts<br/>(localStorage con cola de reenvío)"]
        CLERK_C["Clerk React<br/>sesión y JWT"]
        UI --> CTX
        CTX --> API
        CTX --> OFF
        UI --> CLERK_C
    end

    API -- "GET/POST/PATCH … /api/*" --> EDGE

    subgraph EDGE["Entrada al servidor (una u otra)"]
        EXP["Express · server.ts + server/app.ts<br/>un proceso, todas las rutas"]
        VER["Vercel Functions · api/*.ts<br/>una función por ruta (+ catch-all)"]
    end

    subgraph CORE["Núcleo compartido · server/handlers/**  (framework-agnóstico)"]
        H["points · needs · needsSupport · comments<br/>reports · chat · health · config · sql · supportMine"]
    end

    EXP --> H
    VER --> H

    subgraph CHAIN["Cadena de cada petición"]
        RL["1 · Límite de tasa<br/>server/limiters.ts → rateLimit.ts<br/>(write 60/min · read 120/min · chat 15/min)"]
        AUTH["2 · Identidad<br/>server/auth.ts · JWT de Clerk"]
        VAL["3 · Validación<br/>server/validation.ts"]
        DATA["4 · Datos<br/>server/cache.ts → store.ts → supabase.ts"]
        CTXS["Contexto del asistente<br/>server/context.ts"]
    end

    H --> RL --> AUTH --> VAL --> DATA
    H --> CTXS

    subgraph REDIS["Redis (opcional, gestionado)"]
        RD1["Caché de lecturas<br/>aec:dir:* · TTL 10-60 s<br/>invalidada en cada escritura"]
        RD2["Límite de tasa compartido<br/>aec:rl:* · INCR + PEXPIRE"]
    end

    RL -- "INCR/PEXPIRE" --> RD2
    DATA -- "getOrSet / invalidate" --> RD1
    CTXS -- "snapshot dir:ctx:all" --> RD1

    subgraph SUPA["Supabase · verdad del sistema"]
        PG[("PostgreSQL + RLS<br/>help_points · help_needs · need_supporters<br/>point_comments · entity_reports")]
    end

    DATA <--> PG

    subgraph FALLBACKS["Respaldos locales"]
        MEM["Caché en memoria del servidor<br/>server/store.ts (máx. 500 c/u)<br/>+ semilla de Cali si la BD falla"]
        DIRL["Directorio local del chat<br/>server/chatFallback.ts"]
        LS["localStorage del navegador"]
    end

    DATA -. "BD caída" .-> MEM
    H -- "Gemini caído" --> AI
    AI -.-> DIRL
    OFF -. "servidor caído" .-> LS

    subgraph EXT["Servicios externos"]
        AI[("Google Gemini<br/>asistente CaliSolidaria IA")]
        CLOUD[("Cloudinary<br/>CDN de imágenes")]
        CLERK_B[("Clerk<br/>cuentas y sesión")]
        ANALYT["Vercel Analytics"]
    end

    CLERK_C <--> CLERK_B
    H -- "POST /api/chat" --> AI
    UI -- "imágenes" --> CLOUD
    UI -.-> ANALYT

    BROWSER["Visitante"]
    BROWSER --> UI

    classDef cache fill:#e8f4ff,stroke:#2b6cb0
    classDef db fill:#eafaf1,stroke:#276749
    classDef ext fill:#fff7e6,stroke:#b7791f
    class RD1,RD2,MEM cache
    class PG,LS db
    class AI,CLOUD,CLERK_B,CLERK_C ext
```

---

## 3. Tecnologías, capa por capa

| Capa | Tecnología | Qué aporta |
| --- | --- | --- |
| Interfaz | **React 19** + TypeScript estricto | Componentes y tipos compartidos con el servidor (`src/types/index.ts`) |
| Compilación | **Vite 8** (+ `@vitejs/plugin-react`) | `dist/` de producción, code splitting por pestaña |
| Estilos | **Tailwind CSS 4** | CSS sin salir de las clases |
| Mapa | **Leaflet** + OpenStreetMap/ArcGIS | El mapa interactivo de Cali |
| Iconos | **lucide-react** | Iconografía |
| HTTP (cliente) | `fetch` envuelto en `src/services/api.ts` | Una sola puerta a la API, reintentos y errores normalizados |
| Almacenamiento cliente | `localStorage` + cola (`src/utils/{storage,sync}.ts`) | Offline-first: ver y escribir sin conexión |
| Servidor | **Node.js + Express** (ESM vía `tsx`) | Un proceso, todas las rutas, en local/Docker/Node |
| Serverless | **Vercel Functions** | Una función por ruta en producción (`api/*.ts`) |
| Núcleo de API | `server/handlers/**` + `server/http.ts` | Handlers sin framework: se montan en Express **y** en Vercel |
| Caché y límites | **Redis** (`ioredis`, opcional) | Respuestas rápidas y un límite de peticiones igual para todos los procesos |
| Caché de respaldo | `server/store.ts` (en memoria) | Si Supabase falla, responde con la última copia o la semilla |
| Base de datos | **Supabase** (PostgreSQL + RLS) | Persistencia, 5 tablas, seguridad en la propia BD |
| Identidad | **Clerk** (`@clerk/clerk-react` + `@clerk/backend`) | Registro, sesión y verificación del JWT en el servidor |
| IA | **Google Gemini** (`@google/genai`) | Asistente «CaliSolidaria IA» |
| Imágenes | **Cloudinary** | CDN con formato automático (`f_auto,q_auto`) |
| Analítica | **Vercel Analytics** | Métricas de visitas |
| Despliegue | **Vercel** (prod) · **Docker** · **Node** | Ver [`legible/02-flujo-despliegue.md`](legible/02-flujo-despliegue.md) |
| Calidad | `tsc --noEmit` · tests jsdom · humo · RLS | CI en GitHub Actions |

**Instalación** (`package.json`): `dotenv`, `express`, `compression`,
`ioredis`, `@supabase/supabase-js`, `@clerk/backend`, `@google/genai`.

---

## 4. El mismo código en dos ejecuciones

```mermaid
flowchart LR
    subgraph SHARED["Código compartido"]
        HANDLERS["server/handlers/**<br/>server/{auth,validation,cache,rateLimit,<br/>store,supabase,context,http}.ts"]
    end

    subgraph LOCAL["Local / Docker / Node · un proceso"]
        ST["server.ts"]
        APP["server/app.ts<br/>app.get/post/… montando cada handler<br/>SPA en express.static + 404"]
        ST --> APP --> HANDLERS
    end

    subgraph VERC["Vercel · una función por ruta"]
        F1["api/points.ts"]
        F2["api/needs.ts"]
        F3["api/needs-support.ts"]
        FN["… + chat, comments, health,<br/>config, sql, support-mine"]
        RW["vercel.json rewrites<br/>(rutas con id y alias /api/v1)"]
        CATCH["api/index.ts<br/>catch-all → 404 JSON"]
        F1 --> HANDLERS
        F2 --> HANDLERS
        F3 --> HANDLERS
        FN --> HANDLERS
        CATCH --> HANDLERS
        RW -.-> F1
        RW -.-> F2
        RW -.-> F3
        RW -.-> FN
    end

    HANDLERS --> B["Supabase + Redis"]
```

| | Express (un proceso) | Vercel (una función por ruta) |
| --- | --- | --- |
| Rutas | Todas en `app.ts` | `api/*.ts` + rewrites de `vercel.json` |
| Caché y límite | En el proceso… | …pero **compartidos en Redis** |
| Estáticos | `express.static` | CDN de `dist/` |
| Cabeceras/CSP | `server/middleware.ts` | `server/vercel.ts` |
| Límite | 12 funciones por deployment | |

---

## 5. Flujos

### 5.1 Lectura de un listado (`GET /api/points`)

```mermaid
sequenceDiagram
    autonumber
    participant V as Visitante
    participant C as Cliente API
    participant S as Handler
    participant M as Memoria local
    participant R as Redis
    participant D as Supabase
    participant SD as Semilla (fallback)

    V->>C: abre la pestaña del mapa
    C->>S: GET /api/points
    S->>S: readLimiter.enforce(ip)
    Note over S,R: si Redis está caído, el límite<br/>se cuenta en el Map del proceso
    S->>M: ¿listado en memoria?
    M-->>S: no
    S->>R: GET dir:pts:list
    R-->>S: HIT → X-Cache: HIT
    S-->>C: 200 con los datos
    Note over S,D: MISS → SELECT en Supabase,<br/>se guarda en Redis (TTL 30 s)<br/>y en memoria local
    D-->>S: filas
    S-->>C: 200 con X-Cache: MISS
    C->>V: pinta el mapa
```

- Necesidades: TTL **10 s** (llevan `supporters_count`, el dato que más
  cambia). Puntos: **30 s**. Ítem por id: **60 s**. Contexto del chat: **30 s**.
- Si Supabase falla, `server/store.ts` responde con la última copia en
  memoria o con la semilla de Cali.
- Orden de la lectura: **memoria → Redis → Supabase → (respaldo)**.

### 5.2 Escritura (`POST /api/points`)

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario con sesión
    participant C as Cliente API
    participant S as Handler
    participant R as Redis
    participant D as Supabase

    U->>C: rellena el formulario
    C->>S: POST /api/points (JWT de Clerk)
    S->>R: writeLimiter (INCR/PEXPIRE)
    R-->>S: 429 si supera 60/min
    S->>S: getAuthenticatedUser → 401 si no hay sesión
    Note over S: la identidad sale del JWT,<br/>nunca del cuerpo
    S->>S: validatePoint → 400 si no cumple
    S->>D: INSERT (service_role, RLS sin políticas)
    D-->>S: fila creada
    S->>R: invalidate('dir') → SCAN + UNLINK
    Note over R: se borra la caché<br/>antes de responder
    S-->>C: 201 + Location
    C->>U: toast de éxito
```

El orden de comprobaciones es fijo y documentado en cada handler:
**límite de tasa → sesión → permiso/autoría → existencia → validación →
escritura → invalidación**. Así un ciudadano no aprende qué ids existen
antes de comprobar que tiene permiso.

### 5.3 Apoyar una necesidad (`POST /api/needs/:id/support`)

```mermaid
flowchart TD
    A["POST /api/needs/:id/support"] --> B["writeLimiter"]
    B --> C{"Sesión?"}
    C -- no --> E1["401"]
    C -- sí --> D{"¿Ya apoyó?<br/>need_supporters"}
    D -- sí --> E2["200 idempotente"]
    D -- no --> F["INSERT apoyo<br/>+ supporters_count + 1<br/>en UNA transacción"]
    F --> G["invalidate('dir')"]
    G --> H["201 con el nuevo contador"]
    F -. "la caché nunca calcula<br/>ni fusiona el contador" .-> I["Decisión 2026-09-28:<br/>solo refleja snapshots del SELECT"]
```

### 5.4 Asistente (`POST /api/chat`)

```mermaid
flowchart TD
    A["POST /api/chat<br/>chatLimiter 15/min"] --> B["Sesión + validación"]
    B --> C["Contexto: server/context.ts<br/>snapshot de puntos y necesidades<br/>en Redis (30 s) o SELECT directo"]
    C --> D{"Gemini disponible?"}
    D -- sí --> E["@google/genai<br/>respuesta en streaming"]
    D -- no --> F["server/chatFallback.ts<br/>coincidencia sobre el<br/>directorio local"]
    E --> G["200 JSON"]
    F --> G
```

### 5.5 Capa offline

```mermaid
flowchart LR
    A["Escritura falla<br/>(sin conexión o 5xx)"] --> B["Se guarda en localStorage<br/>con bandera pending"]
    B --> C["Se muestra al momento<br/>en la interfaz"]
    C --> D["src/utils/sync.ts reintenta<br/>cuando vuelve la conexión"]
    D --> E{"¿El servidor acepta?"}
    E -- sí --> F["Se fusiona por id:<br/>lo remoto manda, lo local<br/>pendiente se conserva"]
    E -- "rechazo permanente" --> G["syncFailed → toast con<br/>Reintentar / Descartar"]
```

---

## 6. Capas de caché y sus vidas

| Nivel | Dónde | Qué guarda | Vida | Quién la borra |
| --- | --- | --- | --- | --- |
| 1 | `localStorage` del navegador | Listados vistos y escrituras pendientes | Hasta que cambie el usuario o el sync | `src/utils/sync.ts` |
| 2 | Redis `aec:dir:*` | Copias de lo que devolvió un `SELECT` | 10-60 s (TTL) | `invalidate()` en cada escritura |
| 3 | Redis `aec:rl:*` | Contadores de peticiones por IP | Ventana de 60 s | Expiración automática |
| 4 | `server/store.ts` | Últimos 500 ítems + semilla | Vida del proceso | Reescrituras y purgas |
| 5 | Supabase | **Verdad** | Permanente | El propio dominio |

Si un nivel falla, se salta al siguiente. Ninguna caché de nivel 2-4 calcula
nunca `supporters_count`: solo copia lo que leyó de la base.

---

## 7. Seguridad

| Control | Dónde |
| --- | --- |
| Sin secretos en el cliente (solo `VITE_*` y `/api/config`) | `.env` gitignored, `server/handlers/config.ts` |
| Identidad siempre del JWT, nunca del cuerpo | `server/auth.ts` |
| Validación total de payloads (tipos, rangos, listas), cuerpo ≤ 1 MB | `server/validation.ts` |
| Límite de tasa por IP en todas las rutas | `server/rateLimit.ts` (Redis) |
| RLS: lectura pública en `help_points`/`help_needs`; **sin políticas** en `need_supporters`, `point_comments`, `entity_reports` (solo `service_role`) | `supabase/schema.sql` |
| Cabeceras de seguridad en `/api/*` (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`), `x-powered-by` off | `server/middleware.ts` / `server/vercel.ts` |
| Sin stack traces en respuestas (log propio, sin `console.*`) | `server/logger.ts`, `src/utils/logger.ts` |
| Escape de HTML en popups con texto externo | `src/utils/sanitize.ts` |
| Consentimiento de cookies antes de cargar terceros | `src/utils/consent.ts` |
| `GET /api/supabase/sql` protegido con `SQL_ADMIN_TOKEN` | `server/handlers/sql.ts` |

---

## 8. Resiliencia: qué pasa cuando algo cae

| Caída | Efecto | Cubierto por |
| --- | --- | --- |
| Redis | Caché y límite vuelven a la memoria del proceso; nada visible | `server/redis.ts` (circuit breaker), `server/cache.ts` |
| Supabase | La API responde con datos en memoria o semilla | `server/store.ts` |
| Gemini | El chat responde con el directorio local | `server/chatFallback.ts` |
| Servidor | La UI usa `localStorage` y cola lo escrito | `src/utils/{storage,sync}.ts` |
| Excepción de React | `ErrorBoundary` en vez de pantalla en blanco | `src/components/ErrorBoundary.tsx` |

---

## 9. Mapa del código

```
.
├── server.ts                  arranque Express (npm run dev / start)
├── api/*.ts                   Vercel: una función por ruta (+ catch-all)
├── vercel.json                rewrites, cabeceras, alias /api/v1
├── server/
│   ├── app.ts                 monta cada handler en Express
│   ├── bootstrap.ts           dotenv → initSupabase() → initRedis()
│   ├── http.ts                ApiRequest/ApiResult (contrato framework-agnóstico)
│   ├── vercel.ts              createApiRoute(): mismo contrato en Vercel
│   ├── auth.ts · validation.ts
│   ├── limiters.ts · rateLimit.ts     límite de tasa (Redis + Map)
│   ├── cache.ts · redis.ts            caché de lecturas y cliente Redis
│   ├── store.ts                       memoria local + semilla
│   ├── supabase.ts · schema.ts        cliente, mapeo de filas, reintentos
│   ├── context.ts                      contexto del asistente
│   ├── chatFallback.ts                 respaldo del chat
│   └── handlers/                       points needs needsSupport comments
│                                        reports chat health config sql supportMine
├── supabase/schema.sql        DDL + RLS (npm run verify:rls)
├── scripts/                   test, humo, seed, schema, Cloudinary
├── src/                       cliente React
│   ├── context/AppContext.tsx estado global
│   ├── services/api.ts        puerta única a la API
│   ├── utils/{storage,sync}.ts offline
│   └── components/            MapView, ChatView, ProfileView, …
├── .github/agents/*.agent.md  5 agentes de Copilot CLI
├── .opencode/agent/*.md       los mismos 5 para opencode
└── docs/                      este documento, legible/ y agentes/
```

---

## 10. Comandos

| Comando | Para qué |
| --- | --- |
| `npm run dev` | API + Vite en `http://localhost:3000` |
| `npm run lint` / `typecheck` | TypeScript estricto (`noUnusedLocals`, `noUnusedParameters`) |
| `npm run test:ui` | Tests jsdom (`TODO OK` en verde) |
| `npm run test:server` | Humo de los núcleos (sin navegador) |
| `npm run verify:rls` | Valida `supabase/schema.sql` en un Postgres desechable |
| `npm run db:setup` / `db:seed` | Esquema y semilla en Supabase |
| `npm run smoke:vercel` | Humo contra un despliegue (`SMOKE_BASE_URL=…`) |

---

## Documentos relacionados

| Documento | Para qué |
| --- | --- |
| [`legible/01-flujo-app.md`](legible/01-flujo-app.md) | Qué ve una persona al usar la app |
| [`legible/02-flujo-despliegue.md`](legible/02-flujo-despliegue.md) | Cómo se despliega |
| [`legible/03-tecnologia-infraestructura.md`](legible/03-tecnologia-infraestructura.md) | El stack en lenguaje llano |
| [`agentes/decisiones.md`](agentes/decisiones.md) | Por qué las cosas son así (no reabrir sin consenso) |
| [`agentes/uso-agentes.md`](agentes/uso-agentes.md) | Los 5 agentes y cuándo usarlos |
| `README.md` | Referencia rápida, API y variables de entorno |
