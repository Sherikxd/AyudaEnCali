# Plan del pensador principal (Copilot CLI) — 2026-10-01

> Salida de `copilot -p` como arquitecto: leyó memorias (00-22),
> `tareas-semana-2.md`, `auditoria-semana-2.md`, `decisiones.md` y el código
> actual. Entrada de la ronda de arreglo BUG-01..03 / MEJ-01..03.

## BUGs existentes

| ID | Sev | Ficheros | Problema | Esfuerzo |
|---|---|---|---|---|
| **BUG-01** | **P1** | `server/handlers/needsSupport.ts:182-200`; `src/context/AppContext.tsx:1544-1557` | Si Supabase está configurado pero la operación falla (RPC transitoria agotada o `write.error`), el handler cae a `if (!handledInDb)`, modifica solo la caché y responde `success: true` (200). En Vercel la memoria no es persistencia: el apoyo puede desaparecer en un cold start y el cliente lo da por confirmado. | M |
| **BUG-02** | P2 | `src/context/AppContext.tsx:201, 857-889`; contador `:778-805` | La cola offline reintenta cada elemento máx. 3 veces; un 4xx permanente solo se registra: el ítem conserva `pending` sin estado de rechazo ni acción visible (corregir/reintentar/descartar). | M |
| **BUG-03** | P3 | `server/handlers/needsSupport.ts:149-165` | El fallback de conteo trae `.limit(10_000)` filas y usa `rows.length` como total → contador truncado si supera 10k (solo camino sin RPC). | S |

## MEJORAS

| ID | Valor | Propuesta | Esfuerzo |
|---|---|---|---|
| **MEJ-01** | Alto | Test de **contrato Express ↔ funciones Vercel**: escenarios equivalentes (autoría, 401/403/404, errores de persistencia, rutas reescritas) integrado en `test:server`. | M |
| **MEJ-02** | Alto | **Proximidad en mapa y tablón**: orden/filtro optativo por distancia (ya hay `userLocation` y cálculo de distancia); mantener orden actual por defecto. | S–M |
| **MEJ-03** | Alto | **Alertas locales por barrio**: suscripción optativa + consulta acotada deduplicada por ID con el GET existente (el refresco actual solo corre con error/pendientes); sin coordenadas precisas ni funciones nuevas. | M–L |

## NO-TOCAR

- No reabrir T7, T11, T15 (siguen en su tablero); no repetir FAL cerrados;
  CSP fuera de Vercel y humo de prod quedan donde están.
- Sin cambios de esquema (si hacen falta → `verify:rls`).
- ≤ 12 funciones Vercel (10 en uso). Sin tocar decisiones cerradas.

## Plan por áreas y paralelismo

1. **Backend**: BUG-01 primero (+ pruebas en `scripts/test-nucleos.mjs`) →
   BUG-03 consolidado → MEJ-01 (contrato en `scripts/**`).
2. **En paralelo** (no comparte ficheros): **Frontend** BUG-02 → MEJ-02 →
   MEJ-03 (secuenciales: tocan todos `AppContext.tsx`).
3. **Calidad** cierra: `lint` · build · `test:ui` · `test:server` ·
   `smoke:vercel` y comprueba que no crece el número de funciones.
