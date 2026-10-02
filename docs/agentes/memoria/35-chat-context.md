# Log — contexto geográfico del chat (2026-10-02)

## En qué trabajé
- Revisión de seguridad y utilidad de FEAT-07/T8 (chat con contexto geográfico real).

## Cambios realizados
- `server/handlers/chat.ts` → el system prompt es fijo; barrio, puntos, necesidades e historial se pasan en un único mensaje de usuario como JSON no confiable. El historial del cliente nunca toma el rol `model`, evitando respuestas `assistant` falsificadas.
- `server/handlers/chat.ts` → puntos limitados a verificados, no cerrados y sin pendientes; con coordenadas se ordenan por distancia y se limita a 25 km. Sin coordenadas se usa coincidencia normalizada (incluye acentos) del barrio.
- `server/handlers/chat.ts` → solo incluye necesidades `activa`/`en_proceso`; con barrio exige coincidencia. Indica al modelo que las necesidades no tienen coordenadas y no deben describirse como cercanas si no hay coincidencia.
- `server/handlers/chat.ts` → no envía coordenadas exactas a Gemini; envía barrio, indicador de uso de coordenadas y distancias derivadas.
- `server/chatFallback.ts` → usa el mismo subconjunto geográfico, informa distancias/status y no presenta necesidades resueltas ni recursos cerrados/no verificados.
- `server/context.ts` → una respuesta exitosa vacía de Supabase limpia datos de semilla/cache; sin una lectura exitosa, los registros semilla no se consideran contexto real ni se envían al modelo/respaldo.
- `scripts/test-chat-context.mjs` → regresiones para inyección en campos, turnos falsificados, coordenadas, radio, verificación y estados.
- `docs/agentes/tareas-semana-2.md` → resultado de la re-revisión de T8.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `node --import tsx scripts/test-chat-context.mjs` | ✅ |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ «TODO OK»; avisó que el puerto WebSocket 24678 ya estaba ocupado |
| `npm run test:server` | ✅ (exit 0) |
| Humo producción `:3124` | ✅ `/api/health` 200; ruta inexistente 404; servidor detenido |

## Decisiones tomadas (y por qué)
- Se conserva la ubicación como dato del usuario, separado del system prompt. Las coordenadas solo se usan para ordenar y calcular distancia en servidor para evitar enviar la ubicación precisa al proveedor.
- Los reportes de necesidades no tienen coordenadas en el esquema; por tanto, el chat no afirma proximidad GPS y usa coincidencia de barrio cuando esta existe.

## Riesgos y deuda que dejo
- Las defensas de prompt reducen la suplantación barata y eliminan el rol `model` suministrado por cliente, pero ningún prompt por sí solo garantiza inmunidad a prompt injection.
- El radio de recomendación de 25 km es un umbral de producto; revisar si cambia la cobertura geográfica.
- Si Supabase falla después de una lectura exitosa se conserva la última copia real, que puede estar desactualizada; se instruye al modelo a pedir confirmación. En un cold start sin una lectura exitosa el chat no recomienda la semilla y orienta a verificar/contactar emergencias.

## Para el siguiente agente
- Confirmar vigencia de datos y contactos de emergencia antes de producción.
- Si se agregan coordenadas a `help_needs`, migrar la selección de necesidades a proximidad real.
