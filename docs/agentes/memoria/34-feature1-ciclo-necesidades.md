# Log — ciclo de vida de necesidades (2026-10-02)

## En qué trabajé

- Revisión y cierre de FEAT-01 (ciclo de vida), sobre T2 (API) y T10 (UI),
  ya marcadas ✅ en `tareas-semana-2.md`.

## Cambios realizados

- `server/validation.ts` → `NeedDraft` y `validateNeed` ya no leen `status`
  del cuerpo al crear. `NeedPatch` conserva los estados editables y su
  validación estricta, incluido `archivada`.
- `server/handlers/needs.ts` → toda creación fija `status: 'activa'`; las
  transiciones posteriores siguen autenticadas y verifican que el `sub` del
  JWT sea el `author_id`. Se actualizó la documentación de estados admitidos.
- `src/components/BlogView.tsx` → las tarjetas muestran siempre el estado
  («Activa», «En proceso», «Resuelta» o «Archivada»); el selector de autor
  permite las cuatro transiciones. El filtro «Abiertas» agrupa `activa` y
  `en_proceso`; se conserva la edición y el borrado propios.
- `scripts/test-authmodal.mjs` → `test:ui` comprueba las cuatro opciones,
  la etiqueta de estado y que el filtro «Abiertas» agrupa `activa` +
  `en_proceso`.
- `scripts/test-nucleos.mjs` → E2 intenta enviar `status: 'archivada'` y un
  `authorId` ajeno: la respuesta prueba que el estado nace `activa` y el autor
  viene del JWT. E4/E4a/E4b/E4c transitan por los cuatro estados; las pruebas
  existentes cubren estados desconocidos, 401, edición ajena (403), borrado
  propio y borrado ajeno (403).
- Entidades/esquema revisados: `HelpNeedWithAuthor.authorId` procede del
  servidor, `NeedStatus` contiene `archivada` y `help_needs.status` es `TEXT`,
  por lo que no hace falta migración.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ |
| `npx vite build` | ✅ |
| `npm run test:ui` | ✅ `TODO OK`; aserción de UI cubre los cuatro estados disponibles |
| `npm run test:server` | ✅ `TODO OK`; E2, E4–E4c, E5–E9 verifican estado y autoría |
| `npm run smoke:vercel` | ✅ 60 comprobaciones, 0 fallos |
| `npm run verify:rls` | n/a; no se modificó `supabase/schema.sql` |
| `git diff --check` | ✅ |

## Decisiones tomadas (y por qué)

- El estado al publicar lo asigna el servidor (`activa`) en vez de aceptar un
  estado inicial del cliente. Permitir un `POST` ya `resuelta`/`archivada`
  falsificaba el ciclo de vida antes de que existiera una transición real;
  el autor autenticado conserva la capacidad de cambiarlo mediante `PATCH`.
- **Propuesta para registrar como decisión**: la especificación anterior de T2
  contemplaba validar el estado recibido al crear. Se adopta la regla más
  segura solicitada para FEAT-01: estado inicial fijo y transiciones solo por
  el endpoint autenticado del autor (`🔁 en revisión`). No se alteraron otras
  decisiones del repositorio.

## Riesgos y deuda que dejo

- El estado de los registros heredados continúa normalizándose con el esquema
  existente; no se inventan autores para filas sin `author_id`.
- `test:ui` comprueba estáticamente las opciones/etiquetas de BlogView, pero
  no simula la selección; las transiciones y la autoría sí se ejercitan en
  `test:server`.

## Para el siguiente agente

- T2 y T10 permanecen en ✅. La revisión cerró el hueco de edición visual de
  `en_proceso`; no se añadieron funciones Vercel ni cambios al esquema.
