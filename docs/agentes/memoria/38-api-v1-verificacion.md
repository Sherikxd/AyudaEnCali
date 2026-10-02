# Log — verificación API versionada (2026-10-02)

## En qué trabajé
- Validé FEAT-06 sobre los cambios existentes: `/api/v1`, compatibilidad con `/api`, paginación y rewrites/rutas.

## Cambios realizados
- `docs/agentes/tareas-semana-2.md` → enlaza esta verificación desde FEAT-06.
- No modifiqué handlers: el alias, `.range()` de Supabase, el fallback paginado en memoria y los tests de equivalencia ya estaban implementados en el árbol de trabajo.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ `TODO OK` |
| `npm run test:server` | ✅ `TODO OK`; 7 comparaciones HTTP `/api` ↔ `/api/v1` con status/cuerpo iguales, paginado y no paginado |
| `npm run smoke:vercel` | ✅ 60 comprobaciones, 0 fallos |
| Humo Express en `PORT=3141` | ✅ health legacy y v1: 200; paginación points/needs/comments: 200 y metadatos con `page=1&limit=2`; ruta v1 desconocida: 404 con ruta canónica |
| Rutas protegidas en Express | ✅ `/api` y `/api/v1` reports: 401; apoyo versionado: 401 |

## Decisiones tomadas (y por qué)
- Mantener `/api/v1` como alias de los handlers existentes; las pruebas confirman que el contrato legacy no cambia.
- No duplicar paginación: los handlers usan `.range(offset, offset + limit - 1)` y conteo exacto en Supabase, y `slice` más metadatos en caché.

## Riesgos y deuda que dejo
- El entorno no tiene `SUPABASE_URL`/claves configuradas, así que la prueba HTTP corrió sobre la caché local. La consulta Supabase usa `.range()` y `count: 'exact'`, pero no se validó contra un proyecto remoto ni un volumen real de filas.
- El smoke de un deploy Vercel real sigue dependiendo de que la persona publique estos cambios.

## Para el siguiente agente
- Al añadir rutas, actualiza los rewrites de ambas bases, conserva `_orig` para rutas dinámicas y agrega equivalencia `/api` ↔ `/api/v1` al test de servidor.
