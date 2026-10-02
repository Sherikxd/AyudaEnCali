# Log — API pública versionada (2026-10-02)

## En qué trabajé

- FEAT-06: comprobar `/api/v1`, paginación y documentar la API actual.

## Cambios realizados

- `server/app.ts` → monta el mismo router en `/api/v1` y mantiene `/api` sin cambios; ambas bases comparten autenticación, límites, handlers y 404.
- `vercel.json` → añade rewrites versionados a las funciones ya existentes, más fallback versionado; no aumenta el número de funciones.
- `scripts/smoke-vercel.mjs` → comprueba aliases, preservación de parámetros de paginación, ruta dinámica de apoyos y 404 versionada.
- `README.md` → enumera endpoints, métodos, autenticación y contrato de paginación; corrige la descripción previa de SQL, que ya requiere `SQL_ADMIN_TOKEN`.
- `docs/agentes/decisiones.md` y `tareas-semana-2.md` → registra la decisión y cierra FEAT-06.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ `TODO OK` |
| `npm run test:server` | ✅ `TODO OK` |
| `npm run smoke:vercel` | ✅ 60 comprobaciones, 0 fallos |
| Smoke Express (`/api/v1/health`, `/api/health`, ruta v1 inexistente) | ✅ 200, 200, 404 JSON |

## Decisiones tomadas (y por qué)

- Se implementa `/api/v1` como alias no rompedor que ejecuta el mismo handler que la ruta legacy. El cliente puede migrar de forma gradual y no se duplican reglas de negocio ni funciones serverless.
- Los listados públicos conservan su respuesta histórica sin `page`/`limit`; cuando se usan parámetros, comparten el contrato de paginación existente. La cola de reportes sigue siempre paginada.

## Riesgos y deuda que dejo

- `/api/support/mine` conserva su consulta histórica de hasta 500 filas de Supabase y no se pagina; es un recurso privado específico de la cuenta, no un listado público.
- El despliegue real y su smoke requieren publicar los cambios; solo se podrá confirmar con el deploy actualizado.

## Para el siguiente agente

- Mantener los aliases de `/api/v1` en sincronía si se agrega un endpoint nuevo; añadir su rewrite Vercel antes del fallback versionado.
