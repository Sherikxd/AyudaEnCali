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

## Stack

| Capa | Tecnologías |
| --- | --- |
| Frontend | React 19 + TypeScript, Vite 8, Tailwind CSS 4, Leaflet, lucide-react |
| Backend | Node.js + Express (tipo `server.ts` ejecutado con `tsx`) |
| IA | Google Gemini (`@google/genai`) |
| Datos | Supabase (PostgreSQL + RLS) con caché en memoria |
| Auth | Clerk (`@clerk/clerk-react`) |
| Calidad | `tsc --noEmit` en modo estricto (`npm run lint`) |

## Arquitectura

```
.
├── server.ts              # API REST + servidor Vite/estático (entry point)
├── server/
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
├── public/images/          # imágenes estáticas (visibles en producción)
├── index.html
├── vite.config.ts
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

## Despliegue

```bash
npm run build   # genera dist/
npm start       # sirve la API y dist/ con NODE_ENV=production
```

El mismo `server.ts` sirve la API y los archivos estáticos, así que basta
con desplegar un único proceso (Cloud Run, Railway, Fly.io…). Configura las
variables de entorno en la plataforma; `PORT` la inyecta el runtime.

Con Supabase configurado, el primer arranque crea las tablas solo (si hay
`SUPABASE_ACCESS_TOKEN`); para cargar los datos iniciales ejecuta una vez
`npm run db:seed`. Las políticas RLS de `supabase/schema.sql` ya protegen
las escrituras de cara al exterior.

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
