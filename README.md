<div align="center">

# AyudaEnCali

**Plataforma comunitaria de emergencias para Santiago de Cali**

Mapa interactivo + tablón de necesidades + asistente de IA (`CaliSolidaria IA`)
para ubicar en tiempo real centros de acopio, veterinarias, albergues y
puntos de salud, y para publicar lo que el barrio necesita.

</div>

---

## Características

- **Mapa interactivo** (Leaflet) con 3 capas base, filtros por categoría
  (acopio, veterinaria, albergue, salud), búsqueda por barrio/comuna y
  localización GPS del usuario (con selección manual de barrio como respaldo).
- **Reporte de puntos y necesidades**: cualquier persona registrada puede
  crear un centro en el mapa o publicar una necesidad urgente en el tablón.
- **Asistente IA** con Gemini (`CaliSolidaria IA`) respaldado por los datos
  reales de la plataforma; si Gemini no está disponible responde con un
  directorio local, así **el chat nunca queda caído**.
- **Comentarios por punto** para mantener actualizado cada centro.
- **Persistencia en dos niveles**: Supabase (PostgreSQL) con caché en memoria
  y `localStorage` como respaldo; la app sigue funcionando sin conexión a BD.
- **Autenticación** con Clerk (inicio de sesión) + registro comunitario
  local con roles (`ciudadano`, `voluntario`, `coordinador`); el modal de
  registro también deja **entrar con una cuenta existente** en vez de crear
  una nueva.
- **Directorio de emergencias** de Cali (123, 132, 119, 144, 125…).
- **Preguntas frecuentes** (`FaqModal`): acordeón accesible con respuestas
  sobre cuentas, reportes, apoyos, el asistente, los datos y la privacidad.
  Se abre desde el botón «?» del encabezado, desde el perfil y desde el aviso
  de cookies (que entra directo en la sección «Cookies y privacidad»).
- **CTA claro en el mapa**: «Publicar ayuda» / «Ver tablón» con la misma
  guarda de cuenta que el resto de la app.
- **404 personalizada** (`public/404.html`, autocontenida y con `noindex`)
  servida con estado **404 real** en desarrollo y producción: una URL
  inexistente ya no devuelve el shell de la SPA con código 200.
- **SEO y compartir**: título y descripción por pestaña
  (`src/utils/seo.ts`), Open Graph y Twitter Card completos con imagen
  1200×630, favicon SVG e icono para pantalla de inicio.
- **Consentimiento de cookies**: banner con elección persistente
  (`all` / `essential`) reversible desde el FAQ; las tipografías de terceros
  solo se cargan si se aceptan.
- **Imágenes servidas por CDN (Cloudinary)**: héroe, tarjetas del tablón y
  vista previa social salen de `res.cloudinary.com` con `f_auto,q_auto,w_*`;
  las URLs viven en `src/config/images.ts` y la subida es `npm run cdn:upload`
  (los secretos de la cuenta solo en `.env`).

## Stack

| Capa | Tecnologías |
| --- | --- |
| Frontend | React 19 + TypeScript, Vite 8, Tailwind CSS 4, Leaflet, lucide-react |
| Backend | Node.js + Express (`server.ts` con `tsx`; en Vercel, la función `api/index.ts`) |
| IA | Google Gemini (`@google/genai`) |
| Datos | Supabase (PostgreSQL + RLS) con caché en memoria |
| Auth | Clerk (`@clerk/clerk-react`) |
| Calidad | `tsc --noEmit` en modo estricto (`npm run lint`) |

## Arquitectura

```
.
├── server.ts              # entry local/Docker/Cloud Run: Vite/estático + listen
├── server/
│   ├── app.ts             # app Express compartida (API + rutas) · la que usa Vercel
│   ├── middleware.ts       # headers de seguridad, 404, errores, asyncHandler
│   ├── rateLimit.ts        # limitador de tasa por IP (en memoria)
│   ├── validation.ts       # validación/saneamiento de todos los payloads
│   ├── seedData.ts         # datos semilla de Cali (fallback sin BD)
│   ├── supabase.ts         # cliente Supabase: reintentos, sondeo del esquema, mappers
│   ├── schemaAdmin.ts      # aplica el esquema con la Management API (opcional)
│   ├── schema.ts           # lee supabase/schema.sql y lo sirve en /api/supabase/sql
│   └── logger.ts           # logging con niveles
├── supabase/
│   └── schema.sql          # DDL idempotente + políticas RLS (fuente única)
├── scripts/
│   ├── apply-schema.ts     # npm run db:setup → crea las tablas vía Management API
│   ├── seed-db.ts          # npm run db:seed  → carga los datos iniciales
│   └── verify-rls.sh       # valida el esquema y las políticas en un PG temporal
├── src/
│   ├── components/         # vistas y modales (MapView, BlogView, ChatView…)
│   │   └── ClerkSync.tsx   # sincroniza la sesión de Clerk con el perfil local
│   ├── context/AppContext.tsx  # estado global + sincronización con la API
│   ├── services/
│   │   ├── api.ts          # cliente HTTP tipado con timeout y errores uniformes
│   │   └── geminiService.ts# llamada al asistente con respaldo local
│   ├── data/               # datos iniciales y barrios de Cali
│   ├── types/index.ts      # dominio + contrato de la API (compartido)
│   └── utils/              # logger, storage seguro, escape de HTML
├── api/
│   └── index.ts           # función de Vercel: exporta la app como default
├── public/images/          # imágenes estáticas (visibles en producción)
├── index.html
├── vite.config.ts
├── vercel.json             # Vercel: build (Vite → dist), rewrites de /api, caché
├── Dockerfile               # multi-stage: build con Vite + imagen mínima de runtime
├── .dockerignore            # sin .env (secretos) ni node_modules dentro de la imagen
└── tsconfig.json           # strict + noUnusedLocals/Parameters
```

**Flujo de datos:** componente → `AppContext` → `src/services/api.ts` →
`server.ts` → Supabase. Si Supabase falla, el servidor responde desde la
caché en memoria; si el navegador no puede contactar al servidor, la UI usa
lo guardado en `localStorage`. En ningún caso la app se queda en blanco.

## Requisitos

- Node.js **20 o superior**
- (Opcional) claves de Supabase, Gemini y Clerk para activar cada servicio

## Instalación

```bash
# 1. Dependencias
npm install                  # o: bun install

# 2. Variables de entorno
cp .env.example .env               # y completa tus claves

# 3. Arranque en desarrollo (Vite + API en el mismo puerto)
npm run dev
```

La app queda disponible en `http://localhost:3000`.

## Variables de entorno

Todas se definen en `.env` (nunca se versiona; `.env.example` es la
plantilla). El servidor las lee con `dotenv`; el navegador solo recibe las
que empiezan con `VITE_`.

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `PORT` | No (3000) | Puerto del servidor |
| `NODE_ENV` | No | `production` sirve `dist/`, si no Vite en dev |
| `GEMINI_API_KEY` | Para IA | Habilita al asistente; si falta usa directorio local |
| `GEMINI_MODEL` | No | Modelo a usar (`gemini-3.8-flash` por defecto) |
| `SUPABASE_URL` | Para BD | Proyecto Supabase; si falta, caché en memoria |
| `SUPABASE_ANON_KEY` | Para BD | Clave pública |
| `SUPABASE_SERVICE_ROLE_KEY` | Recomendada | Escrituras desde el servidor (nunca en el cliente) |
| `SUPABASE_ACCESS_TOKEN` | No | Token de gestión: el servidor crea las tablas si faltan (`npm run db:setup`) |
| `CARTO_API_KEY` | No | Capa base del mapa |
| `VITE_CLERK_PUBLISHABLE_KEY` | Para auth | Clave **pública** de Clerk. El servidor la lee en runtime y la sirve en `/api/config` (sin recompilar); si además va como `--build-arg`, queda horneada en el bundle |
| `CLERK_PUBLISHABLE_KEY` | No | Alias sin prefijo `VITE_` de la misma clave (también aceptado por el servidor) |
| `CLERK_SECRET_KEY` | Sí (auth) | Clave secreta, **solo servidor**. Verifica las sesiones que exigen cuenta (apoyos). Si falta, el resto de la app funciona pero `/api/support/*` y `POST /api/needs/:id/support` responden `401` |
| `CLOUDINARY_URL` | Para CDN | URL de cuenta (`cloudinary://clave:secreto@nube`) que usa **solo** `npm run cdn:upload`. El cliente nunca la ve: conoce el *cloud name* público de `src/config/images.ts` |

> **Aviso sobre `VITE_*`**: esas variables se leen **al compilar** (`vite
> build`) y quedan escritas en el JavaScript estático; definirlas después en
> Cloud Run/Vercel no las mete en el bundle. Por eso la clave de Clerk tiene
> doble vía: el servidor la expone en `/api/config` (runtime) y `main.tsx`
> la usa antes de montar `<ClerkProvider>`. Cualquier otra variable `VITE_*`
> nueva que agregues **sí** requerirá recompilar.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (API + Vite en modo middleware) |
| `npm run build` | Build de producción en `dist/` (con code splitting por pestaña) |
| `npm start` | Sirve `dist/` en modo producción (`NODE_ENV=production`) |
| `npm run preview` | Vista previa del build con `vite preview` |
| `npm run lint` | Comprobación de tipos (`tsc --noEmit`, modo estricto) |
| `npm run test:ui` | Test interactivo del modal de registro en jsdom (sin navegador) |
| `npm run verify:rls` | Valida `supabase/schema.sql` y sus políticas RLS en un Postgres desechable |
| `npm run db:setup` | Crea/actualiza las tablas de Supabase con la Management API |
| `npm run db:seed` | Carga los datos iniciales (5 puntos, 3 necesidades); idempotente |
| `npm run cdn:upload` | Sube `public/images/` a Cloudinary y reescribe las `image_url` de Supabase. Acepta `--dry-run` y `--skip-db` |
| `npm run clean` | Elimina `dist/` |

## API

Todas las rutas viven bajo `/api`, validan su cuerpo y responden errores en
formato `{ "error": string, "details"?: string[] }`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Salud del servicio |
| `GET` | `/api/config` | Estado de integraciones (sin secretos): incluye `supabaseTablesReady` y `supabaseHint` |
| `GET` | `/api/supabase/sql` | Esquema SQL (contenido de `supabase/schema.sql`) |
| `GET` | `/api/points` | Centros de ayuda (Supabase o caché) |
| `POST` | `/api/points` | Crea un punto (validado, `400` si no pasa) |
| `GET` | `/api/needs` | Necesidades publicadas |
| `POST` | `/api/needs` | Crea una necesidad |
| `POST` | `/api/needs/:id/support` | Apoya (`add`) o retira (`remove`) el apoyo. **Exige sesión** (`401`); `400` si `action` no es válida, `404` si no existe. Devuelve `{ success, count, supported }` |
| `GET` | `/api/support/mine` | IDs de las necesidades que apoyó la cuenta actual. **Exige sesión** (`401`) |
| `GET` | `/api/comments?pointId=` | Comentarios (de un punto o todos) |
| `POST` | `/api/comments` | Publica un comentario |
| `POST` | `/api/chat` | Mensaje al asistente (Gemini o directorio local) |

Límites: **15 req/min** en `/api/chat` y **60 req/min** por IP en las
escrituras (cabeceras `RateLimit-*`, respuesta `429` al superarlo).

**Rutas con sesión:** las marcadas como *exigen sesión* reciben el token de
Clerk en la cabecera `Authorization: Bearer <token>` (en el cliente,
`useAuth().getToken()` de `@clerk/clerk-react`). El servidor lo verifica
contra las claves JWKS de Clerk con `CLERK_SECRET_KEY`; sin esa variable en
el entorno, esas rutas responden `401` y dejan un aviso en el log. El ID del
usuario nunca lo manda el cliente: sale del claim `sub` del JWT validado.

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/points \
  -H 'Content-Type: application/json' \
  -d '{"name":"Punto de Acopio Barrio","category":"acopio","lat":3.44,"lng":-76.54,
       "address":"Calle 1 # 2-3","barrio":"San Antonio"}'
```

## Base de datos

1. Crea un proyecto en Supabase y copia las credenciales a `.env`
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
2. Crea el esquema (idempotente: repetirlo **nunca** borra datos) con una de
   estas dos vías. Crea tres tablas: `help_points`, `help_needs` y
   `need_supporters` (los apoyos individuales), más sus índices y políticas:
   - **Automática:** define `SUPABASE_ACCESS_TOKEN` en `.env`. El servidor
     detecta que falta **cualquiera** de las tres (incluida una tabla nueva
     al actualizar la app) y crea/actualiza el esquema solo. Para forzarlo en
     cualquier momento: `npm run db:setup`.
   - **Manual:** pega `supabase/schema.sql` en el **SQL Editor** de Supabase
     (también lo sirve `GET /api/supabase/sql`).
3. El servidor sondea el esquema al arrancar y repite el sondeo cada 30 s
   mientras algo falle. El resultado se ve en `GET /api/config`
   (`supabaseTablesReady` + `supabaseHint`) y en la tarjeta
   **Conexión en Producción** del perfil.
4. Cuando las tablas responden, `GET /api/points` cambia a
   `"source": "supabase"` sin reiniciar nada.
5. (Opcional) Carga los datos iniciales con `npm run db:seed`. Sin ellos, la
   app muestra los datos semilla **en memoria** hasta que exista al menos una
   fila en la base; a partir de ahí la base manda.

### Políticas RLS

| Política | Rol | Alcance |
| --- | --- | --- |
| Lectura pública | cualquiera | `SELECT` en `help_points` y `help_needs` |
| Inserción autenticada | `authenticated` | `INSERT` con `auth.uid() NOT NULL` |
| Actualización autenticada | `authenticated` | `UPDATE` en ambas tablas |
| Eliminación | — | sin política: no se puede borrar vía API |
| `need_supporters` | — | RLS activo y **sin políticas**: solo el backend (`service_role`) lee o escribe; ni `anon` ni `authenticated` ven quién apoyó qué |

El backend escribe con `SUPABASE_SERVICE_ROLE_KEY`, que **bypasea RLS**: las
operaciones de la app no dependen de las políticas, que funcionan como
defensa en profundidad para quien llegue directo a la API de Supabase.
Si solo configuras la `SUPABASE_ANON_KEY`, los `INSERT` del servidor serán
rechazados por diseño y quedará un aviso en el log.

> `help_points.author_id` guarda el identificador de **Clerk** (`user_…`), no
> un `auth.uid()` de Supabase, por eso las políticas exigen estar autenticado
> pero no comparan autoría. Si en el futuro usas Auth de Supabase, puedes
> endurecerlas con `auth.uid()::text = author_id`.

Puedes comprobar todo lo anterior **sin tocar tu proyecto** con un Postgres
local: `npm run verify:rls` levanta un clúster temporal, aplica el esquema dos
veces y comprueba quién puede leer, insertar y borrar.

### Apoyos (likes)

- Solo quien tiene **cuenta** puede apoyar: el servidor exige el token de
  Clerk en `Authorization` y lo verifica; sin sesión responde `401` (en la
  UI, el corazón está apagado y dice "inicia sesión").
- Cada cuenta da **un solo apoyo** por necesidad y puede retirarlo. La
  unicidad la garantiza la clave primaria `(need_id, user_id)` de
  `need_supporters`, no una comprobación de la aplicación: repetir `add` no
  duplica filas ni suma dos veces, y `remove` nunca deja el contador en
  negativo.
- `help_needs.supporters_count` sigue siendo el contador visible (incluye
  los apoyos históricos que no tienen usuario asociado) y **solo cambia**
  cuando se inserta o borra una fila en `need_supporters`.
- `GET /api/support/mine` devuelve los IDs apoyados por la cuenta actual
  (para pintar el corazón relleno); nunca se filtra en las rutas públicas
  qué usuario apoyó qué.
- Sin base de datos disponible, el mismo conmutador funciona sobre la caché
  en memoria (se pierde al reiniciar, igual que el resto de esa caché).

## Mejores prácticas aplicadas

**Seguridad**

- Ningún secreto en el código ni en el bundle: las claves viven en `.env`
  y `/api/config` solo expone si un servicio está configurado (nunca la clave).
- Validación y saneamiento de **todo** el cuerpo de las peticiones
  (`server/validation.ts`): tipos, rangos, longitudes y enums permitidos.
- Limitador de tasa por IP y tamaño máximo de cuerpo JSON (`1mb`).
- Cabeceras de seguridad (`nosniff`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` con geolocalización propia) y `x-powered-by` deshabilitado.
- Escape de HTML en los popups de Leaflet que muestran texto externo.
- Errores de API sin stack traces; logs detallados solo en el servidor.

**Robustez**

- Cliente HTTP único con timeout (`AbortController`) y errores tipados.
- Adaptador Supabase (`server/supabase.ts`): timeout de 8 s por petición,
  reintentos solo en fallos transitorios, errores clasificados
  (`missing` / `auth` / `transient`) y degradación automática de la
  `SERVICE_ROLE_KEY` a la `ANON_KEY`.
- Creación automática del esquema con la Management API cuando el sondeo
  detecta que faltan las tablas (token opcional, 3 intentos por proceso,
  intervalo de 10 min y jamás registrado en los logs).
- Fallbacks en cadena: Gemini → directorio local; Supabase → caché; API →
  `localStorage`. La UI nunca depende de un solo servicio.
- `ErrorBoundary` en la raíz: una excepción no deja la pantalla en blanco.
- Cierre ordenado del servidor ante `SIGINT`/`SIGTERM`.
- Datos semilla locales: la app es utilizable sin credenciales.

**Código**

- TypeScript en modo estricto + `noUnusedLocals`/`noUnusedParameters`
  (`npm run lint` debe pasar antes de mergear).
- Test interactivo de UI sin navegador (`npm run test:ui`): jsdom monta el
  árbol real (Clerk → contexto → `Header`/`AuthModal`/`ReportModal`) y
  simula los clics: abrir con *Reportar Ayuda*, cerrar con `Escape` o
  *Cancelar* sin disparar la acción pendiente, validación del formulario,
  alta de cuenta que ejecuta el callback y apertura directa del reportero
  cuando ya hay cuenta.
- Tipos compartidos entre cliente y servidor (`src/types/index.ts`) como
  contrato único de la API; sin `any` en el código de la aplicación.
- Validadores, mappers y logs en módulos pequeños y reutilizables.
- Loggers propios en cliente y servidor (en producción solo se propagan
  errores) en lugar de `console.*` sueltos.
- `localStorage` centralizado con lectura/escritura a prueba de fallos.
- Code splitting por pestaña con `React.lazy` + `Suspense`.
- Imágenes en `public/` para que funcionen también en el build de producción.
- `useEffect` de sincronización con limpieza (`cancelled`) para evitar
  actualizaciones de estado tras desmontar.
- `ClerkSync` mantiene perfil local y ubicación alineados con la sesión de
  Clerk: valida la metadata antes de usarla y solo escribe cuando algo cambió.

**Rendimiento**

- Gzip (`compression`) para JS/CSS/HTML/JSON en todo el tráfico: el bundle
  principal baja de ~408 kB a ~108 kB en la red.
- Caché por tipo de archivo: `/assets/*` **inmutable por 1 año** (los nombres
  llevan hash), imágenes una semana y el HTML nunca cacheado.
- Leaflet y sus estilos viajan con el chunk del mapa (antes un `<link>` a un
  CDN bloqueaba el render de *todas* las pestañas); las tipografías de terceros
  se inyectan desde JS, fuera del `<head>` crítico.
- `manualChunks` para React y Clerk: desplegar no invalida la caché de los
  vendors, y las vistas siguen cargándose con `React.lazy` por pestaña.
- Imágenes comprimidas con `ffmpeg` (≈2,9 MB → ≈0,6 MB en `public/`) y tarjetas
  del tablón con `width`/`height`, `loading="lazy"` y `decoding="async"` para
  evitar saltos de layout.
- **CDN de imágenes (Cloudinary)**: el héroe (w_1600), las tarjetas (w_900) y
  la vista previa social (JPEG 1200×630) se entregan con `f_auto,q_auto`, así
  un navegador moderno recibe WebP/AVIF (p. ej. 81 kB → 59 kB en la tarjeta)
  desde un borde de red cercano en vez de desde el contenedor de la app.

**SEO, compartir y privacidad**

- `<title>` y `description` por pestaña actualizados en cada cambio de vista,
  junto con `og:title`/`og:description` y sus equivalentes de Twitter.
- `og:image` (1200×630), favicon SVG, icono de inicio y `theme-color`.
- La 404 se marca `noindex` y enlaza al mapa y al FAQ
  (`/#preguntas-frecuentes`, que abre el modal al cargar).
- Cookies: solo hay recursos de terceros si la persona los acepta; la elección
  vive en `localStorage` y se puede cambiar desde el perfil o el FAQ.

## Despliegue

```bash
npm run build   # genera dist/
npm start       # sirve la API y dist/ con NODE_ENV=production
```

El mismo `server.ts` sirve la API y los archivos estáticos, así que basta
con desplegar un único proceso (Cloud Run, Railway, Fly.io…). Configura las
variables de entorno en la plataforma; `PORT` la inyecta el runtime.
Para **Vercel** (gratis) hay una sección propia debajo: ahí el proceso no lo
monta `server.ts`, sino **una función por ruta** (`api/*.ts`), todas
compiladas desde los mismos núcleos de `server/handlers/`.

Con Supabase configurado, el primer arranque crea las tablas solo (si hay
`SUPABASE_ACCESS_TOKEN`); para cargar los datos iniciales ejecuta una vez
`npm run db:seed`. Las políticas RLS de `supabase/schema.sql` ya protegen
las escrituras de cara al exterior.

### Vercel (plan Hobby, gratis)

La API se despliega como **una función por ruta**: cada `api/*.ts` envuelve
con `createApiRoute()` un núcleo de `server/handlers/` (el mismo código que
ejecuta Express), y `vercel.json` reescribe las rutas de la app a su
función. **Docker y Cloud Run no cambian**: siguen arrancando `server.ts`.

Funciones y rutas (los métodos no listados responden `404` JSON, igual que
Express):

| Función (`api/…`) | Ruta de la app | Métodos |
| --- | --- | --- |
| `health.ts` | `GET /api/health` | GET |
| `config.ts` | `GET /api/config` | GET |
| `sql.ts` | `GET /api/supabase/sql` | GET |
| `points.ts` | `GET · POST /api/points` | GET, POST |
| `needs.ts` | `GET · POST /api/needs` | GET, POST |
| `needs-support.ts` | `POST /api/needs/:id/support` (el `id` llega como `?id=` gracias al rewrite) | POST |
| `support-mine.ts` | `GET /api/support/mine` | GET |
| `comments.ts` | `GET · POST /api/comments` | GET, POST |
| `chat.ts` | `POST /api/chat` | POST |
| `index.ts` | cualquier otra `…/api/*` | → **404 JSON** |

Los rewrites de `vercel.json` van de lo específico al catch-all
(`/api/supabase/sql`, `/api/support/mine`, `/api/needs/:id/support`,
`/api/:path*` → `/api/index`) y arrastran `_orig=<ruta canónica>` para que
los mensajes `Ruta no encontrada:` sean idénticos a los de Express. El
fichero `api/index.ts` **no** exporta la app Express (solo el 404).

Pasos:

1. Sube el repositorio a GitHub **sin `.env`** (ya está en `.gitignore`).
2. En [vercel.com/new](https://vercel.com/new) → *Import Git Repository* →
   selecciona el repo y dale nombre. Con `framework: "vite"` en `vercel.json`
   Vercel construye el frontend (`npm install` + `vite build` → `dist/`) y
   además empaqueta **las 10 funciones** de `api/`.
3. Antes del primer deploy, en *Project → Settings → Environment Variables*
   añade las variables de la tabla de abajo.
4. *Deploy* y comprueba el humo (o déjalo en manos del CI, ver abajo):
   - `/api/health` → `200 {"status":"ok",…}`
   - `/api/config` → `200` con `clerkPublishableKey`
   - `/api/supabase/sql` → `200` (ruta de dos niveles: es la que obliga al
     rewrite de `vercel.json`)
   - `POST /api/needs/<id>/support` → `401` sin sesión (**no** `404`: comprueba
     que el rewrite entrega el `id`)
   - `/api/needs-support`, `/api/support-mine` → `404` en JSON (espejos
     bloqueados, igual que Express)
   - `/api/ninguna` → `404` en JSON (`Ruta no encontrada: GET /ninguna`,
     desde el fallback `api/index.ts`)
   - `/ruta-inexistente` → `404` con `dist/404.html`
   - `/assets/*.js` → `cache-control: public, max-age=31536000, immutable`

   Todo eso (más cuerpo JSON malformado → `400`, contenido no-JSON → `400`
   con `details: {}`, y paridad de mensajes de error) está automatizado:

   ```bash
   npm run smoke:vercel                 # humo hermético en local (35 checks)
   SMOKE_BASE_URL=https://<app>.vercel.app npm run smoke:vercel   # contra un deploy real
   ```

   El script fuerza `VERCEL=1` por defecto (sin leer `.env`); pasa
   `SMOKE_WITH_ENV=1` si quieres el humo local con tus variables reales.

> **Gate antes de desplegar**: `.github/workflows/ci.yml` ejecuta en cada
> push/PR `npm run lint` → `npx vite build` → `npm run test:ui` →
> `npm run smoke:vercel` (y `npm run verify:rls` solo si cambió
> `supabase/schema.sql`). Vercel solo corre `vite build`, así que este
> workflow es lo que impide subir a producción con tipos o tests rotos.

Variables de entorno en Vercel (panel, *Environment Variables*):

| Variable | Build | Runtime | Para qué |
| --- | :-: | :-: | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ | ✅ | Clave pública de Clerk: **horneada en el bundle** (prefijo `VITE_`, se lee en `vite build`) y además la sirve `/api/config` en runtime |
| `CLERK_SECRET_KEY` | – | ✅ | Solo servidor: verifica el JWT. Sin ella, apoyos y escrituras responden `401` |
| `CLERK_PUBLISHABLE_KEY` | – | ✅ | Alias sin `VITE_` aceptado por `/api/config` si no está la otra |
| `SUPABASE_URL` | – | ✅ | Proyecto Supabase. Sin él, la API responde desde la caché en memoria |
| `SUPABASE_SERVICE_ROLE_KEY` | – | ✅ | Escrituras del servidor (nunca en el cliente) |
| `SUPABASE_ANON_KEY` | – | ✅ | Respaldo si falta la de servicio |
| `SUPABASE_ACCESS_TOKEN` | – | Opcional | Management API: el servidor crea las tablas si faltan |
| `GEMINI_API_KEY` | – | ✅ | Habilita al asistente; sin ella usa el directorio local |
| `GEMINI_MODEL` | – | Opcional | Modelo a usar (`gemini-3.8-flash` por defecto) |
| `CARTO_API_KEY` | – | Opcional | Capa base del mapa |
| `APP_URL` | – | Opcional | Hoy solo está en `.env.example`; el código no la lee |

**No hace falta** `PORT` (la función no escucha), `NODE_ENV` (Vercel pone
`production`) ni `CLOUDINARY_URL` (solo la usa `npm run cdn:upload`, en local).
Define las variables tanto en *Production* como en *Preview* si vas a probar
deploys de rama.

Detalles del despliegue:

- **Plan Hobby = uso no comercial**: 100 GB de tráfico, 1 M de peticiones de
  borde, 1 M de invocaciones de función, 4 CPU-h, 300 s por función y unos
  100 builds al día. Suficiente para el proyecto, pero no permite monetizar.
  Además limita a **12 funciones por deployment**: con las 10 actuales quedan
  2 de margen.
- **Escalado y cold starts**: cada función se instancia por su cuenta, así
  que un pico en `/api/chat` no arrastra al resto. El coste es que la
  primera petición de cada función tras un despliegue (o tras la pausa por
  inactividad) paga su propio *cold start* (~250-500 ms de arranque del
  módulo: dotenv, cliente Supabase y límites en memoria) en lugar de uno
  solo compartido.
- **Rate limit y cachés son por función**: viven en memoria y cada función
  tiene la suya (mismo `max`, distinta cuenta). Fluid conserva las
  instancias entre peticiones calientes; un *cold start* vacía la caché y
  reinicia los contadores: no pierde datos porque la fuente de verdad es
  Supabase. La consecuencia práctica es que **el límite global de Express se
  convierte en límites independientes por función**:

  | Límite | Express (un proceso) | Vercel (una función por ruta) |
  | --- | --- | --- |
  | Escrituras (`writeLimiter`, 60/min por IP) | **una sola cuenta** compartida por las 4 rutas (`points`, `needs`, `needs/:id/support`, `comments`): 60 escrituras/min en total | **4 cuentas independientes** → hasta 60/min *por ruta*, o sea 240/min en total |
  | Asistente (`chatLimiter`, 15/min por IP) | 15/min en `/api/chat` | idéntico: `chat.ts` es su propia función |

  Es decir, en Vercel es *más permisivo* (cuatro veces más escrituras por
  minuto permitidas al mismo IP) pero nunca más restrictivo: nadie que
  funcionaba en Express deja de funcionar. Si quieres endurecerlo, sube el
  `max` de `writeLimiter` en `server/limiters.ts` (afecta a ambos entornos)
  o añade un *middleware* de borde en `vercel.json`.
- **Los estáticos los sirve el CDN** desde `dist/` (`express.static` se
  ignora en Vercel): las cabeceras de `/assets` y de imágenes las pone
  `vercel.json`, con la misma caché que antes.
- **404**: `public/404.html` se copia a `dist/404.html` con `vite build` y
  Vercel lo sirve con estado **404** cuando la ruta no coincide con ningún
  fichero (misma regla que GitHub Pages). No hay *rewrite* de SPA a propósito:
  la app no tiene enrutador. Los 404 de `/api/*` sí son JSON, desde la
  función `api/index.ts`.
- **`compression()` se omite en Vercel** (en `server/app.ts`, bajo la guarda
  `!process.env.VERCEL`): el borde ya comprime y ahorra CPU de las 4 CPU-h.
- **Espejos de filesystem bloqueados**: `/api/sql`, `/api/support-mine` y
  `/api/needs-support` coinciden con el nombre de un fichero de `api/`, así
  que Vercel los sirve *sin pasar por los rewrites*. Para que respondan igual
  que en Express, cada núcleo comprueba que la petición llegó por su ruta
  canónica y, si no, devuelve **404 JSON** (`server/handlers/supportMine.ts`
  y `needsSupport.ts`, con el flag `req.rewritten` que marca
  `server/vercel.ts`). El cliente solo usa las rutas canónicas de la tabla.

### Docker

El `Dockerfile` es multi-stage: el frontend se compila con Vite y la imagen
final solo lleva dependencias de producción + el árbol mínimo que necesita
el servidor (`dist/`, `server*`, `supabase/`, `scripts/`).

```bash
# 1) Construir. La clave pública de Clerk NO hace falta aquí: si no va como
#    build-arg, se define como variable de entorno al ejecutar (el servidor
#    la sirve en /api/config). Opcional, para hornerla en el bundle:
#      docker build -t ayudaencali --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx .
docker build -t ayudaencali .

# 2) Ejecutar. Los secretos llegan en tiempo de ejecución.
docker run --rm -p 3000:3000 --env-file .env ayudaencali

# 3) (Opcional) esquema y datos usando la propia imagen, una sola vez.
docker run --rm --env-file .env ayudaencali node --import tsx scripts/apply-schema.ts
docker run --rm --env-file .env ayudaencali node --import tsx scripts/seed-db.ts
```

Detalles del contenedor:

- **Sin secretos horneados**: `.dockerignore` excluye `.env`; solo se inyecta
  la clave pública de Clerk (que además es pública por definición).
- **Un único proceso como PID 1** (`node --import tsx`, no `npm start`), así
  que `docker stop` / Cloud Run envían SIGTERM y el servidor cierra las
  peticiones en curso antes de salir (código 0).
- **Usuario sin privilegios** (`USER node`) y `HEALTHCHECK` contra
  `/api/health`.
- Si algún día añades `package-lock.json`, la build pasa sola de
  `npm install` a `npm ci` (reproducible).

## Enlaces

- Producción: https://ayudaencali.lat
