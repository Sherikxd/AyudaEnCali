# Log — backend (2026-10-01)

## En qué trabajé

- Ronda del plan `docs/agentes/plan-copilot-2026-10-01.md`: **BUG-01** (P1),
  **BUG-03** (P3) y **MEJ-01** (contrato Express ↔ funciones Vercel).
- Solo mi área: `server/**` y `scripts/**`. Sin `git commit`. No toqué
  `supabase/**` (0 ficheros modificados) → `npm run verify:rls` = n/a.

## Cambios realizados

### BUG-01 — `server/handlers/needsSupport.ts` (apoyos que respondían éxito sin persistir)

- **Antes** (reproducido en rojo): con `getSupabaseClient()` presente y
  `handledInDb === false` — RPC transitoria agotada **o** `write.error` en el
  respaldo — el código caía al bloque `if (!handledInDb)`, mutaba la caché y
  el set de supporters y respondía `success: true` (200). En Vercel eso se
  pierde en el siguiente cold start.
- **Después**: con cliente Supabase el handler se bifurca en tres ramas
  exclusivas:
  1. RPC confirma recuento numérico → 200 (igual que antes).
  2. RPC con error **no transitorio** (esquema anterior a `db:setup`) →
     respaldo directo; si `write.error`, el recuento o el `update` fallan →
     `respondWriteFailure` → **503** (antes `write.error` caía a caché).
  3. **RPC transitoria agotada o respuesta sin recuento numérico →
     `respondWriteFailure` → 503 explícito** y `return null`, **sin mutar la
     caché ni el set de supporters** (el cliente ya revierte su actualización
     optimista en el `catch` de `supportNeed` — leído solo en
     `src/context/AppContext.tsx:1555-1557`).
- El toggle en caché quedó **exclusivamente** en el `else` de `if (client)`
  (modo sin cliente Supabase), conservando la idempotencia (repetir `add` no
  duplica; `remove` no baja de 0). Doc del handler actualizada con el
  invariante.
- Evidencia: **M1** (sin BD → 200 caché), **M2** (remove → 0), **M12**
  (transitoria → 503 sin `success`), **M13/M15** (caché intacta),
  **M14** (503 idéntico en Express y en Vercel), **M16** (`write.error` →
  503, caché intacta).

### BUG-03 — mismo fichero (conteo truncado a 10 000)

- **Antes**: `.select('need_id').eq(…).limit(10_000)` + `rows.length`.
- **Después**: `select('need_id', { count: 'exact', head: true }).eq(…)` →
  recuento **exacto** de PostgREST por cabecera `content-range` (HEAD, sin
  traer filas); guard `typeof count !== 'number'` → `respondWriteFailure`
  (nunca un recuento inventado); el `update supporters_count` usa ese count.
  Cuidados los tipos: `withSupabaseRetry<{ need_id: string }[]>` (la data del
  builder sigue siendo `Row[] | null`; `count` se lee del `SupabaseResult`).
- Evidencia: **M17/M18** → `count=12345`. El stub de BD falsa responde
  `content-range: 0/12345` al HEAD; el viejo camino con `limit=10000` solo
  recibiría 2 filas (ver rojo abajo).

### MEJ-01 — `scripts/test-nucleos.mjs` (contrato Express ↔ funciones Vercel)

- Nueva **sección M** (19 checks; el harness pasa de 65 a **84**) integrada
  en `npm run test:server` **sin tocar `package.json`**:
  - **Express real**: `server/app.ts` montado con `http.createServer` en
    puerto efímero y peticiones con el `fetch` nativo (guardado antes del
    stub).
  - **Funciones Vercel**: `api/needs-support.ts`, `api/needs.ts` y
    `api/support-mine.ts` invocados con `req`/`res` falsos y las URLs que
    producen los rewrites de `vercel.json` (`_orig` + `id`) o los espejos
    filesystem.
  - Helper `contrato()`: exige **mismo status y mismo cuerpo JSON en LOS
    DOS** adaptadores + una expectativa por escenario aplicada a las dos
    respuestas.
  - Escenarios: 401 sin sesión (canónico vs rewrite con `_orig`+`id`, y solo
    `_orig`), 403 de autoría, 404 canónico (método no soportado con id),
    404 espejo (`/api/needs-support?id=` y `/api/support-mine`), 200 con
    sesión (add/remove), **503 de persistencia del BUG-01** y respaldo con
    conteo exacto del BUG-03.
- Falso PostgREST para las fases «con BD»: `initSupabase()` real apuntando a
  `http://supabase.test` + stub del `fetch` global con modos `down` (la RPC
  lanza `fetch failed` → transitoria), `missing-rpc-write-down` (RPC 404
  `PGRST205` + upsert caído) y `missing-rpc` (respaldo OK). Sin dependencias
  nuevas; reutiliza `check`/`call`/`fakeRes`/`mintJwt`/`sameText`.

### Verificación en rojo (romper a propósito, y restaurar)

| Sabotaje temporal | Resultado |
| --- | --- |
| BUG-01: rama 3 restaurada a caché+success | ❌ **4 FALLO** (M12–M15; `status=200 success:true`) |
| BUG-01: `write.error` sin `return` (viejo flujo) | ❌ **1 FALLO** (M16: `status=200 success:true`) |
| BUG-03: restaurado `.limit(10_000)` + `rows.length` | ❌ **2 FALLO** (entonces M16/M17: `count=2`, el truncado) |
| MEJ-01: mensaje `apiNotFound` alterado solo en Express | ❌ **2 FALLO** (M5, M8: divergencia Express ≠ Vercel) |

Tras cada sabotaje: fichero restaurado desde backup
(`/tmp/opencode/ayudaencali-bak`), `diff` contra el backup sin diferencias y
`grep -c SABOTAJE` = 0 en ambos.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ❌ **1 error fuera de mi área**: `src/context/AppContext.tsx(1953,11) TS2739` (`needAlertsEnabled`/`setNeedAlertsEnabled` — agente-frontend con MEJ-03 en paralelo; iba 3 errores, relancé y bajó a 1). En mis ficheros (`server/`, `scripts/`, `api/`, `supabase/`): **0 errores** (recontado con grep). |
| `npx vite build` | ✅ `✓ built in 452ms` |
| `npm run test:ui` | ✅ `TODO OK` |
| `npm run test:server` | ✅ `TODO OK` (**84/84** checks) |
| `npm run smoke:vercel` | ✅ `43 comprobaciones · 0 fallos` (10 funciones ≤ 12: sin cambios) |
| `npm run verify:rls` | n/a — 0 ficheros tocados en `supabase/` |

## Decisiones tomadas (y por qué)

- **RPC transitoria agotada → 503 sin probar el respaldo directo**: si la red
  o la BD están caídas, el upsert directo fallaría igual y solo añadiría
  latencia (reintentos). El respaldo se mantiene únicamente para el error
  **no transitorio** (PGRST205: función ausente), como hasta ahora.
- **Conteo exacto con `head: true` en vez de una RPC nueva**: no toca
  `schema.sql` (sin `verify:rls`), no añade funciones Vercel (límite 12) y
  PostgREST ya devuelve `content-range` en el HEAD.
- **Sección M dentro de `test-nucleos.mjs`** en vez de script aparte:
  `test:server` ya existe en la CI y no puedo tocar `package.json`; así el
  contrato entra en CI sin cambios de empaquetado.
- **Cliente Supabase de mentira vía `initSupabase()` + stub de `fetch`** en
  vez de un setter de pruebas en `server/supabase.ts`: cero ganchos de test
  en código de producción (la sección A1 sigue exigiendo cliente `null`).

## Riesgos y deuda que dejo

- La sección M **debe ser la última** del harness: en M11 se instala un
  cliente Supabase en el módulo compartido y no existe un reset; si alguien
  añade secciones después, verán la BD falsa (o un cliente ya creado).
- El stub de PostgREST solo cubre los endpoints que ejercitan los tests
  (`rpc/toggle_need_support`, `need_supporters`, `help_needs`); el resto
  responde `[]`. Si un escenario nuevo toca otra tabla, hay que ampliarlo.
- El limitador de escrituras se comparte entre adaptadores en el proceso de
  test (misma IP): hoy 6 usos en `198.51.100.40` (llamadas al núcleo) y 14
  en `127.0.0.1` (Express + Vercel), contra un máximo de 60/min. Si la
  sección M crece mucho, repartir IPs.
- El contrato compara status + cuerpo JSON; no compara cabeceras de
  seguridad (esas ya las cubre el `smoke:vercel`).

## Para el siguiente agente

- **agente-calidad**:
  - `npm run test:server` ya engancha BUG-01, BUG-03 y el contrato (sección
    M, 19 checks). Si queréis un script `test:contrato` suelto o reflejarlo
    en `ci.yml`/`package.json`, hay que tocarlo vosotros (fuera de mi área);
    para que la CI lo ejecute **no hace falta**: ya está en `test:server`.
  - `lint` rojo por `src/context/AppContext.tsx` (agente-frontend, MEJ-03 en
    marcha): relanzad cuando su trabajo cierre — en mis ficheros 0 errores.
  - El repo tenía `@vercel/analytics` declarado en `package-lock.json` pero
    **sin instalar** (reventaba `tsc` en `src/App.tsx`); ejecuté
    `npm install` con el lockfile y revertí su churn cosmético (quedó
    `package-lock.json` idéntico al del repo).
  - Funciones Vercel: sin altas ni bajas (10 en uso; el smoke sigue
    exigiendo ≤ 12).
- **agente-frontend**: con BD configurada el servidor ya **no** devuelve
  `success: true` para apoyos no persistidos: recibiréis `503` +
  `{"error":"La base de datos no está disponible. Inténtalo de nuevo en unos
  segundos."}` y vuestro rollback optimista es el comportamiento correcto (la
  cola offline del BUG-02 puede reintentarlo). Sin BD (modo local) el 200 de
  caché se mantiene igual.
