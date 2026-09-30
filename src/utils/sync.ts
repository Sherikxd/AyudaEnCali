/**
 * Fusión de listas cliente ↔ servidor para el sync offline.
 *
 * Motivo: hasta ahora un `GET /api/points` exitoso **reemplazaba** la lista
 * entera y reescribía `localStorage`, borrando lo que se había guardado en el
 * dispositivo con el servidor caído. Aquí la fusión es por `id`.
 */

interface Syncable {
  id: string;
  pending?: boolean;
}

/**
 * Combina la lista local con la que devuelve el servidor, elemento a elemento
 * por `id`:
 *
 *  - **Lo remoto gana**: si el mismo `id` existe en ambos, manda el del
 *    servidor (ahí está la verdad de BD: contadores, `verified`, bajas…).
 *  - **Lo local se conserva** cuando no está en el servidor: primero los que
 *    siguen `pending` (lo reportado sin conexión, que el usuario necesita ver)
 *    y después el resto de datos locales de origen de usuario.
 *  - **El contenido de ejemplo (`seedIds`) se descarta** si el servidor no lo
 *    trae: ese contenido lo siembra el propio servidor, y conservarlo aquí
 *    duplicaría los puntos oficiales en el mapa.
 *  - Si el servidor no devuelve nada (o devuelve basura), se conserva la lista
 *    local tal cual: nunca se pierde trabajo por un `GET` vacío.
 */
export function mergeById<T extends Syncable>(
  local: readonly T[],
  remote: readonly T[] | undefined,
  seedIds: ReadonlySet<string>,
): T[] {
  if (!Array.isArray(remote) || remote.length === 0) return [...local];

  const remoteIds = new Set<string>(remote.map((item) => item.id));
  const localOnly = local.filter((item) => !remoteIds.has(item.id));

  const pendingFirst = localOnly.filter((item) => item.pending === true);
  const restLocal = localOnly.filter((item) => item.pending !== true && !seedIds.has(item.id));

  return [...pendingFirst, ...remote, ...restLocal];
}

/** ¿Quedan elementos locales sin confirmar por el servidor? */
export function countPending<T extends Syncable>(items: readonly T[]): number {
  let total = 0;
  for (const item of items) if (item.pending === true) total += 1;
  return total;
}
