# Log — revisión de moderación backend (2026-10-02)

## En qué trabajé
- Revisión de FEAT-02/T28: badge verificado, permisos por rol, `/api/reports` y procedencia de identidad/`verified`.

## Cambios realizados
- `server/handlers/reports.ts` → si Supabase está configurado y falla la lectura de la cola, responde `503` en lugar de ocultar reportes con una caché parcial; respuestas sin datos válidos también quedan registradas. La caché sigue siendo respaldo solo cuando no hay BD configurada.
- `scripts/test-nucleos.mjs` → cubre `verified`, `authorId` y `userRole` falsificados al crear un punto, y verifica el `503`/paridad Express-Vercel ante una caída de lectura de reportes. El archivo ya contenía cambios concurrentes de otras tareas; se conservaron.
- Verificado en código: `PATCH /api/points/:id` solo permite a `coordinador` del JWT verificado (o `MODERATOR_USER_IDS` configurado en servidor) cambiar el booleano `verified`; el `PUT` del autor no lo modifica. `POST /api/reports` toma `reporterId` del `sub` del JWT. `GET /api/reports` exige moderación. El badge ya se muestra en `MapView`.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ `TODO OK` |
| `npm run test:server` | ✅ `TODO OK` |
| `npm run smoke:vercel` | ✅ 58 comprobaciones, 0 fallos |
| Humo local producción | ✅ `/api/health` 200 · ruta inexistente 404 |
| `npm run verify:rls` | n/a — no se modificó `supabase/schema.sql` |

## Decisiones tomadas (y por qué)
- Una cola con errores de BD no debe presentarse como vacía o parcial: en instancias serverless la caché no contiene reportes de otras instancias.
- No se cambiaron roles ni validadores porque la moderación ya falla cerrado y el servidor ignora los campos de identidad/`verified` del body.

## Riesgos y deuda que dejo
- Sigue pendiente la UI cliente para crear reportes y consumir la cola; es trabajo de `src/**` (área frontend) y ya está anotado en T28. La API y el almacenamiento existen.

## Para el siguiente agente
- Moderador = claim `coordinador` (`role` o `public_metadata.role`) o `MODERATOR_USER_IDS` del servidor. No usar `unsafe_metadata` ni confiar en rol enviado por el cliente.
