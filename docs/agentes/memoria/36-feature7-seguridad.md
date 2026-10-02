# Log — seguridad del chat geográfico (2026-10-02)

## En qué trabajé
- Revisión de seguridad del feature 7 / T8 (FEAT-07), con revisión especializada previa.

## Cambios realizados
- `server/handlers/points.ts` → un `PUT` del autor revoca `verified` en Supabase y caché, para que los datos modificados deban pasar moderación otra vez antes de aparecer como verificados en el chat.
- `server/handlers/chat.ts` → el barrio se representa explícitamente como declarado por el cliente y el prompt trata barrio/coordenadas como no verificados; no son autoridad ni prueba de ubicación. Las coincidencias de necesidades quedan etiquetadas como comparación textual, no proximidad.
- `server/chatFallback.ts` → separa el ámbito de puntos seleccionados por coordenadas del barrio declarado, tanto en títulos como en mensajes sin resultados; las necesidades indican que solo coinciden textualmente y no tienen geolocalización.
- `scripts/test-nucleos.mjs` y `scripts/test-chat-context.mjs` → regresiones para edición tras verificación, separación del barrio declarado, aislamiento del contenido y estados de necesidades.
- `docs/agentes/tareas-semana-2.md` → se documenta el hallazgo y su corrección en T8.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `NODE_ENV=production PORT=3137 node --import tsx server.ts` + `/api/health` y ruta inexistente | ✅ 200 / 404; servidor detenido |
| `node --import tsx scripts/test-chat-context.mjs` | ✅ Chat context: TODO OK |
| `npm run test:server` | ✅ (incluye N8b/N8c: revocación y nueva moderación) |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ TODO OK (aviso: puerto WebSocket 24678 ocupado en una ejecución) |

## Decisiones tomadas (y por qué)
- Toda edición de un punto verificado revoca la verificación, en vez de intentar enumerar qué campos podrían alterar confianza, contacto o ubicación. Así el siguiente resultado marcado verificado requiere una revisión moderada.
- El barrio y las coordenadas del cliente son entradas no verificadas: el primero solo guía coincidencias textuales, y las segundas solo un ordenamiento/distancia aproximada, nunca ubicación confirmada.

## Riesgos y deuda que dejo
- El prompt separa instrucciones de contenido no confiable y pone el barrio en contexto de usuario, pero ninguna instrucción a un LLM garantiza inmunidad absoluta a inyección.
- Las necesidades activas siguen siendo reportes comunitarios, no recursos verificados; se identifican como tales y no se tratan como cercanos.

## Para el siguiente agente
- Mantener la invalidación de `verified` si se amplía el flujo de edición o los campos proyectados al prompt.
