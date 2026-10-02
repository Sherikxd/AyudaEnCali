/**
 * Caché en memoria compartida por los núcleos de ruta (respaldo si Supabase
 * no responde).
 *
 * Vive una sola vez por proceso: en local/Docker/Cloud Run es un único
 * contenedor y en Vercel cada función tiene su propio aislamiento (una
 * instancia por módulo), igual que cualquier otro estado en memoria.
 */
import { INITIAL_COMMENTS, INITIAL_HELP_NEEDS, INITIAL_HELP_POINTS } from './seedData.js';
import type { EntityReport, HelpNeedWithAuthor, ReportEntityType } from './entities.js';
import type { HelpPoint, PointComment } from '../src/types/index.js';

/** Tope de elementos que se mantienen en memoria como caché de respaldo. */
const MAX_CACHED_ITEMS = 500;

export const memory: {
  points: HelpPoint[];
  needs: HelpNeedWithAuthor[];
  comments: PointComment[];
  /** Cola de reportes de moderación (T28), espejo de `entity_reports`. */
  reports: EntityReport[];
} = {
  points: [...INITIAL_HELP_POINTS],
  needs: [...INITIAL_HELP_NEEDS],
  comments: [...INITIAL_COMMENTS],
  reports: [],
};

/**
 * Apoyos ("likes") por necesidad en memoria: `needId -> conjunto de userId`.
 *
 * Es el espejo local de la tabla `need_supporters` y respalda los casos en
 * los que Supabase no está disponible. Sin base de datos solo existe en este
 * proceso (se pierde al reiniciar, igual que el resto de la caché).
 */
const needSupporters = new Map<string, Set<string>>();

export function getSupporterSet(needId: string): Set<string> {
  let set = needSupporters.get(needId);
  if (!set) {
    set = new Set();
    needSupporters.set(needId, set);
  }
  return set;
}

/** Devuelve los apoyos en memoria para poder recorrerlos (`for…of`). */
export function allSupporters(): IterableIterator<[string, Set<string>]> {
  return needSupporters.entries();
}

export function pushInCache<T>(list: T[], item: T): T[] {
  return [item, ...list].slice(0, MAX_CACHED_ITEMS);
}

/**
 * Sustituye el elemento con el mismo `id` tras una edición (T2) y lo añade
 * al principio si no estaba (la caché puede estar desactualizada).
 */
export function replaceInCache<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) return pushInCache(list, item);
  const next = [...list];
  next[index] = item;
  return next;
}

/** Retira de la caché el elemento borrado (T2). */
export function removeFromCache<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((entry) => entry.id !== id);
}

/**
 * Retira los reportes de una entidad borrada (T28).
 *
 * Espejo de la FK `ON DELETE CASCADE` de `entity_reports`: en Supabase los
 * reportes se van con su punto/necesidad solos; en la caché en memoria hay
 * que limpiarlos a mano para que la cola no muestre entidades fantasma.
 */
export function purgeReportsFromCache(entityType: ReportEntityType, entityId: string): void {
  memory.reports = memory.reports.filter(
    (report) => !(report.entityType === entityType && report.entityId === entityId),
  );
}
