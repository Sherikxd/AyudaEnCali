## Plantilla de log de agente

Copia este fichero como `memoria/<NN>-<area>.md` y complétalo.

```markdown
# Log — <área> (<fecha>)

## En qué trabajé
- Tareas del tablero que tomé (IDs T1, T2…).

## Cambios realizados
- Fichero → qué cambió y por qué. Ej.: `server.ts:232` → ahora exige sesión.

## Verificación ejecutada
| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ / ❌ |
| `npx vite build` | ✅ / ❌ |
| `npm run test:ui` | ✅ (n/ n) / ❌ |
| `npm run verify:rls` | ✅ / n/a |

## Decisiones tomadas (y por qué)
- …

## Riesgos y deuda que dejo
- Cosas a medias, atajos, lo que rompería si cambia X.

## Para el siguiente agente
- Qué debe saber quien continúe por aquí.
```
