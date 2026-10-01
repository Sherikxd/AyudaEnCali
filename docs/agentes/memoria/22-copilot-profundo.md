# Log — AGENTE PESADO / Copilot profundo (2026-10-01)

## En qué trabajé

Prioridades P0→P5 en orden, con verificación manual de cada una:

- **P0** — rewrites de `vercel.json` (rutas de la SPA hacia las funciones).
- **P1** — `T10` · Ciclo de vida en la UI (FEAT-01 front).
- **P2** — `T5` + `T14` + `FEAT-07/T8` (fallback único del chat + contexto geográfico).
- **P3** — `T12` · AppContext memoizado (FAL-09).
- **P4** — `T6` · Tests de los núcleos y de la cola offline (FAL-07).
- **P5** — *no ejecutado* (ver «Riesgos y deuda»).

## Cambios realizados

### P0 — `vercel.json` (rewrites)

- Rewrites de rutas SPA colocados **después** de `/:id/support` y **antes**
  del catch-all, con patrón `_orig=` + `id=:id` para no pisar los parámetros
  de ruta que ya consumen las funciones.
- Validación del fichero clave a clave con *ajv* (validación global falla
  contra el esquema oficial de Vercel por detalles irrelevantes) →
  `RESULTADO: VALIDO`.

### P1 — T10: ciclo de vida en la UI

- `src/types/index.ts` → estado `archivada` en `NeedStatus`/`NEED_STATUSES`
  (sin migración: la columna es `TEXT`) + su validación.
- `src/context/AppContext.tsx` → acciones de ciclo de vida (PATCH/PUT/DELETE
  de puntos y necesidades) reutilizando `notifyLifecycleError` (T10 · Toast).
- `src/components/BlogView.tsx` / `src/components/MapView.tsx` → acciones de
  dueño (solo el autor ve editar/archivar/eliminar).

### P2 — T5 + T14 + FEAT-07: un solo fallback del chat

- **Nuevo** `server/chatFallback.ts` → `localReply` (respuesta local del
  servidor, sin API key) y **nuevo** `server/geo.ts` (barrio/coords de Cali).
- `server/handlers/chat.ts` reescrito: usa `localReply`, expone
  `buildSystemInstruction` (para testearlo) y valida coordenadas en
  `validateChat`.
- `src/services/geminiService.ts` → solo reenvía y **lanza** en error (el
  `getLocalIntelligentFallback` cliente desapareció: `grep -rn
  "getLocalIntelligentFallback" src/` → 0); `src/components/ChatView.tsx`
  → `Toast` de error en su lugar.
- Verificado **en vivo** con y sin coordenadas: `source: "local"`,
  `reply_len: 595`.

### P3 — T12: memoización de `AppContext`

Tres piezas en `src/context/AppContext.tsx` + consumidores:

1. **`MapUIContext` separado** (`AppContext.tsx:144-157`): `mapCenter`,
   `mapZoom`, `selectedPoint`, `initialCoordsForNewPoint` + setters y
   `focusPointOnMap`. El mapa deja de re-renderizar el tablón/modales y
   viceversa.
2. **`useStableCallback`** (`AppContext.tsx:167`): las ~23 acciones
   expuestas (`supportNeed`, `openAuthModal`, `notify`, `setTab`,
   `toggleBookmark`…) se envuelven en un wrapper *latest-ref* → identidad
   estable y los `useMemo` no se invalidan por cambiar de función.
3. **Dos `useMemo` anidados** (`mapUiValue:1630`, `appValue:1661`) y
   consumidores migrados a `useMapUI()`: `MapView`, `ReportModal`,
   `ChatView`, `ProfileView`.

**Verificación propia** además de la cadena estándar: arnés de recuento de
renders en jsdom (`/tmp/opencode/t12/check-t12.mjs`, misma receta que
`test-authmodal.mjs`) → **13/13 OK**: seleccionar punto/zoom Δapp=0,
FAQ/toast Δmap=0, identidades de acciones estables.

### P4 — T6: `scripts/test-nucleos.mjs` (65 checks)

`package.json` ya tenía el guion cableado: `npm run test:server` →
`node --env-file-if-exists=.env scripts/test-nucleos.mjs`.

**Diseño** (hereda las lecciones de los harnesses del log 19):

- **Sin Express ni BD**: los núcleos de `server/handlers/*` se invocan
  directamente con `ApiRequest` + `JsonResponder` falsos replicando
  `mount()` de `server/app.ts`. **No se importa `server/bootstrap.ts`** →
  el cliente Supabase queda `null` y todo corre contra la caché en memoria
  (además se fuerzan `SUPABASE_*=''`). Cero efectos sobre la BD real.
- **Sin red**: `fetch` global stubbeado (JWKS de Clerk → clave pública RSA
  generada en el propio script; apoyo del cliente → recuento 99).
  `GEMINI_API_KEY=''` deja el chat en `source:'local'` determinista;
  `CLERK_SECRET_KEY` forzado para que el resultado no dependa del `.env`.
- **JWTs de prueba** firmados localmente con `cryptoSign('sha256')`
  (`kid: test-nucleos-key`), incluido un JWT **caducado** y otro con firma
  **alterada**.
- **Parte cliente**: `AppProvider` en jsdom + `vite.ssrLoadModule` con alias
  de `@clerk/clerk-react` a un stub en tmpdir (controlado por
  `globalThis.__testSession`) → ejercita `ensureIdentity`, `queueWrite` y
  `pendingWrite` (0 tests hasta ahora).

**Secciones**: BD/aislamiento · paginación (B1-B4) · readLimiter 121→429 ·
XFF forjada (D1-D8, bucket compartido) · necesidades E1-E11 (401 sin
sesión, 201 con JWT, autoría, 400/403/404/401-tampered) · puntos F1-F7
(PATCH/PUT/DELETE + 403) · apoyos G0-G6 · espejos H1-H7 (404 canónico) ·
chat local I1-I3 (429 en la 16ª) · `respondWriteFailure` 503/409 J1-J2 ·
sync K1-K4 (`mergeById`/`countPending`) · cola L1-L9 (encolar →
reanudar → descartar).

**Hallazgo real (bug de la app, no del test)**: el check **L6** descubrió
que la cola `pendingWrite` **nunca podía reanudarse**: el `build` encolado
cierra sobre `ensureIdentity` del render firmado-`false`, así que al entrar
la sesión se re-encolaba (`resumes=2 > MAX_WRITE_RESUMES=1`) y el efecto
la descartaba («agotadas las reanuraciones automáticas»). **Arreglado** con
un espejo `identityRef` (`AppContext.tsx:301`, patrón ya usado por
`serverReachableRef`) que `ensureIdentity` (`AppContext.tsx:509`) lee en
lugar del estado del render. El bug **preexistía en HEAD** (verificado con
`git show HEAD:…`): no lo introdujeron P1/P3.

**Prueba de rojo obligatoria (T6)**: mutación quirúrgica del 401 de
`POST /needs` (401→201) → el script sale en **rojo** encendiendo
**E1/E10/E11** con `exit=1`; código restaurado y verificado sin residuos
(`grep PRUEBA-ROJO` → 0).

### P4 — mejoras incorporadas de Copilot (segunda opinión)

Dos prompts no interactivos (`copilot -s -p '…'`) sobre P3 y sobre el
test; acciones tomadas:

1. **Stub de apoyo más estricto**: exige `method=POST` + `Bearer` → un fallo
   de identidad en el cliente no puede dar un falso positivo en L6.
2. **B2 sin solapamiento débil**: ahora comprueba que **ningún** id de la
   página 1 aparezca en la 2 (antes solo el primer elemento).
3. Reserva anotada de `ref.current` mutado durante render (ver deuda).

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ (0 errores, `tsc --noEmit` estricto) |
| `npx vite build` | ✅ (built in 507ms) |
| `npm run test:ui` | ✅ (40/40 · `TODO OK`) |
| `npm run test:server` | ✅ (65/65 · `TODO OK`) |
| `npm run smoke:vercel` | ✅ (43/43 · `TODO OK`) |
| `npm run verify:rls` | n/a (no toqué `supabase/schema.sql`) |
| Prueba de rojo (mutar 401) | ✅ `exit=1`, E1/E10/E11 en rojo → restaurado |
| Arnés de renders T12 | ✅ 13/13 (`/tmp/opencode/t12/check-t12.mjs`) |

Orden respetado: lint → build → test:ui → test:server → smoke:vercel.

## Decisiones tomadas (y por qué)

- **`archivada` sin migración**: `NeedStatus` es `TEXT` en Postgres; añadir
  el valor al tipo/validador basta → `verify:rls` no aplica.
- **Rewrites con `_orig=` + `id=:id`**: preserva los parámetros que ya
  consumen las funciones; validados clave a clave (ajv global falla contra
  el esquema oficial de Vercel sin ser un error real).
- **Tests sin Express ni bootstrap**: los núcleos son funciones puras sobre
  `ApiRequest`/`JsonResponder`; así se aíslan de BD y red sin tocar nada del
  servidor. El «cableado» Express/Vercel lo cubre `smoke:vercel` (43 checks)
  — división de responsabilidades entre ambos scripts.
- **Alias en tmpdir para el stub de Clerk** (y no un plugin `resolveId`): en
  SSR Vite externaliza `@clerk/clerk-react` a `import()` nativo y un plugin
  `resolveId` (incluso con `enforce:'pre'`) **no llega** a interceptar —
  comprobado empíricamente; el alias de Vite sí.
- **`identityRef` en `ensureIdentity`**: arreglo mínimo y local para el bug
  de L6, siguiendo el patrón de espejo existente en el fichero; sin cambiar
  la API pública del contexto.
- **Regex sobre fuente de `test-authmodal.mjs`**: se dejan tal cual (T6 lo
  permite explícitamente) y se anota aquí como deuda para T17.
- **P5 no ejecutado**: T15 (PWA) exige `vercel.json` (área T17/T18) y T7
  (moderación) exige tocar `supabase/schema.sql` → `verify:rls` con red +
  decisión de funciones Vercel (10/12). Ambas con dependencias/bloqueos de
  otras áreas; preferí no invadirlas con la cadena de P0-P4 ya verde.

## Riesgos y deuda que dejo

- **`ref.current` mutado durante render** (`useStableCallback:169` y
  `identityRef:302`): patrón habitual y aquí inocuo (React 19 + render
  único por commit en esta app), pero en concurrente con interrupciones
  podría exponer un valor de un render no confirmado. Alternativa futura:
  `useLayoutEffect`. Lo señala la segunda opinión de Copilot.
- **Closures de `pendingWrite`**: el `build` encolado puede conservar
  estado capturado más allá de la identidad (p. ej. `helpNeeds` del render
  al reanudar un `updateNeed`). Hoy los reenvíos usan *updaters* funcionales
  y los datos del servidor mandan, pero no está testeado explícitamente.
- **Los ~15 checks regex de `test-authmodal.mjs`** no se convirtieron a
  aserciones de comportamiento (permitido en T6; T17 debería hacerlo).
- **Cobertura que queda fuera de `test:server`**: el cableado
  Express/Vercel (rewrites, pre-parseo de body, `XFF` del adaptador) vive en
  `smoke:vercel`; los núcleos se prueban aislados. No hay test que pase de
  una a otra capa.
- **Stub de Clerk miente a propósito**: `getToken` devuelve un token fijo y
  la sesión cambia por variable global; cubre las ramas del contexto pero
  **no** la integración real de Clerk (eso solo lo prueba un entorno con
  Clerk de verdad).
- **Acoplamiento a la semilla**: E/G/L usan ids y contadores de la semilla
  (`need-1`, `supportersCount: 18`). Si cambia `src/data/initialData.ts`,
  tocar esos checks.
- **`server/handlers/needs.ts`** sigue documentando el ciclo de vida
  antiguo en comentarios doc (`activa|en_proceso|resuelta`) pese a
  `archivada` — cosmético, pendiente del dueño del área.
- **`server/handlers/needs.ts`**: el diff de Git en ese fichero es
  mayormente trabajo **preexistente** de otros agentes (semana acumulada
  sin commitear); mi única intervención puntual (mutación de prueba) quedó
  restaurada.
- **P5 (T15/T7) sin tocar** — ver decisiones.

## Para el siguiente agente

- `npm run test:server` es **verificación obligatoria** a partir de ahora
  (junto a `lint`/`build`/`test:ui`/`smoke:vercel`): 65 checks, ~8 s,
  sin BD ni red. Si rompes un núcleo o un mensaje contractado, sale en rojo
  — la mutación del 401 lo demostró.
- Los mensajes de error, 404 y límites de tasa están **literalmente**
  asertados a propósito (son contrato); si cambias copy de error, actualiza
  el check correspondiente en `scripts/test-nucleos.mjs`.
- El bug de reanudación (L6) estaba en HEAD: si ves que la cola vuelve a
  «agotar reanuraciones», mira `identityRef` en `AppContext.tsx:301` antes
  que nada.
- Para añadir checks de servidor: monta el handler con `call()` (replica de
  `mount()`), nunca con `bootstrap`/BD. Lecciones previas aplicadas: el
  `body` del `ApiRequest` siempre debe ir definido y hay que consumir la
  respuesta para no dejar promesas colgadas.
- Copilot CLI está disponible (`copilot -s -p '…'`, `-s` = *silent*); lo usé
  para dos revisiones de segunda opinión con buen resultado.
