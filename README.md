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
  local con roles (`ciudadano`, `voluntario`, `coordinador`).
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
| `VITE_CLERK_PUBLISHABLE_KEY` | Para auth | Clave **pública** de Clerk (prefijo `VITE_` obligatorio) |
| `CLERK_SECRET_KEY` | No | Clave secreta, solo servidor |

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (API + Vite en modo middleware) |
| `npm run build` | Build de producción en `dist/` (con code splitting por pestaña) |
| `npm start` | Sirve `dist/` en modo producción (`NODE_ENV=production`) |
| `npm run preview` | Vista previa del build con `vite preview` |
| `npm run lint` | Comprobación de tipos (`tsc --noEmit`, modo estricto) |
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
| `POST` | `/api/needs/:id/support` | Suma un apoyo (`404` si no existe) |
| `GET` | `/api/comments?pointId=` | Comentarios (de un punto o todos) |
| `POST` | `/api/comments` | Publica un comentario |
| `POST` | `/api/chat` | Mensaje al asistente (Gemini o directorio local) |

Límites: **15 req/min** en `/api/chat` y **60 req/min** por IP en las
escrituras (cabeceras `RateLimit-*`, respuesta `429` al superarlo).

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
   estas dos vías:
   - **Automática:** define `SUPABASE_ACCESS_TOKEN` en `.env`. El servidor
     detecta que faltan las tablas y las crea solo (índices y políticas
     incluidos). Para forzarlo en cualquier momento: `npm run db:setup`.
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

## Enlaces

- App original en AI Studio: https://ai.studio/apps/532e5708-acab-47fc-aa41-77a3fa57ef6f
- Producción: https://ayudaencali.lat
