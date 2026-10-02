/**
 * Reglas de la siembra de apoyos (T29 · FAL-08) — puras, sin BD.
 *
 * `help_needs.supporters_count` es un contador **materializado**: la RPC
 * `toggle_need_support` lo recalcula con `count(*)` sobre `need_supporters`.
 * Si la semilla solo escribe el número del dataset y no siembra filas, el
 * tablón miente («18 apoyos» con 0 filas que lo respalden).
 *
 * Estas funciones deciden QUÉ sembrar; `scripts/seed-db.ts` es quien habla
 * con Supabase. Están separadas para poder comprobarlas en `npm run
 * test:server` (sección S) sin tocar ninguna base.
 *
 * Reglas, por necesidad:
 *
 *  1. Si `need_supporters` está **vacía** → se siembra `supportersCount`
 *     filas con ids deterministas (misma semilla en cada corrida).
 *  2. Si ya hay filas (apoyos reales de la comunidad) → **no** se añade
 *     nada: una base con actividad nunca se infla con apoyos de mentira.
 *  3. El recuento final (`count(*)`) lo escribe siempre el script, de modo
 *     que el contador cuadre con las filas pase lo que pase.
 */

/** Fila en forma de tabla `need_supporters`, lista para el `upsert`. */
export interface SupporterSeedRow {
  need_id: string;
  user_id: string;
}

/** Id determinista de un apoyo sembrado (reproducible en cada corrida). */
export function supporterSeedId(needId: string, position: number): string {
  return `seed-supporter-${needId}-${position}`;
}

/**
 * Filas que hay que sembrar para una necesidad.
 *
 * @param needId       id de la necesidad (`need-1` … `need-6`).
 * @param target       `supportersCount` del dataset (los apoyos que el
 *                     respaldo promete).
 * @param existingCount filas que ya hay en `need_supporters` para ese id.
 *
 * @returns exactamente `target` filas si no había ninguna; `[]` si ya había
 *          apoyos reales o si el dataset no promete ninguno.
 */
export function supporterRowsToSeed(
  needId: string,
  target: number,
  existingCount: number,
): SupporterSeedRow[] {
  if (target <= 0 || existingCount > 0) return [];
  return Array.from({ length: target }, (_, index) => ({
    need_id: needId,
    user_id: supporterSeedId(needId, index + 1),
  }));
}
