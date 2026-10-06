# Flujo de la app: qué le pasa a una persona cuando la usa

Este documento describe la app **desde el punto de vista de quien la abre**,
y luego traduce cada paso a lo que ocurre por dentro.

---

## 1. Al abrir la app

1. El navegador descarga `index.html` (una sola página, sin enrutador).
2. Se aplica la elección de cookies guardada: si la persona aceptó las
   cookies opcionales, empiezan a cargarse las tipografías de terceros; si
   no, se usa la pila de fuentes del sistema.
3. Se resuelve la **clave pública de Clerk** (la de autenticación). Puede
   venir del propio bundle o, si no, del servidor en `/api/config`. Si no hay
   ninguna clave, se muestra una pantalla de aviso con instrucciones, nunca
   una pantalla en blanco.
4. Se monta React dentro de un `ErrorBoundary`: si algo revienta, se pinta
   un mensaje de error en lugar de dejar la página vacía.
5. En producción se registra el **Service Worker** (PWA): permite que la app
   se abra y muestre contenido aunque la conexión falle.

```
index.html
   └─ applyConsent()          ← cookies decididas antes de pintar
   └─ resolveClerkPublishableKey()  ← bundle o /api/config
        └─ <ClerkProvider><ErrorBoundary><App/></ErrorBoundary></ClerkProvider>
             └─ registro del Service Worker (solo producción)
```

---

## 2. Las cuatro pestañas

La app no tiene URLs con rutas: se navega por **pestañas** (el hash y una
ruta propia para el FAQ son la excepción). Cada pestaña se descarga solo
cuando la persona la abre (*code splitting*), así el mapa con Leaflet no
paga quien solo quiere leer el tablón.

| Pestaña | Qué hay | Fichero |
| --- | --- | --- |
| **Mapa** | Mapa interactivo de Cali con los centros de ayuda, filtros por categoría (acopio, veterinaria, albergue, salud), búsqueda por barrio/comuna, localización GPS y detalle de cada punto con comentarios | `src/components/MapView.tsx` |
| **Tablón** (`blog`) | Necesidades publicadas por el barrio: urgencia, apoyos (likes), comentarios, ciclo de vida (activa → en proceso → resuelta) | `src/components/BlogView.tsx` |
| **Chat** | Asistente «CaliSolidaria IA», respaldado por los datos reales de la plataforma | `src/components/ChatView.tsx` |
| **Perfil** | Cuenta, barrio, rol, apoyos propios, tarjeta de estado de conexiones, FAQ, privacidad | `src/components/ProfileView.tsx` |

Además:

- **FAQ** en ruta propia `/preguntas-frecuentes/` (acordeón accesible).
- **Encabezado** con botón «?» y CTA «Publicar ayuda».
- **Barra inferior** para cambiar de pestaña en móvil.

---

## 3. Registro e identidad

Hay dos capas que no deben confundirse:

1. **Clerk** = la identidad verificable. Es quien realmente eres para el
   servidor: sin sesión de Clerk no puedes escribir nada.
2. **Perfil local** (nombre, barrio, rol `ciudadano`/`voluntario`/
   `coordinador`) = cómo te presentas en la app. Se guarda en el dispositivo
   y se sincroniza con la sesión de Clerk (`ClerkSync`).

Flujo de una persona que llega sin cuenta y quiere publicar:

```
Clica «Publicar ayuda»
   └─ ¿Sesión de Clerk?  ── no ─→ AuthModal
   │                                ├─ Crear cuenta (registro comunitario)
   │                                └─ Entrar con una cuenta existente
   └─ sí ─→ se abre el reportero (ReportModal)
```

El servidor **nunca** acepta la autoría que manda el cliente en el cuerpo de
la petición: la identidad sale del token (JWT) de Clerk verificado en el
servidor. Si la clave secreta de Clerk falta, esas rutas responden `401`.

---

## 4. El mapa

- **Leaflet** dibuja el mapa con tres capas base (OpenStreetMap, ArcGIS…).
- Los puntos salen de `GET /api/points` y se pintan por categoría, con
  agrupación (*clustering*) cuando hay muchos juntos.
- Filtros por categoría, búsqueda por barrio/comuna y localización GPS del
  dispositivo. Si la persona no da permiso de ubicación (o prefiere), puede
  elegir su barrio a mano (`LocationModal`).
- Cada punto abre su ficha: dirección, estado, comentarios y la posibilidad
  de verificar/desverificar (con permiso de moderación).
- CTA visibles: «Publicar ayuda» (crear punto) y «Ver tablón».

---

## 5. Publicar una necesidad y apoyarla

1. Persona con sesión → `ReportModal` → elige **necesidad** con urgencia
   (alta/media/baja) y barrio.
2. El cliente manda `POST /api/needs` con el token de Clerk.
3. El servidor valida, sanea y guarda en Supabase; responde con la fila
   creada.
4. El tablón la muestra. Cualquier persona con cuenta puede **apoyarla**
   (corazón): `POST /api/needs/:id/support`. Cada cuenta da un solo apoyo
   por necesidad y puede retirarlo; la unicidad la garantiza la base de
   datos, no la interfaz.
5. Los comentarios de un punto van a `POST /api/comments`.

**Ciclo de vida de una necesidad:** `activa` → `en_proceso` → `resuelta`
(con `archivada` como cierre administrativo). Puede editarse o eliminarse
(solo por quien la creó, con sesión).

---

## 6. El asistente de IA

```
Mensaje del usuario ─→ POST /api/chat
                          ├─ ¿hay GEMINI_API_KEY? ─→ Google Gemini
                          │        (con contexto real de la plataforma:
                          │         puntos, necesidades, barrios)
                          └─ no / fallo ─→ directorio local (server/chatFallback.ts)
```

El chat **nunca se queda sin respuesta**: si Gemini no está configurado o
falla, se responde con el directorio local de la propia app. Hay límite de
**15 mensajes/minuto por IP**.

---

## 7. Qué pasa cuando algo falla (resiliencia)

La idea central es una **cadena de respaldos**: ningún servicio único deja
la app en blanco.

| Nivel caído | Qué ocurre | Quién lo cubre |
| --- | --- | --- |
| Gemini | El chat responde con el directorio local | `server/chatFallback.ts` |
| Supabase | La API responde desde la **caché en memoria** (datos semilla de Cali) | `server/store.ts` |
| Servidor (sin internet) | La UI usa lo guardado en `localStorage` y **cola** lo escrito para reintentarlo | `src/utils/storage.ts`, `src/utils/sync.ts` |
| Excepción de React | `ErrorBoundary` pinta un mensaje, no deja pantalla en blanco | `src/components/ErrorBoundary.tsx` |

### Modo sin conexión, paso a paso

1. Al fallar una escritura, el elemento se guarda en el dispositivo con
   bandera `pending` y se ve en la interfaz igual que los demás.
2. Un cola de reenvío reintenta cuando vuelve la conexión.
3. Al recuperar el servidor, las listas se **funden por `id`**
   (`mergeById`): lo remoto manda (es la verdad de la base de datos), lo
   local pendiente se conserva, y el contenido de ejemplo no se duplica.
4. Un rechazo permanente del servidor se marca `syncFailed` y se ofrece
   «Reintentar» / «Descartar» en un toast, en vez de reintentar para siempre.

---

## 8. El recorrido completo de una escritura

Ejemplo real: publicar un punto de acopio.

```
ReportModal (React)
  └─ AppContext.addPoint()
       └─ src/services/api.ts   → fetch con timeout (AbortController)
            └─ adaptador del entorno:
                 • Express  → server/app.ts → server/handlers/points.ts
                 • Vercel   → api/points.ts → (mismo) handlers/points.ts
                      ├─ rate limit (60 escrituras/min por IP)
                      ├─ verifica JWT de Clerk
                      ├─ valida y sanea el payload
                      └─ escribe en Supabase (service_role)
                           └─ si falla: caché en memoria → 503 con aviso
  ← respuesta: la fila creada, que AppContext añade a la lista y guarda
```

Las lecturas (`GET /api/points`, `GET /api/needs`) siguen el mismo camino al
revés y terminan en el JSON que pinta la interfaz.

---

## 9. Roles y moderación

| Rol | Qué puede hacer |
| --- | --- |
| `ciudadano` | Consultar, publicar, apoyar, comentar |
| `voluntario` | Lo mismo, con visibilidad de colaborador |
| `coordinador` | Además: verificar/desverificar puntos y ver la cola de reportes (`GET`/`POST /api/reports`) |

Los datos nacen **sin verificar**: el badge «verificado» se gana, no se
regala. El servidor exige sesión y permiso de moderación para esas rutas.

---

## 10. Extras que una persona nota

- **Cookies**: banner con elección `all`/`essential`, reversible desde el
  perfil y desde el FAQ. Sin aceptar, no se cargan recursos de terceros
  (tipografías).
- **SEO y compartir**: título y descripción por pestaña, tarjeta Open
  Graph/Twitter 1200×630, favicon, `sitemap.xml` y `robots.txt`.
- **404 real**: cualquier URL inexistente devuelve `404.html` con estado
  HTTP 404 (no el shell de la app con 200).
- **Imágenes**: se sirven desde un CDN (Cloudinary) ya convertidas a
  WebP/AVIF y comprimidas.
- **Avisos (toasts)**: mensajes con `aria-live`, visibles también con lector
  de pantalla.
