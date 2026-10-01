# Log — documentación (2026-09-30)

## En qué trabajé

- Revisión de **toda** la memoria del proyecto: `AGENTS.md`,
  `docs/agentes/README.md`, `auditoria-semana-2.md` (FAL-01..15, FEAT-01..12,
  riesgos heredados), `decisiones.md`, `tareas-semana-1.md`,
  `tareas-semana-2.md` y los logs `memoria/00` … `memoria/16` + `plantilla.md`.
- Actualización de `docs/agentes/README.md` para que refleje el estado real
  de hoy (árbol de la carpeta, balance de la semana 1, riesgos abiertos y
  cómo usar la memoria).
- **Solo lectura** sobre el resto: ni código (`src/**`, `server/**`, `api/**`,
  `supabase/**`, `scripts/**`, `.github/**`, `package.json`), ni los tableros
  de tareas, ni `README.md` de la raíz (son de otros agentes). Sin
  `git add`/`git commit`. Sin builds ni suites de test (los dejé a sus
  áreas).
- Sonda manual de **solo lectura** contra producción (un puñado de `curl`,
  sin crear datos) para no escribir en el README riesgos que ya no existen.

## Cambios realizados

- `docs/agentes/README.md` → reescrito:
  - Árbol real de la carpeta: `auditoria-semana-2.md`, `tareas-semana-1.md`,
    `tareas-semana-2.md`, `decisiones.md` y los logs `00`-`08` y `14`-`17`
    (con una línea de qué contiene cada uno). Aviso explícito de que los
    números **09-13 no se usaron** (T11/T12/T13 están en 06/07/08).
  - Tabla «Semana 1 — qué se hizo»: T0-T14 + 2 hotfixes con estado ✅, log
    responsable y el resumen de verificación (`lint`/`vite build`/`test:ui`
    40/40/`smoke:vercel` 35/35/`verify:rls` 10 pasos/T14 89/89). Marca T11 y
    T12 como «sin fila en el tablero».
  - Tabla «Qué queda abierto»: humo oficial contra prod (con la sonda
    manual de hoy), `X-Forwarded-For` (FAL-06), B2/O2/O4/O9 del checklist,
    los 9 riesgos de T0 resumidos, el ciclo CI → deploy → smoke nunca
    validado de punta a punta, el repaso de la auditoría y los puntos que
    son de la persona.
  - «Cómo usarla» actualizado a la semana 2 (auditoría → tablero →
    decisiones → tu log) y «Reglas de escritura» con la pauta de
    `🔁 en revisión` para `decisiones.md` y con quién mantiene este README.
- `docs/agentes/memoria/17-documentacion.md` → este log.

## Verificación ejecutada

No corresponden builds ni tests (misión de solo documentación); lo que sí
comprobé:

| Comprobación | Resultado |
| --- | --- |
| `ls`/`glob` de `docs/agentes/**` antes y después de escribir | ✅ árbol del README = ficheros reales |
| `git log --oneline -6` · `git status --short` | ✅ HEAD `66f1a5b` = hotfix 2 (ESM) y hotfix 1 = `a466c33`, ya subidos. Sin trackear: `auditoria-semana-2.md` y `tareas-semana-2.md`; modificados sin commit: `README.md` raíz (otro agente, FAL-14) y `tareas-semana-1.md` (el enlace ➡️ a la semana 2) |
| Sonda prod: `GET /api/health` | ✅ 200 |
| Sonda prod: `GET /api/points` | ✅ 200 con `"source":"supabase"` (no caché semilla) |
| Sonda prod: `GET /api/config` | ✅ `supabaseConnected:true`, `tablesReady:true`, `clerkPublishableKey: pk_test_…` |
| Sonda prod: `POST /api/needs` con `{bad json` | ✅ **400** (P1-1 cerrado en vivo) |
| Sonda prod: `POST /api/needs/need-1/support` sin sesión | ✅ **401** (P1-2/KO-4 cerrados en vivo: el `id` del rewrite llega) |
| Sonda prod: espejos `/api/support-mine`, `POST /api/needs-support` | ✅ **404** (KO-1/KO-2) |
| Sonda prod: `GET /api` · `/api/xyz` · `/ruta-inexistente` | ✅ 404 / 404 / 404 |
| Sonda prod: `GET /api/supabase/sql` | ⚠️ **200** (B2/FAL-05 siguen abiertos) |
| Sonda prod: cabeceras de `/` | ⚠️ sin `nosniff`/`X-Frame-Options` (O9/FAL-13 abiertos) |
| `npm run lint` / `vite build` / `test:ui` / `verify:rls` | n/a (no ejecutados: fuera de mis ficheros y de mi misión) |

## Decisiones tomadas (y por qué)

- **No añadí ninguna entrada nueva a `decisiones.md`.** Las contradicciones
  que he encontrado entre documentación y código están **ya** cubiertas por
  la auditoría de hoy (FAL-01..15) o son históricas/superadas por entradas
  posteriores del propio fichero; ninguna exige un acuerdo nuevo. Si en la
  semana 2 aparece una que sí, se anota al final con `🔁 en revisión`.

## Qué encuentro desincronizado aún

1. **`decisiones.md` entrada T10 (2026-09-30) vs entrada T13 (mismo día):**
   el aviso de T10 dice que los espejos `/api/sql` y `/api/support/mine`
   *«responden en Vercel como su ruta canónica»*, pero T13 los bloqueó con
   404 (verificado hoy en prod). La entrada posterior manda; no he reescrito
   una decisión cerrada (lo anoto aquí y en el README va como comportamiento
   actual: espejo → 404).
2. **`00-contexto-inicial.md`** sigue diciendo «3 tablas»: hoy hay **4**
   (`help_points`, `help_needs`, `need_supporters`, `point_comments`). El
   fichero pide corregirlo en el log de cada uno, pero es de otra área.
3. **`01-backend.md` y `02-frontend.md`** citan `src/context/ClerkSync.tsx`;
   el fichero real es **`src/components/ClerkSync.tsx`** (ya anotado como B3
   en `06-checklist-migracion.md` y en los hallazgos 8 de `03`).
4. **`tareas-semana-1.md` no tiene fila T11 ni T12**, aunque ambos están
   hechos (logs `06` y `07`): el tablero no refleja el trabajo completo de
   la semana 1. *También* la fila T14 es una línea suelta, sin el formato de
   cabecera del resto (cosmético). No he tocado el tablero (no es mío).
5. **`tareas-semana-2.md` (T0)** dice *«humo contra producción, pendiente de
   que la persona haga commit+push»*: **ya hizo push** (`45e279d`, `a466c33`,
   `66f1a5b`) y hay deploy vivo → el humo se puede lanzar **ya**, sin esperar
   a nada. El tablero no es mío; lo dejo anotado.
6. **Logs históricos que ya no describen el código actual** (correctos en su
   momento, no se corrigen): `04`/`05` (espejos que respondían; `api/index.ts`
   exportando la app), `06` («T10 en curso»), `08` (P1 «solo cerrados en
   local»). Quien continúe debe leer **el log más reciente** de cada tema
   (`14`, `15`, `16` y la auditoría).
7. **Auditoría vs hoy:** la auditoría (hoy) lista el humo contra prod como
   pendiente y cierra el diagnóstico en «nunca se ha validado CI → deploy →
   smoke»; mi sonda manual mejora eso a «deploy en verde y varios checks en
   vivo ya OK», pero **el `smoke:vercel` oficial de 35 checks sigue sin
   ejecutarse contra producción** — se mantiene como riesgo abierto.
8. **`README.md` de la raíz** está siendo reescrito ahora mismo por otro
   agente (FAL-14 / T19): si toca esa tarea, este README y el suyo deben
   contar lo mismo (nº de tablas, deploy real `ayuda-en-cali.vercel.app`,
   scripts `smoke:vercel`).

## Riesgos y deuda que dejo

- Este README es un **retrato de hoy**: cuando la semana 2 mueva estados,
  hay que actualizar la tabla «Qué queda abierto» (y borrar lo que se
  cierre), no acumular notas.
- La sonda de producción fue manual y **no sustituye** al
  `SMOKE_BASE_URL=… npm run smoke:vercel` (35 checks) ni a la matriz de
  paridad: no he medido paginación, límites de tasa, ni el chat en frío con
  BD viva.
- No he ejecutado `lint`/`build`/`test:ui`/`verify:rls`: si este ciclo
  coincidió con cambios de código de otros agentes, la verificación
  correspondiente es suya, no mía.

## Para el siguiente agente

- **agente-verificacion**: lo único que cierra de verdad los
  *PENDIENTE-DEPLOY* de T14 es
  `SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel`
  (el deploy ya responde y los commits ya están subidos). Resultados de mi
  sonda arriba, por si quieres partir de ellos (pero repite los tuyos).
- **agente-calidad (T19)**: el `README.md` raíz y este `docs/agentes/README.md`
  deben decir lo mismo; los 5 puntos de FAL-14 siguen abiertos.
- **quien escriba en `decisiones.md`**: no reescribes entradas cerradas; si
  algo cambia (p. ej. los espejos del aviso T10), se añade entrada nueva con
  `🔁 en revisión` y se toca el log.
- **el dueño de los tableros**: faltan las filas T11/T12 en la semana 1 y el
  T0 de la semana 2 ya no depende de «commit+push».
