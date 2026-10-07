# Tecnología e infraestructura

Qué lenguajes y librerías se usan, qué servicios externos hay por medio y
cómo está protegida y optimizada la plataforma.

---

## 1. El stack, capa por capa

| Capa | Tecnología | Para qué sirve |
| --- | --- | --- |
| Interfaz | **React 19 + TypeScript** | Componentes y tipos estrictos (sin `any`) |
| Construcción | **Vite 8** | Compila y empaqueta el frontend a `dist/` |
| Estilos | **Tailwind CSS 4** | CSS directamente en las clases |
| Mapa | **Leaflet** (+ OpenStreetMap/ArcGIS) | El mapa interactivo de Cali |
| Iconos | **lucide-react** | Iconografía de la interfaz |
| API | **Node.js + Express** (ESM vía `tsx`) | Servidor HTTP en local, Docker y Node |
| Caché y límites | **Redis** (opcional, con respaldo en memoria) | Respuestas rápidas y un límite de peticiones igual para todos los servidores |
| Tipos compartidos | `src/types/index.ts` | El contrato de la API, cliente y servidor usan el mismo fichero |
| Base de datos | **Supabase** (PostgreSQL + RLS) | Persistencia, 5 tablas |
| Identidad | **Clerk** (`clerk-react` + `@clerk/backend`) | Registro, sesión y verificación del JWT |
| IA | **Google Gemini** (`@google/genai`) | El asistente «CaliSolidaria IA» |
| Imágenes | **Cloudinary** | CDN de imágenes con formato automático |
| Analítica | **Vercel Analytics** | Métricas de visitas |
| Despliegue | **Vercel** (prod) · **Docker/Cloud Run** · **Node** | Ver el documento de despliegue |
| Calidad | `tsc --noEmit`, tests jsdom, humo, RLS | CI en GitHub Actions |

Requisitos: **Node 20 o superior** (en CI y Docker, Node 22/24).

---

## 2. Cómo está organizado el código

```
AyudaEnCali/
├── server.ts            ← entrada local/Docker/Node: Vite en dev,
│                          estáticos en producción, 404 y apagado ordenado
├── server/              ← núcleo compartido por Express Y Vercel
│   ├── app.ts           ← la app Express (rutas /api, cabeceras, 404)
│   ├── handlers/        ← la lógica real, uno por recurso (framework-agnóstico)
│   ├── vercel.ts        ← adaptador para las funciones de Vercel
│   ├── auth.ts          ← verifica el JWT de Clerk
│   ├── validation.ts    ← valida y sanea todos los payloads
│   ├── limiters.ts      ← límites de peticiones por IP
│   ├── store.ts         ← caché en memoria (respaldo si falla la BD)
│   ├── supabase.ts      ← cliente de BD con reintentos y degradación
│   ├── context.ts       ← contexto de datos para el asistente (TTL 30 s)
│   └── chatFallback.ts  ← respuestas del chat sin Gemini
├── api/                 ← 10 funciones de Vercel (una por ruta)
├── src/                 ← frontend (React)
│   ├── components/      ← vistas y modales
│   ├── context/AppContext.tsx  ← estado global y sincronización
│   ├── services/api.ts  ← cliente HTTP con timeout
│   └── utils/           ← storage, sync offline, seo, consent, sanitize…
├── supabase/schema.sql  ← DDL + políticas RLS (fuente única de la BD)
├── scripts/             ← utilidades: esquema, semilla, tests, humo, CDN
├── public/              ← 404.html, manifest, sw.js, imágenes, robots/sitemap
├── docs/
│   ├── legible/         ← ESTA documentación (para personas)
│   └── agentes/         ← memoria operativa: tareas, decisiones, logs
├── vercel.json          ← cableado de Vercel (rewrites, caché, build)
├── Dockerfile           ← imagen multi-stage
└── .github/workflows/ci.yml  ← pipeline de verificación
```

**La idea clave:** `server/handlers/` es el corazón. Express
(`server/app.ts`) y Vercel (`api/*.ts`) son dos pieles que ejecutan el mismo
código, así que un cambio de comportamiento vale para los dos entornos y no
se puede desincronizar.

---

## 3. Datos

### 3.1 Las cinco tablas (Supabase / PostgreSQL)

| Tabla | Qué guarda |
| --- | --- |
| `help_points` | Los centros del mapa (nombre, categoría, coordenadas, barrio, estado, autor) |
| `help_needs` | Las necesidades del tablón (texto, urgencia, estado, contador de apoyos) |
| `need_supporters` | Quién apoyó qué: clave `(need_id, user_id)` → un apoyo por cuenta, sin duplicados |
| `point_comments` | Comentarios de cada punto |
| `entity_reports` | Cola de moderación: reportes de puntos o necesidades |

El fichero `supabase/schema.sql` es la **fuente única**: crea tablas,
índices, la función de apoyo atómica y las políticas de seguridad. Es
idempotente (se puede aplicar muchas veces sin borrar datos) y se puede
aplicar con `npm run db:setup`, pegándolo en el SQL Editor o consultando
`GET /api/supabase/sql` (protegido por token).

### 3.2 Seguridad a nivel de base de datos (RLS)

*Row Level Security* = reglas que la propia base de datos aplica aunque
alguien llegue directo a la API de Supabase con una clave pública.

| Tabla | Regla |
| --- | --- |
| `help_points`, `help_needs` | Lectura pública; insertar/editar solo con sesión autenticada |
| `need_supporters`, `point_comments`, `entity_reports` | RLS activo y **sin políticas**: solo el servidor (con la clave de servicio) toca esas tablas |

El servidor escribe con `SUPABASE_SERVICE_ROLE_KEY` (bypasea RLS). Las
políticas son la defensa en profundidad para quien tenga la clave pública.
`npm run verify:rls` lo comprueba todo en un Postgres temporal, aplicando el
esquema dos veces y comprobando quién puede leer, insertar y borrar.

### 3.3 Cuatro niveles de almacenamiento

```
Supabase (verdad)  →  Redis (caché rápida)  →  memoria del servidor  →  localStorage
      │                       │                        │                      │
 fuente de verdad      si nadie ha escrito       si la BD falla         si el servidor
                       hace menos de unos       responde con datos      no responde, se
                       segundos, responde       semilla de Cali         ve y se cola lo
                       ya sin volver a mirar                             escrito
```

Redis es **solo velocidad**, nunca verdad: guarda una copia de lo que devolvió
la base con un plazo de vida corto (10-60 segundos) y la borra en cuanto
alguien escribe algo. Si no está configurado, o se cae, la app ni se entera:
se salta este nivel y pregunta directamente a Supabase.

La caché en memoria se vacía en cada reinicio (y en cada *cold start* de
Vercel), pero no pierde datos porque la verdad siempre está en la base.

---

## 4. Identidad (Clerk)

- **Cliente:** `@clerk/clerk-react` pinta los formularios de acceso y da el
  token de sesión.
- **Servidor:** `@clerk/backend` verifica el JWT de la cabecera
  `Authorization: Bearer …` en todas las rutas de escritura. Si la clave
  secreta falta → `401`, no se confía en nadie.
- La identidad real sale del claim `sub` del token, **nunca** del cuerpo de
  la petición (eso permitiría suplantar autoría).
- El perfil local (nombre, barrio, rol) vive en el dispositivo y se
  mantiene alineado con la sesión por `ClerkSync`.

---

## 5. Asistente de IA (Gemini)

- Modelo por defecto `gemini-3.8-flash` (configurable con `GEMINI_MODEL`).
- El servidor construye un **contexto** con los datos reales de la
  plataforma (puntos, necesidades, barrios) con TTL de 30 segundos, así la
  IA responde con información actual, no con lo que se le puso en el
  prompt de fábrica.
- **Respaldo:** sin `GEMINI_API_KEY` o si la llamada falla, responde
  `server/chatFallback.ts` con un directorio local (incluye ayuda
  geográfica de `server/geo.ts`). El chat nunca devuelve error vacío.
- Límite: 15 mensajes por minuto e IP.

---

## 6. API

Todas las rutas viven bajo `/api` **y** `/api/v1` (alias aditivo: mismos
métodos, misma autenticación, mismas respuestas). Formato de error uniforme:
`{ "error": string, "details"?: string[] }`.

| Recurso | Rutas principales |
| --- | --- |
| Salud y estado | `GET /api/health`, `GET /api/config` |
| Puntos | `GET/POST /api/points`, `PUT/DELETE/PATCH /api/points/:id` |
| Necesidades | `GET/POST /api/needs`, `PATCH/DELETE /api/needs/:id` |
| Apoyos | `POST /api/needs/:id/support`, `GET /api/support/mine` |
| Comentarios | `GET/POST /api/comments` |
| Moderación | `GET/POST /api/reports` (permiso de moderación) |
| Asistente | `POST /api/chat` |
| Esquema | `GET /api/supabase/sql` (token `SQL_ADMIN_TOKEN`) |

**Paginación** en listados: `?page=&limit=` (1–100, por defecto 1 de 20); sin
parámetros, los listados responden como siempre (compatibilidad).

**Límites por IP:** 60 escrituras/min y 15 mensajes de chat/min; se devuelven
cabeceras `RateLimit-*` y `429` al superarlos.

---

## 7. Seguridad

- **Cero secretos en el cliente**: todo en `.env` (ignorado por git), y
  `/api/config` solo dice *si* un servicio está configurado.
- **Validación total** de los payloads (`server/validation.ts`): tipos,
  rangos, longitudes y listas de valores permitidos. Cuerpo máximo 1 MB.
- **Cabeceras de seguridad** en toda la API: `nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (con
  geolocalización propia) y `x-powered-by` deshabilitado; CSP aplicada y
  verificada en Chromium.
- **Sin stack traces** en las respuestas; los detalles van solo al log del
  servidor (loggers propios, no `console.*`).
- **Escape de HTML** en los popups del mapa que muestran texto externo.
- **Consentimiento de cookies**: sin aceptar, no se cargan recursos de
  terceros.
- **Contenedor** sin privilegios y sin secretos horneados.

---

## 8. Rendimiento

| Medida | Efecto |
| --- | --- |
| Gzip en todo el tráfico de Express | Bundle principal ≈408 kB → ≈108 kB en red |
| Caché por tipo de archivo | `/assets/*` inmutable 1 año (nombres con hash), imágenes 1 semana, HTML sin caché |
| Code splitting por pestaña (`React.lazy`) | Solo descargas la vista que abres; Leaflet viaja con el mapa |
| `manualChunks` para React y Clerk | Desplegar no invalida la caché de los proveedores |
| Cloudinary con `f_auto,q_auto` | WebP/AVIF servido desde un borde cercano |
| Imágenes comprimidas y con `width`/`height` | ≈2,9 MB → ≈0,6 MB; sin saltos de layout |
| Service Worker (PWA) | La app abre y muestra contenido sin conexión |
| Leaflet dentro del chunk del mapa | No bloquea el render del resto de pestañas |
| Redis como caché de lecturas | Listados, ítems y contexto del chat se responden en milisegundos sin repetir la misma consulta en Supabase; TTL de 10-60 s |

---

## 9. Servicios externos y su papel

| Servicio | Rol | Si no está configurado |
| --- | --- | --- |
| **Supabase** | Base de datos (PostgreSQL + RLS) | Caché en memoria con datos semilla |
| **Redis** | Caché de lecturas y límite de peticiones compartido entre servidores | Se salta ese nivel: consulta directa a Supabase y límite por servidor |
| **Clerk** | Cuentas y sesión | Sin escrituras posibles (`401`); lectura pública sigue funcionando |
| **Gemini** | Asistente IA | Directorio local de respaldo |
| **Cloudinary** | CDN de imágenes | Imágenes de `public/images/` |
| **Vercel** | Hosting + funciones + CDN | Alternativas: Node o Docker |
| **CARTO** | Solo lectura opcional de la tarjeta del perfil | El mapa usa OSM/ArcGIS sin clave |

Ninguno es imprescindible para **ver** la app: siempre hay respaldo. Los que
sí aportan capacidades son Supabase (persistencia real) y Clerk (escribir).

---

## 10. Dónde mirar para cada pregunta

| Quiero saber… | Mira |
| --- | --- |
| Qué ve el usuario al usar la app | [`01-flujo-app.md`](01-flujo-app.md) |
| Cómo se despliega y qué comprueba el CI | [`02-flujo-despliegue.md`](02-flujo-despliegue.md) |
| Referencia técnica exhaustiva (API, variables, scripts) | [`README.md`](../../README.md) de la raíz |
| Qué se hizo y qué deuda hay | [`../agentes/README.md`](../agentes/README.md) |
| Decisiones ya tomadas (no reabrirlas sin consenso) | [`../agentes/decisiones.md`](../agentes/decisiones.md) |
