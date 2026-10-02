# Log — frontend (2026-10-02) · validación FEAT-05

## En qué trabajé
- Validé T30 / FEAT-05 PWA offline, ya marcada como completada en el tablero.

## Cambios realizados
- `public/sw.js` → precisé en el comentario que solo se almacenan respuestas
  HTTP 200; la implementación ya aplicaba ese filtro.
- No faltaba funcionalidad en manifest, registro ni estrategias; no se alteró
  el comportamiento.

## Verificación ejecutada
| Comando / prueba | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ `sw.js`, manifest y cuatro iconos incluidos |
| `npm run test:ui` | ✅ TODO OK (40 pruebas; apareció aviso no bloqueante de puerto HMR ocupado) |
| `npm run smoke:vercel` | ✅ 60 comprobaciones, 0 fallos |
| Manifest, rutas de iconos y dimensiones PNG | ✅ 6 iconos declarados; tamaños verificados |
| Service Worker en Chromium con servidor detenido | ✅ shell y `/api/points` desde caché; ruta desconocida devuelve 404 desde el SW |

## Estrategias revisadas
- Navegaciones network-first: el servidor conserva prioridad con red; sin
  servidor se sirve el shell con aviso offline y las otras rutas usan la 404
  cacheada con estado 404.
- `/api/config` network-first; otros GET públicos de `/api` stale-while-revalidate;
  assets con hash cache-first; las escrituras pasan sin interceptarse a la cola
  `pendingWrite` existente.
- El registro está condicionado a `import.meta.env.PROD` y soporte del navegador,
  con `updateViaCache: 'none'`.

## Riesgos y deuda que dejo
- No se ejecutó Lighthouse ni una instalación en un dispositivo Android físico.
- No se probó un POST offline de extremo a extremo; el SW no lo intercepta y la
  cola `pendingWrite` existente permanece sin cambios.
- `docs/agentes/README.md` conserva una referencia antigua que lista T30 como
  pendiente; no se tocó porque el README es responsabilidad del área de
  documentación. El tablero actual ya marca T30 como ✅.
