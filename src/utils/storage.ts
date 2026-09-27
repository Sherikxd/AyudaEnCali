import { logger } from './logger';

/**
 * Acceso centralizado y a prueba de errores a `localStorage`.
 *
 * El almacenamiento local puede fallar por cuota llena, modo privado o
 * políticas del navegador: aquí nunca lanzamos excepciones al llamador.
 */

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.warn(`No se pudo leer "${key}" de localStorage:`, error);
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    logger.warn(`No se pudo guardar "${key}" en localStorage:`, error);
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    logger.warn(`No se pudo eliminar "${key}" de localStorage:`, error);
  }
}
