# Log — verificación de API v1 (2026-10-02)

## En qué trabajé
- FEAT-06: revisar el alias versionado, la paginación y la compatibilidad legacy.

## Cambios realizados
- `scripts/test-nucleos.mjs` → añadidas siete comprobaciones HTTP contra Express que comparan `/api` y `/api/v1` en puntos, necesidades y comentarios, con y sin paginación, y para un 404.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ `TODO OK` |
| `npm run test:server` | ✅ `TODO OK`; las siete comparaciones legacy/versionadas pasan |
| `npm run smoke:vercel` | ✅ 60 comprobaciones, 0 fallos |

## Decisiones tomadas (y por qué)
- `/api/v1` se mantiene como alias aditivo: en Express monta el mismo router, y en Vercel sus rewrites reutilizan funciones y handlers existentes. No se duplica el contrato ni se rompen clientes en `/api`.
- `page`/`limit` activa paginación efectiva (`range` + conteo exacto en Supabase, `slice` en memoria); omitirlos conserva las respuestas legacy sin metadatos.

## Riesgos y deuda que dejo
- La paginación en Supabase se verifica por la implementación del query y el smoke sin BD cubre el comportamiento de caché; no se ejecutó contra un proyecto Supabase desplegado.
- El smoke contra producción requiere que los cambios estén publicados.

## Para el siguiente agente
- Al añadir endpoints, sincronizar las rutas Express con sus rewrites versionados de Vercel y ampliar las comparaciones del smoke.
