# Auditoría de objetivos y tareas — Copilot (2ª pasada de planificación) · 2026-10-01

> Salida de `copilot -p` como auditor principal. Leyó estado actual, logs
> 17-26, tableros, auditorías y el código con la ronda T21-T26 ya aplicada.
> Entrada del tablero T27-T33.

## ⚠️ Notas de validación del coordinador (antes de ejecutar)

1. **T31 está bloqueada por la persona**: no hay credenciales del cluster
   S3 todavía (`S3_*` vacías en `.env`) → se asigna como `⛔ bloqueada`.
2. **T33 está parcialmente obsoleta**: «FEAT-08 proximidad» y «FEAT-04
   alertas locales» ya se hicieron como **T25 (MEJ-02)** y **T26 (MEJ-03)**.
   Queda del backlog real: FEAT-03 (landings), FEAT-06 (API versionada),
   FEAT-10 (realtime), FEAT-12 (métricas) + notificaciones *push* (lo que
   FEAT-04 tenía pendiente). Se mantiene como «solo si hay capacidad» pero
   con ese alcance corregido.
3. **Grupo A con conflicto**: T28 y T31 son ambas de agente-backend; no
   corren en paralelo salvo dividir ficheros (T28 → `server/**`+
   `supabase/**`; T31 → `scripts/**`). Como T31 queda bloqueada, el grupo
   no conflicta en la práctica.
4. **T27** exige commit+push de la persona para el deploy NUEVO; sí se puede
   lanzar ya contra el deploy actual (contiene los hotfixes de la semana 1)
   para cerrar los ítems P1-1/P1-2/KO-3/KO-4 heredados.

---

## 1. Estado honesto

| Estado | Qué está verde | Qué está amarillo | Qué está rojo |
|---|---|---|---|
| Verde | `package.json` ya tiene `test:server`, `smoke:vercel`, `export:s3`; `vercel.json` ya tiene rewrites y CSP; `.github/workflows/ci.yml` ya ejecuta `lint`, `vite build`, `test:ui`, `smoke:vercel` y condicionalmente `verify:rls`; `server/app.ts` ya monta `PATCH/PUT/DELETE` de necesidades/puntos; `src/context/AppContext.tsx` ya tiene `failed`/`retry`/`discard` y `needAlertsEnabled` persistente; `scripts/export-s3.ts` exporta a S3 compatible y se auto-verifica. | Falta el humo real contra producción; T7 verificación/moderación, T11 semilla única y T15 PWA siguen pendientes; el dashboard S3 está listo pero depende de las credenciales reales del cluster; el proyecto ya tiene 10 funciones en uso, apenas 2 de margen. | No hay validación de punta a punta en producción con `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app`, y el cumplimiento real del release target sigue pendiente. |
| Amarillo | Local: `npm run lint`, `npx vite build`, `npm run test:ui`, `npm run test:server`, `npm run smoke:vercel` están en verde según `docs/agentes/README.md` y `docs/agentes/memoria/24-backend-bugs-copilot.md` / `25-frontend-bugs-copilot.md`. | El sistema ya no rompe localmente, pero la prueba del cliente real en Vercel aún no se ejecutó. | El acceso a la producción real y la validación del caso final no se ha hecho todavía. |

## 2. Objetivos

### OBJ-01 — Producción validada de punta a punta
- Por qué importa: la app tiene uso real potencial y el siguiente hito es “deploy en vivo con confianza”, no solo “local verde”. `docs/agentes/README.md` deja explícito que falta el humo contra producción.
- Criterios de aceptación:
  - `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel` pasa contra live.
  - `GET /api/health` devuelve 200 contra Vercel.
  - Rutas críticas de soporte/needs/points/chat responden como la API local y no se rompen con `rewrites` de `vercel.json`.
  - CI y Vercel quedan alineados con la misma batería `lint` + `vite build` + `test:ui` + `test:server` + `smoke:vercel`.
- Dependencias: `vercel.json`, `.github/workflows/ci.yml`, `package.json`, `server/app.ts`, `api/*.ts`, commit+push de la persona.
- Esfuerzo: medio.

### OBJ-02 — Semana 2 cerrada en lo operativo
- Por qué importa: T7/T11/T15 y T0 siguen abiertos; esa deuda ya está documentada como pendiente en `docs/agentes/README.md` y `tareas-semana-2.md`.
- Criterios de aceptación:
  - T7 verificación/moderación con rol y cola de reportes definidas.
  - T11 semilla única: un único origen de verdad entre `server/seedData.ts` y `src/data/initialData.ts`.
  - T15 PWA: manifest + Service Worker + instalación.
  - T0 producción: el humo de release se ejecuta con la app ya desplegada real.
- Dependencias: `server/seedData.ts`, `src/data/initialData.ts`, `src/context/AppContext.tsx`, `index.html`, `server/handlers/*`, `scripts/smoke-vercel.mjs`.
- Esfuerzo: medio.

### OBJ-03 — Dashboard con datos reales en producción
- Por qué importa: el siguiente valor de negocio no es más UX, sino convertir los datos en decisiones (barrio, urgencia, actividad). `scripts/export-s3.ts` ya existe y está listo para usar en un bucket real.
- Criterios de aceptación:
  - Export real a S3 compatible con credenciales del cluster.
  - `manifest.json` + CSV/JSON por tabla en fecha establecida.
  - El dashboard consume un manifest y no asume estructura manual.
  - El flujo de exportación queda documentado y validado con el cluster real.
- Dependencias: `scripts/export-s3.ts`, `.env.example`, `package.json`, acceso real al cluster S3 y variables `S3_*`.
- Esfuerzo: medio.

### OBJ-04 — Moderación y confianza en la identidad
- Por qué importa: la app de emergencias necesita “quién dijo qué” y “qué se puede moderar”. Ya quedó identificado en la auditoría y en `docs/agentes/decisiones.md`.
- Criterios de aceptación:
  - `verified` real basado en roles/autoridad, no solo booleano.
  - Cola de reportes operativa y estados visibles.
  - `author_id`/`author_name` validados con la sesión real y no por payload del cliente.
- Dependencias: `server/auth.ts`, `server/handlers/*`, `supabase/schema.sql`, `src/components/*` de reportes.
- Esfuerzo: medio.

### OBJ-05 — Mejoras productivas de servicio sin ampliar el plan
- Por qué importa: hay backlog de valor medio/alto (`FEAT-03`, `FEAT-04`, `FEAT-06`, `FEAT-08`, `FEAT-10`, `FEAT-12`), pero no debe bloquear la producción real ni romper la arquitectura actual.
- Criterios de aceptación:
  - Se prioriza solo lo que entra en el plan gratis y con las 10 funciones ya usadas.
  - Realtime y métricas se dejan para cuando la plataforma de datos esté operativa.
  - Orden por proximidad y alertas locales quedan independientes y no tocan el API de Vercel.
- Dependencias: `src/components/MapView.tsx`, `src/components/BlogView.tsx`, `src/context/AppContext.tsx`, `server/geo.ts`, `scripts/*`.
- Esfuerzo: medio.

## 3. Tareas

### T27 — T0 reubicado: humo oficial contra producción
- Área: agente-calidad
- Qué hacer:
  - Ejecutar `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel` tras el push real.
  - Validar `GET /api/health`, 404 real de ruta inexistente, y rutas críticas de `server/app.ts` / `vercel.json` con la app desplegada.
  - Comprobar que no haya cambios de comportamiento entre Vercel y Express (`scripts/smoke-vercel.mjs`).
- Hecho cuando:
  - 100% de la batería pasa con la app live.
  - No aparecen discrepancias de 401/403/404/503 entre Express y Vercel.
- Dependencias: OBJ-01, `vercel.json`, `.github/workflows/ci.yml`, `scripts/smoke-vercel.mjs`
- Esfuerzo: S
- Contribuye a: OBJ-01

### T28 — T7 heredada: verificación y moderación
- Área: agente-backend
- Qué hacer:
  - Definir `verified` real con roles/autoridad; no solo `verified: false` en la semilla.
  - Construir que la cola de reportes exista en backend y UI.
  - Añadir flujo de moderador para revisar/aceptar/rechazar reportes.
  - Mantener la política de identidad: sesión real y `author_id` verificado, no payload del cliente.
- Hecho cuando:
  - `server/handlers/*` atienden reportes/moderación con 401/403/200 adecuados.
  - `src/components/*` muestran el estado correctamente.
  - El sistema no acepta “verificado” desde el body del cliente.
- Dependencias: T1/T2 de la semana 2, `server/auth.ts`, `server/validation.ts`, `supabase/schema.sql`
- Esfuerzo: M
- Contribuye a: OBJ-02, OBJ-04

### T29 — T11 heredada: semilla única
- Área: agente-backend + agente-frontend
- Qué hacer:
  - Unificar origen de verdad: `server/seedData.ts` importa o delega a `src/data/initialData.ts` o viceversa.
  - Quitar divergencias de número de puntos/necesidades y contadores.
  - Asegurar que `npm run db:seed` e inicialización del front queden sincronizados.
- Hecho cuando:
  - La semilla real es un único fichero de origen.
  - Local y producción comparten la misma estructura de datos y contadores.
- Dependencias: `server/seedData.ts`, `src/data/initialData.ts`, `docs/agentes/README.md`
- Esfuerzo: S
- Contribuye a: OBJ-02

### T30 — T15 heredada: PWA offline
- Área: agente-frontend
- Qué hacer:
  - Añadir `manifest.webmanifest`.
  - Implementar Service Worker para offline minimal.
  - Usar la cola offline ya creada en `src/context/AppContext.tsx` como base.
  - Añadir iconos/instalación y caché seguro.
- Hecho cuando:
  - La app se puede instalar y seguir funcionando sin conexión.
  - La cola offline sigue sincronizándose al volver a red.
- Dependencias: `src/context/AppContext.tsx`, `src/components/*`, `index.html`
- Esfuerzo: M
- Contribuye a: OBJ-02

### T31 — Exportación final a S3 + contrato de dashboard
- Área: agente-backend
- Qué hacer:
  - Conectar `scripts/export-s3.ts` con credenciales reales del cluster.
  - Validar el flujo completo `Supabase -> CSV/JSON -> S3` contra el bucket real.
  - Confirmar `manifest.json` y layout de rutas.
  - Reforzar que el bucket sea privado y que `exports-local/` permanezca fuera del repo.
- Hecho cuando:
  - `npm run export:s3` con credenciales reales devuelve 0.
  - El dashboard puede leer `manifest.json` y encontrar los CSV/JSON esperados sin interpretaciones manuales.
- Dependencias: `scripts/export-s3.ts`, `.env.example`, `package.json`
- Esfuerzo: M
- Contribuye a: OBJ-03

### T32 — Seguridad de la capa de datos y headers
- Área: agente-backend
- Qué hacer:
  - Recheck de `securityHeaders` y `CSP` en local/Docker fuera de Vercel.
  - Revisar `server/middleware.ts` / `server/http.ts` y asegurar paridad con `vercel.json`.
  - Reconfirmar `readLimiter`, `writeLimiter` y `X-Forwarded-For` validados.
- Hecho cuando:
  - No hay CSP solo en Vercel; la app local también responde con headers esperados.
  - `X-Forwarded-For` no puede degradar ni burlar el rate limiting.
- Dependencias: `server/http.ts`, `server/middleware.ts`, `server/app.ts`, `vercel.json`
- Esfuerzo: S
- Contribuye a: OBJ-01, OBJ-02

### T33 — Habilitar backlog útil (solo si hay capacidad)
- Área: agente-frontend + agente-backend
- Qué hacer:
  - Priorizar solo una pieza del backlog que tenga valor al usuario real y que no reabra decisiones de arquitectura: `FEAT-08` proximidad o `FEAT-04` alertas por barrio.
  - No tocar `FEAT-03/06/10/12` hasta validar el dashboard y la producción.
- Hecho cuando:
  - El valor del feature es visible y cuantificable sin ampliar la superficie de ataque ni la deuda de infra.
- Dependencias: `src/components/MapView.tsx`, `src/components/BlogView.tsx`, `src/context/AppContext.tsx`, `server/geo.ts`
- Esfuerzo: M
- Contribuye a: OBJ-05

## 4. NO ASIGNAR ahora (y por qué)

- FEAT-03 landings por barrio: aún no hay router de producto ni necesidad de seo que justifique su despliegue antes del smoke real.
- FEAT-04 alertas por barrio: está parcialmente resuelto al nivel local con `needAlertsEnabled`, pero no se debe meter más sobre la app antes de cerrar la verificación de producción.
- FEAT-06 API pública versionada: la API actual ya está funcional; no conviene re-encapsularla sin un contrato real de consumidores.
- FEAT-08 proximidad: la base existe, pero hay que cerrar producción y un par de pendientes operativos antes de hacer más “feature-churn”.
- FEAT-10 realtime: añade carga operativa y complejidad de sincronización sin que el problema de producto lo exija aún.
- FEAT-12 métricas de impacto: es valiosa, pero es la siguiente fase después del dashboard con datos y la validación del bucket real.
- Cualquier trabajo que toque tokens reales o secretos del cluster (`S3_*`, `SUPABASE_*`, Clerk) queda en el lado de la persona/infra, no en el plan de agentes; hoy no se asigna.

## 5. Orden y paralelismo recomendado

- Grupo A (paralelo, sin compartir ficheros):
  - `T27` — agente-calidad (release/production smoke)
  - `T28` — agente-backend (moderación / verificación)
  - `T31` — agente-backend (export S3 real)
- Grupo B (paralelo, sin compartir ficheros):
  - `T29` — agente-backend + agente-frontend (semilla única; archivos distintos)
  - `T30` — agente-frontend (PWA)
  - `T32` — agente-backend (headers/CSP/rate-limit)
- Grupo C (post-Grupo A/B, si hay capacidad):
  - `T33` — agente-frontend + agente-backend (solo una feature del backlog)
- Cadena crítica:
  - `T27` → `T28` → `T31` → `T33`
  - `T29` y `T30` corren en paralelo, pero no bloquean la producción real si `T27` no está verde.
- Regla de oro: no abrir un backlog de features mientras la producción real no esté validada; la dev local ya está “en verde”, la real no.

La prioridad real hoy es clara: cerrar la base de confianza (producción validada) y luego irrigar el valor de datos.

