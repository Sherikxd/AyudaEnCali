# Log — FEAT-07 chat geográfico (2026-10-02)

## En qué trabajé
- Completar y validar el contexto geográfico real del chat y su frontera frente a prompt injection.

## Cambios realizados
- `server/validation.ts` → el barrio del chat solo se acepta si coincide, sin distinguir acentos/mayúsculas, con un barrio conocido de `CALI_BARRIOS_DATA`; se devuelve el nombre canónico y se descarta cualquier texto adicional o no reconocido.
- `server/handlers/chat.ts` → el JSON de Gemini separa `untrustedClientInput` de `directoryContext`; el system prompt es fijo, el historial siempre viaja como contenido de usuario y no se transmiten coordenadas exactas.
- `scripts/test-chat-context.mjs` → regresiones para barrio canónico, rechazo de un barrio con instrucciones, separación del JSON, aislamiento del historial, ranking/radio, estados y fallback.
- `docs/agentes/tareas-semana-2.md` → documenta el hardening adicional de FEAT-07.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `node --import tsx scripts/test-chat-context.mjs` | ✅ `Chat context: TODO OK` |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ `TODO OK`; el runner avisó que el puerto WebSocket 24678 ya estaba ocupado |
| `npm run test:server` | ✅ `TODO OK` |
| `npm run smoke:vercel` | ✅ 60 comprobaciones, 0 fallos |
| Humo de producción local en `PORT=3142` | ✅ `/api/health` 200; ruta inexistente 404; servidor detenido |
| `git diff --check` | ✅ |

## Decisiones tomadas (y por qué)
- Un barrio de usuario no se escapa ni se intenta instruir al modelo: se canonicaliza contra el catálogo conocido y todo lo demás se omite, preservando la consulta.
- El prompt distingue el origen de entrada del cliente y los resultados del directorio; las instrucciones no interpolan contenido de ninguno.

## Riesgos y deuda que dejo
- Las instrucciones reducen la inyección y el contexto disponible, pero ningún prompt garantiza inmunidad absoluta. Los registros se proyectan de forma compacta y sus textos siguen tratándose como contenido no autoritativo.
- El contexto conserva una última lectura exitosa en memoria si Supabase falla; puede estar desactualizada y el modelo debe advertirlo.

## Para el siguiente agente
- Si el catálogo de barrios cambia, el chat hereda la actualización desde `src/data/caliLocations.ts`; mantener una regresión de canonicalización y de descarte de texto adicional.
