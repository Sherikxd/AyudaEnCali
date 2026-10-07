# Agentes del proyecto

> Dos familias de agentes viven en este repo. **Copilot** los usa desde la
> terminal (`copilot --agent=…`); **opencode** los usa como subagentes
> (`task` → `subagent_type`). Ambas definen a las **mismas cinco personas**:
> mismas reglas, mismo ámbito y misma verificación, para que el trabajo
> delegado salga igual venga de donde venga.

| Agente | Para qué | Edita | Copilot | opencode |
| --- | --- | --- | --- | --- |
| **pensador crítico** | Cuestiona planes, propuestas y decisiones antes de ejecutarlos | No (solo lectura) | `pensador-critico` | `critico` |
| **backend pesado** | Refactors y bugs grandes en `server/**`, `api/**`, `supabase/**`, `scripts/**` | Sí | `backend-pesado` | `backend-pesado` |
| **frontend pesado** | Trabajo pesado en `src/**`, `index.html` (React 19 + TS estricto) | Sí | `frontend-pesado` | `frontend-pesado` |
| **verificador** | Ejecuta lint, build, tests y humo; informa, no arregla | No | `verificador` | `verificador` |
| **auditor RLS** | Seguridad: RLS, secretos, cabeceras, rate limit | No | `auditor-rls` | `auditor-rls` |

Ficheros: `.github/agents/<nombre>.agent.md` (Copilot, con YAML de frontmatter
y `tools`) y `.opencode/agent/<nombre>.md` (opencode, con `mode: subagent` y
`permission`). **Si cambias las reglas de un agente, cámbialo en los dos
ficheros**: son el mismo rol duplicado a propósito.

## Cómo se usan

### Desde Copilot CLI (está instalado y autenticado en esta máquina)

```bash
# Un agente concreto, modo no interactivo y silencioso
copilot -p "Tu tarea" --agent=pensador-critico -s

# Más esfuerzo de razonamiento para lo que es pensamiento crítico
copilot -p "Revisa este plan" --agent=pensador-critico --reasoning-effort high -s

# Varias tareas en paralelo con orquestación de subagentes
copilot -p "Divide y ejecuta: backend X, frontend Y" --fleet

# Modo interactivo: dentro de la sesión, `/agent` lista y cambia de agente
copilot -i
```

Requiere `copilot login` una vez (ya hecho). Con `tools` restringidas, un
agente de solo lectura **no puede** editar ficheros aunque se lo pidas.

### Desde opencode (este mismo entorno)

Los agentes de `.opencode/agent/` se cargan al arrancar opencode: **reinicia
la sesión** la primera vez que los añadas o los cambies. Después se invocan
como subagente:

- `critico`, `verificador`, `auditor-rls`: `edit: deny` → no pueden tocar
  ficheros; `bash` limitado a la lista blanca de comandos (los patrones van
  de más amplio a más estrecho: la última regla que coincide es la que manda).
- `backend-pesado` / `frontend-pesado`: `edit: allow` sobre su ámbito, con
  `bash: ask` para todo lo que no sea verificación habitual.

## Reglas que todos comparten

1. **Ámbito**: `server/**`, `api/**`, `supabase/**`, `scripts/**` es de
   backend; `src/**` es de frontend (reparto de `AGENTS.md`). Un agente que
   necesita cruzar de área termina con el contrato pendiente, no lo implementa.
2. **Verificación obligatoria antes de dar por hecho cualquier cambio**:
   `npm run lint` · `npx vite build` · `npm run test:ui` ·
   `npm run test:server` (+ humo si se tocó el servidor).
3. **Decisiones**: `docs/agentes/decisiones.md` es ley mientras no se reabra
   explícitamente. El pensador crítico es quien detecta reabrimientos.
4. **Secretos**: solo en `.env` (gitignored); nada con prefijo `VITE_`.
5. **Nunca `git commit`**: el repositorio lo gestiona una persona.
6. **Salida**: informe con `fichero:línea`, comandos ejecutados y su
   resultado. Si un check no pasa, se dice; no se da la tarea por hecha.

## Flujo recomendado para una tarea mediana

```
1. pensador-critico   →  ¿el plan aguanta? (APROBAR / CON CONDICIONES / RECHAZAR)
2. backend-pesado  y/o frontend-pesado  →  ejecutan por separado (no comparten ficheros)
3. verificador      →  batería completa y reporte
4. auditor-rls      →  solo si cambió esquema, secretos, auth o rate limit
```

Si dos agentes tocarían los mismos ficheros (p. ej. ambos quieren
`AppContext.tsx`), **no los lances en paralelo**: encadénalos.

## Comprobación rápida de que cargan

```bash
copilot -p "Responde OK" --agent=verificador -s          # → OK
ls .opencode/agent/                                       # → los 5 ficheros
```

Si Copilot dice `custom agent 'x' failed to load`, el frontmatter YAML está
mal: casi siempre es un `: ` sin comillar en `description`.
