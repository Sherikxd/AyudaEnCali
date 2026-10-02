# Log — frontend (2026-10-02) · Revisión FEAT-05 PWA offline

## En qué trabajé
- Revisé FEAT-05/T15 y su implementación existente (completada como T30).
- Área: `src/**`, `public/**`, `index.html` y documentación de la tarea.

## Cambios realizados
- `src/main.tsx` → registra el Service Worker con `updateViaCache: 'none'`.
  Express sirve estáticos con `max-age=604800`; sin esta opción el chequeo de
  actualizaciones podía quedar sujeto a la caché HTTP. Vercel ya envía
  `Cache-Control: no-cache` para `/sw.js`.
- `public/sw.js` → la exclusión de respuestas `private`/`no-store` reconoce
  las directivas `Cache-Control` sin distinguir mayúsculas, como exige HTTP.
- `docs/agentes/tareas-semana-2.md` → marca la tarjeta heredada T15 como
  completada por T30, documenta estrategias de navegación/GET/assets y que las
  escrituras no se interceptan (la cola `pendingWrite` gestiona fallos offline).

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `node --check public/sw.js` | ✅ |
| Validación del manifest y existencia de iconos | ✅ 6 iconos |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ `dist/sw.js`, manifest e iconos |
| `npm run test:ui` | ✅ TODO OK |
| Humo producción local | ✅ `/`, `/sw.js`, manifest, icono y `/404.html` 200; ruta inexistente 404 |

## Estrategias revisadas
- Navegaciones: network-first; solo offline `/` usa el shell, y las demás
  rutas conservan la respuesta 404.
- `/api/config`: network-first; GET públicos: stale-while-revalidate;
  `/assets/*`: cache-first.
- Escrituras no se interceptan; se delegan a la cola existente. Se excluyen
  Authorization, cross-origin y `/api/supabase/*`.

## Deuda y alcance
- `server.ts` aplica `max-age=604800` también al manifest, mientras Vercel ya
  lo sirve `no-cache`. El Worker omite la caché HTTP al actualizarse mediante
  `updateViaCache: 'none'`; la frescura del manifest en Express requiere el
  cambio de cabeceras del área backend, que no edité por límites de propiedad.
- `docs/agentes/README.md` todavía refleja el estado anterior de T15/T30; lo
  debe sincronizar el área de documentación.
