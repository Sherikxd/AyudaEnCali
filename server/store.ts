/**
 * Caché en memoria compartida por los núcleos de ruta (respaldo si Supabase
 * no responde).
 *
 * Vive una sola vez por proceso: en local/Docker/Cloud Run es un único
 * contenedor y en Vercel cada función tiene su propio aislamiento (una
 * instancia por módulo), igual que cualquier otro estado en memoria.
 */
import { INITIAL_COMMENTS, INITIAL_HELP_NEEDS, INITIAL_HELP_POINTS } from './seedData';
import type { HelpNeed, HelpPoint, PointComment } from '../src/types';

/** Tope de elementos que se mantienen en memoria como caché de respaldo. */
const MAX_CACHED_ITEMS = 500;

export const memory: {
  points: HelpPoint[];
  needs: HelpNeed[];
  comments: PointComment[];
} = {
  points: [...INITIAL_HELP_POINTS],
  needs: [...INITIAL_HELP_NEEDS],
  comments: [...INITIAL_COMMENTS],
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
