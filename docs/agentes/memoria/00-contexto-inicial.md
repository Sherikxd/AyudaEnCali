# Contexto inicial (2026-09-29)

Estado del proyecto cuando empezó a trabajar el equipo de agentes. Si algo de
este documento queda desactualizado, **corrígelo en tu log y aquí**.

## Estado del repositorio

- **Sin commitear** todo el trabajo reciente: likes con sesión de Clerk,
  `AuthModal` montado, FAQ, CTA, 404 real, SEO por pestaña, Open Graph con
  imagen en Cloudinary, consentimiento de cookies, gzip + caché + chunks de
  vendors, imágenes en CDN. Antes de eso, el último commit es `8c8c01e
  tratando likes`.
- **Tests**: `npm run test:ui` en verde con 40 comprobaciones (jsdom + React
  `act()`; monta `ClerkProvider → AppProvider → Header/AuthModal/ReportModal`).
  `npm run verify:rls` en verde (7 aserciones contra un Postgres desechable).
- **Build**: `npx vite build` sin errores; `vendor-react` 207 kB,
  `vendor-clerk` 103 kB, `index` 108 kB, `MapView` 187 kB (+ CSS de Leaflet).
- **Supabase real** conectado (proyecto `mdkyrtrzsptkjwuqrwgf`); `.env`
  completo con claves de Clerk, Gemini, Supabase y `CLOUDINARY_URL`.

## Arquitectura en una página

- **Cliente**: SPA con 4 pestañas (`map`, `blog`, `chat`, `profile`) **sin
  enrutador** (`src/App.tsx`). Estado global único en `src/context/AppContext.tsx`
  (≈25 `useState`, `value` sin memoizar). Code splitting con `React.lazy`.
- **Servidor**: `server.ts` (ESM con `tsx`) + `server/{auth,validation,supabase,middleware,rateLimit,logger}.ts`.
  En dev sirve Vite en modo middleware; en producción sirve `dist/` y devuelve
  `404.html` para cualquier ruta de página inexistente.
- **BD**: `supabase/schema.sql` con 3 tablas (`help_points`, `help_needs`,
  `need_supporters`), RLS habilitado; `need_supporters` **sin políticas** a
  propósito (solo el servidor, con `service_role`). Verificable con
  `npm run verify:rls`.
- **Identidad**: Clerk. El servidor verifica el JWT (`server/auth.ts`) en
  `GET /api/support/mine` y `POST /api/needs/:id/support`; el resto de
  escrituras **no** lo verifica (problema T1).
- **Registro local**: `AuthModal` crea un perfil en `localStorage`
  (`ayudaencali_profile_v3`) con roles `ciudadano/voluntario/coordinador`;
  `ClerkSync` lo pone a cero con la sesión de Clerk. Son **dos identidades
  distintas**: unificar es la decisión de `decisiones.md`.

## Auditoría reciente (resumen)

Tres auditorías (backend, frontend, producto) detectaron, por severidad:

- **Críticas**: escrituras anónimas (3 POST); identidad dual sin reconciliar;
  comentarios solo en RAM (no hay tabla); contador de apoyos con escritura
  absoluta desde caché; `verified: true` forzado y `authorId` del cliente;
  RLS con `auth.uid()` de Supabase siendo el IdP Clerk (inalcanzable); pérdida
  de reportes offline al primer `GET`; inserts cuyo `error` no se comprueba.
- **Altas**: «Cerrar Sesión» no cierra Clerk; contexto sin memoizar; sin
  feedback visible de errores; estado de pestañas perdido al desmontar; `GET`
  sin paginación ni rate limit; chat sin timeout de servidor; sin CORS/CSP;
  sin `PUT/DELETE`; producción con `tsx`.
- **Producto**: roles decorativos (sin permisos), «en vivo» sin refresco,
  contenido sembrado escaso (5 puntos/3 necesidades en servidor), sin
  notificaciones, sin PWA/offline, sin moderación, mono-ciudad e mono-idioma.

## Calendario propuesto

1. **Semana 1 (deuda crítica)** → tablero en `tareas-semana-1.md` (T1-T8 + T0).
2. Semana 2 → verificación por niveles, roles con permisos reales, moderación
   con IA, `PUT/DELETE` y estado `resuelta`.
3. Después → PWA offline, push por barrio, Realtime, landing por barrio, API
   pública, monetización.

## Conexos ya resueltos (no reabrir)

- Apoyos: uno por usuario con sesión, tabla como fuente de verdad, `clockSkewInMs`
  de 60 s por reloj local atrasado (~51 s). Ver `decisiones.md`.
- Cloudinary: `src/config/images.ts` (cloud name público), subida con
  `npm run cdn:upload`, secretos en `.env`.
- Rendimiento: gzip (`compression`), caché inmutable para `/assets`,
  `manualChunks`, Leaflet fuera del `<head>`, `public/` de 2,9 MB a 632 kB.

## Avisos operativos

- **NTP inactivo** en esta máquina (reloj ~51 s atrasado): por eso Clerk exige
  tolerancia de sesgo; no «arregles» quitándola sin sincronizar el reloj.
- `bun.lock` está desactualizado (bun no está instalado): `compression`,
  `@types/compression` y `jsdom` solo están en `package.json`.
- **No hay navegador conectado** a la sesión: la validación visual no es
  posible; usa lint/build/test y humo con `curl`.
- Trabajo sin commitear: **no borres ni reescribas cambios existentes** que no
  reconozcas; son producto de sesiones anteriores.
