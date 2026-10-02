# Memoria para agentes

Esta carpeta es la **memoria compartida** entre agentes. Como los agentes no
recuerdan conversaciones anteriores, aquí vive todo lo que necesiten saber.

```
docs/agentes/
├── README.md                    ← este archivo (estado real del proyecto)
├── auditoria-semana-2.md        ← auditoría fresca (2026-09-30): FAL-01..15,
│                                  FEAT-01..12 y riesgos heredados
├── tareas-semana-1.md           ← tablero de la semana 1 (T0-T14 + 2 hotfixes)
├── tareas-semana-2.md           ← tablero de la semana 2 (T1-T20 + T0 + backlog)
├── decisiones.md                ← decisiones arquitectónicas ya tomadas
└── memoria/
    ├── plantilla.md             ← copia esta estructura en tu log
    ├── 00-contexto-inicial.md   ← estado del proyecto al empezar
    ├── 01-backend.md            ← T1-T4 (auth, comentarios, contador, errores)
    ├── 02-frontend.md           ← T5-T8 (sesión, offline, toasts, identidad)
    ├── 03-verificacion.md       ← T0 final + los 9 riesgos no bloqueantes
    ├── 04-vercel.md             ← T9 (despliegue en Vercel Hobby)
    ├── 05-funciones-vercel.md   ← T10 (una función por ruta)
    ├── 06-checklist-migracion.md ← T11 (checklist R1-R6 / O1-O10 / B1-B7)
    ├── 07-verificacion-t10.md   ← T12 (batería independiente, P1/KO/R5/R6)
    ├── 08-remediacion-p1.md     ← T13 (remediación + CI + smoke:vercel)
    ├── 14-reverificacion-t13.md ← T14 (re-verificación 89/89)
    ├── 15-correccion-vercel-json.md ← hotfix 1 (rutas de vercel.json)
    ├── 16-imports-esm-vercel.md ← hotfix 2 (`.js` en imports ESM)
    ├── 17-documentacion.md      ← log de documentación (memoria de agentes)
    ├── 18-readme-infra.md       ← README raíz: infraestructura (T19)
    ├── 19-backend-p1.md         ← T1-T4: identidad, ciclo de vida, /sql, XFF
    ├── 20-frontend-rapidas.md   ← T9, T11(cliente), T13, T16 + index.html
    ├── 21-calidad-infra.md      ← T17 puerta de deploy, T18 CSP, T20 higiene
    ├── 22-copilot-profundo.md   ← agente pesado: rewrites T2, T5, T6, T8, T10, T12, T14
    ├── 24-backend-bugs-copilot.md ← ronda Copilot (T21-T23: BUG-01/03, MEJ-01)
    └── 25-frontend-bugs-copilot.md ← ronda Copilot (T24-T26: BUG-02, MEJ-02/03)
```

> El **23 no se usó** (segunda pasada abortada, luego hecha por el plan
> `plan-copilot-2026-10-01.md`) y los **09-13 tampoco**: T11, T12 y T13 de la
> semana 1 viven en los logs 06, 07 y 08. Cada agente escribe **solo** en su
> propio fichero de `memoria/`.

## Semana 1 — qué se hizo (estado 2026-09-30)

| ID | Qué | Estado | Log |
| --- | --- | --- | --- |
| T1-T4 | Escrituras autenticadas (401 + JWT), comentarios en tabla `point_comments`, contador de apoyos atómico (RPC), inserts con 409/503 e IDs `randomUUID` | ✅ | `01` |
| T5-T8 | Cerrar sesión de verdad (`signOut`), sync offline con merge + cola, toasts con `aria-live`, identidad única (puerta `ensureIdentity`) | ✅ | `02` |
| T0 | Verificación final: 41/41 comprobaciones, sin bloqueantes, 9 riesgos no bloqueantes | ✅ | `03` |
| T9 | Despliegue en Vercel Hobby (`server/app.ts`, `api/index.ts`, `vercel.json`) | ✅ | `04` |
| T10 | API a una función por ruta (`server/handlers/*`, `api/*.ts`, paridad Express ↔ funciones) | ✅ | `05` |
| T11 | Checklist de la migración (bloqueantes R1-R6, altos O1-O10, bajos B1-B7) — *sin fila en el tablero* | ✅ | `06` |
| T12 | Verificación independiente de T10 (147 checks; hallazgos P1/P2/KO/R5/R6) — *sin fila en el tablero* | ✅ | `07` |
| T13 | Remediación P1/P2/KO + CI (`.github/workflows/ci.yml`) + `npm run smoke:vercel` (35 checks) | ✅ | `08` |
| T14 | Re-verificación de T13: **89/89, 0 bloqueantes locales** | ✅ | `14` |
| Hotfix 1 | `vercel.json` rechazado por `path-to-regexp` (commit `a466c33`) | ✅ | `15` |
| Hotfix 2 | Todas las funciones a 500: imports ESM sin `.js` (commit `66f1a5b`) | ✅ | `16` |

Verificación según los logs: `lint` ✅ · `vite build` ✅ · `test:ui` ✅ 40/40 ·
`smoke:vercel` ✅ 35/35 · `verify:rls` ✅ 10 pasos · T14 ✅ 89/89.

## Semana 2 — qué se hizo (estado 2026-10-01)

| Bloque | Qué | Estado | Log |
| --- | --- | --- | --- |
| Auditoría | 15 falencias (6 P1) + 12 features priorizadas | ✅ | `auditoria-semana-2.md` |
| T1-T4 | Entidades con `author_id` + FK, ciclo de vida `PATCH/PUT/DELETE`, `/sql` con token + GET paginados con `readLimiter`, `X-Forwarded-For` validada (FAL-01..06) | ✅ | `19` |
| T9, T13, T16 | IDs `randomUUID`, accesibilidad (hook `useModalDialog`, `aria-current`, `role="log"`), clustering manual + badge verificado; `index.html` sin referencias rotas | ✅ | `20` |
| T17, T18, T20 | `buildCommand` de Vercel con `lint`+`test:ui` (puerta real), `verify:rls` bloqueante en PRs, CSP + cabeceras verificadas en Chromium (0 violaciones), deps sin uso retiradas | ✅ | `21` |
| T19 | `README.md` reescrito: infraestructura sincronizada (FAL-14) | ✅ | `18` |
| T2-rewrites, T5, T6, T8, T10, T12, **T14** | Agente pesado con Copilot CLI: rewrites de `PATCH/DELETE` en `vercel.json`, fallback único del chat (`server/chatFallback.ts` + `server/geo.ts`), `scripts/test-nucleos.mjs` (65/65, destapó y arregló el bug de la cola `pendingWrite`), ciclo de vida en la UI, `AppContext` memoizado, fallback cliente eliminado | ✅ | `22` |
| **T0 local** | `lint` · `vite build` · `test:ui` 40/40 · `test:server` 65/65 · `smoke:vercel` **43/43** — todo verde el 2026-10-01 | ✅ | coordinación |
| **Pendientes** | T7 (verificación/moderación), T11 (semilla única: falta `server/seedData.ts`), T15 (PWA manifest+SW) | ⬜/🟡 | — |

## Qué queda abierto (2026-10-01)

| Riesgo | Origen | Estado |
| --- | --- | --- |
| **Humo oficial contra producción** (`SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel`) — cierra P1-1, P1-2, KO-3 y KO-4 y valida en vivo T2/T3/T17/T18 | `14`, auditoría | ⬜ **Sigue pendiente**: exige commit+push de la persona y deploy nuevo; la batería local da 43/43 |
| **T7 · verificación/moderación** (FEAT-02): `verified` real con rol y cola de reportes | `tareas-semana-2.md` | ⬜ sin ejecutar (T1 ya la desbloquea) |
| **T11 · semilla única** (FAL-08): `server/seedData.ts` aún no importa de `src/data/initialData.ts`; parte cliente hecha | `20` | 🟡 |
| **T15 · PWA offline** (FEAT-05): manifest + Service Worker (la cola offline ya funciona) | `tareas-semana-2.md` | ⬜ |
| **CSP solo en Vercel**: `server/middleware.ts`/`http.ts` no la envían → local/Docker queda sin CSP (paridad pendiente, fichero backend) | `21` | ⬜ |
| **`SUPABASE_ACCESS_TOKEN` y claves de Clerk (`pk_test_`)** fuera del panel, variables en Production *y* Preview, rotación de Cloudinary, protección de rama `main`, lockfile (`bun.lock` vs `package-lock.json`) | `06`, `17`, `21` | ⬜ de la **persona** |
| **O4** · logs de Hobby: 1 h de retención, sin alerts | `06` | ⬜ sin decidir |
| **Backlog de features**: FEAT-03 landings, FEAT-04 alertas, FEAT-06 API versionada, FEAT-08 proximidad, FEAT-10 realtime, FEAT-12 métricas | `tareas-semana-2.md` | ⬜ sin asignar |
| **Ciclo completo CI → deploy → smoke en producción** nunca validado de punta a punta | auditoría | ⬜ (local verde; falta la corrida en prod) |

<details>Tablero de la semana 1 y su estado viejo (2026-09-30):

| Riesgo | Origen | Estado |
| --- | --- | --- |
| **Humo oficial contra producción** (`SMOKE_BASE_URL=https://ayuda-en-cali.vercel.app npm run smoke:vercel`) — cierra P1-1, P1-2, KO-3 y KO-4 de T13/T14 | `auditoria-semana-2.md`, `14` | ⬜ pendiente. *Sonda manual de hoy* ✅: `/api/health` 200 · `points` con `source:"supabase"` · JSON malformado → 400 · apoyo sin sesión → 401 · espejos → 404 · `/api` → 404 · `/ruta-inexistente` → 404. No sustituye a la batería de 35 checks |
| **`X-Forwarded-For` sin validar** → el rate limit (15/min chat, 60/min escrituras) es eludible con cabeceras falsas (**FAL-06**, P1) | `14:130` | ⬜ → T4 de `tareas-semana-2.md` |
| **B2** · `GET /api/supabase/sql` público (hoy **200** en producción, expone el DDL) | `06` | ⬜ → T3 semana 2 (FAL-05) |
| **O2** · `SUPABASE_ACCESS_TOKEN` fuera del entorno de la función (token de cuenta + N sondas de DDL) | `06` | ⬜ → panel de la persona |
| **O4** · logs de Hobby: 1 h de retención, sin alerts → un error de ayer ya no se investiga | `06` | ⬜ sin decidir |
| **O9** · cabeceras de seguridad en los estáticos (hoy `/` **no** tiene `nosniff`/`X-Frame-Options`; **CSP = 0** en el repo) | `06`, FAL-13 | ⬜ → T18 semana 2 |
| **9 riesgos no bloqueantes de T0**: `test:ui` no cubre T5-T8 · vitrina suplantable (`userName`/`userRole` del body) · IDs de cliente con `Date.now()` · `help_needs` sin `author_id` · `point_comments` sin FK · fallback de apoyos con tope 10 000 · `pending` rechazado se queda «para siempre» · refs a `src/context/ClerkSync.tsx` (el real es `src/components/`) · toast cosmético de sesión | `03` | ⬜ la mayoría → semana 2 |
| **Ciclo completo CI → deploy → smoke en producción nunca validado de punta a punta** | `auditoria-semana-2.md` | ⬜ (deploy hecho y en verde a ojo; falta el smoke y una corrida de CI registrada) |
| **Auditoría semana 2**: 6 P1 (FAL-01..06), 7 P2 (FAL-07..13), 2 P3 (FAL-14..15) y 12 features | `auditoria-semana-2.md` | ⬜ → `tareas-semana-2.md` (T1-T20 + T0) |
| De la **persona**: variables en Production *y* Preview (R1), claves de Clerk (hoy `pk_test_`) y rotación de Cloudinary (R2/R3), protección de rama | `06` | ⬜ |

</details>

## Cómo usarla

**Al empezar (semana 2):**
1. `auditoria-semana-2.md` → qué está roto y qué vale la pena construir.
2. `tareas-semana-2.md` → busca las tareas con tu nombre (y el orden/paralelismo).
3. `decisiones.md` → no reabres lo ya decidido (identidad = JWT de Clerk, RLS
   sin políticas en tablas internas, una función por ruta, imports con `.js`…).
4. `memoria/<NN>-<area>.md` de tu área → qué se hizo y qué deuda hay.

**Al terminar:**
1. Copia `plantilla.md` a `memoria/<NN>-<area>.md` y rellénala.
2. Cambia el estado de tus tareas a `✅` (o `⛔ bloqueada` con el motivo).
3. Si algo queda a medias o es frágil, dilo en tu log: el siguiente agente
   lo arreglará; no lo ocultes. Deja también los riesgos en esta página.

## Reglas de escritura

- **Cada agente escribe solo en su propio fichero de `memoria/`** (nunca en
  el de otro) para que las escrituras simultáneas no se pisen.
- `tareas-semana-1.md` y `tareas-semana-2.md`: edición puntual y mínima
  (solo tu fila).
- `decisiones.md`: no edites entradas cerradas; si propones un cambio,
  añade al final una entrada nueva con `🔁 en revisión` (fecha, decisión,
  alternativa descartada, por qué) y anótalo en tu log.
- `README.md` (este fichero): lo mantiene el área de documentación; si
  detectas que miente, dilo en tu log y él lo corrige.
