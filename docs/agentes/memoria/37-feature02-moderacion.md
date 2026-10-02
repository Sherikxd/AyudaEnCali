# Log — FEAT-02 verificación y moderación (2026-10-02)

## En qué trabajé
- T7/FEAT-02: confirmar autorización para verificar puntos, cola de reportes y procedencia JWT de identidades.

## Cambios realizados
- `scripts/test-nucleos.mjs` → añadidos casos de regresión donde `unsafe_metadata.role=coordinador` no autoriza ni `PATCH /points/:id` ni `GET /reports`.
- `docs/agentes/tareas-semana-2.md` → marcada T7 como completada.
- Confirmado en backend: los puntos nuevos fuerzan `verified: false`; solo `PATCH` validado y con permiso de moderación cambia ese campo. `PUT` del autor no puede fijarlo y una edición revoca verificación.
- Confirmado en backend: el rol efectivo procede del JWT Clerk verificado (`role` o `public_metadata.role`) o de `MODERATOR_USER_IDS` del servidor; rol ausente/ciudadano y `unsafe_metadata` fallan cerrado. `POST /reports` toma `reporterId` del `sub` autenticado, no del body.
- Confirmado en esquema: `entity_reports` tiene FKs, índice de deduplicación y RLS activo sin políticas. El rewrite de reportes llega a función existente; el total sigue bajo el máximo de Vercel.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ `tsc --noEmit` |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ `TODO OK` (aviso de puerto HMR ya ocupado, sin fallos) |
| `npm run test:server` | ✅ `TODO OK`, incluidos los dos rechazos de `unsafe_metadata` |
| `npm run smoke:vercel` | ✅ 60 comprobaciones, 0 fallos |
| `npm run verify:rls` | ✅ 13 pasos; `entity_reports` con RLS y 0 políticas |

## Decisiones tomadas (y por qué)
- No se modificó la UI: el alcance de FEAT-02 solicitado aquí es backend/validación y no es necesario tocar `src/**`.
- No se modificó el esquema ya existente, solo se verificará su estado RLS con la batería de RLS.

## Riesgos y deuda que dejo
- La interfaz de cola de reportes continúa fuera de este cambio del backend y pertenece al área frontend.

## Para el siguiente agente
- No confiar en `unsafe_metadata` ni en campos de rol/identidad del cuerpo; los tests locales firman JWT de prueba y cubren esos rechazos.
