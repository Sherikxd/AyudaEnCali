# Memoria para agentes

Esta carpeta es la **memoria compartida** entre agentes. Como los agentes no
recuerdan conversaciones anteriores, aquí vive todo lo que necesiten saber.

```
docs/agentes/
├── README.md              ← este archivo
├── tareas-semana-1.md     ← tablero de trabajo (estado de cada tarea)
├── decisiones.md          ← decisiones arquitectónicas ya tomadas
└── memoria/
    ├── plantilla.md       ← copia esta estructura en tu log
    ├── 00-contexto-inicial.md   ← estado del proyecto al empezar
    └── <NN>-<area>.md     ← UN fichero por agente (evita conflictos)
```

## Cómo usarla

**Al empezar:**
1. Lee `00-contexto-inicial.md` (qué hay hecho y qué está pendiente).
2. Lee `tareas-semana-1.md` y busca las tareas con tu nombre.
3. Lee `decisiones.md` para no reabrir decisiones ya tomadas.

**Al terminar:**
1. Copia `plantilla.md` a `memoria/<NN>-<area>.md` (por ejemplo
   `01-backend.md`, `02-frontend.md`) y rellénala.
2. Cambia el estado de tus tareas a `✅` (o `⛔ bloqueada` con el motivo).
3. Si algo queda a medias o es frágil, dilo en tu log: el siguiente agente
   lo arreglará; no lo ocultes.

## Reglas de escritura

- **Cada agente escribe solo en su propio fichero de `memoria/`** (nunca en
  el de otro) para que las escrituras simultáneas no se pisen.
- `tareas-semana-1.md` y `decisiones.md`: edición puntual y mínima (solo tu
  fila / tu decisión nueva).
- Cada entrada de `decisiones.md` lleva **fecha, decisión y alternativa
  descartada** para que nadie tenga que adivinar el porqué.
