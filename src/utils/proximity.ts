/**
 * Proximidad en el cliente (MEJ-02 · MEJ-03).
 *
 * - **Sin dependencias nuevas** y sin importar nada de `server/geo.ts`: el
 *   haversine propio ya vivía en `src/data/caliLocations.ts`
 *   (`calculateDistanceKm`), que es el que se reutiliza aquí.
 * - Las necesidades del tablón **no llevan coordenadas**: su distancia se
 *   mide hasta el **centroide** del barrio (`CALI_BARRIOS_DATA`), así que
 *   siempre debe etiquetarse como aproximada.
 * - Nada de esto sale del navegador: son cálulos locales sobre la ubicación
 *   que ya está en `localStorage`.
 */
import { CALI_BARRIOS_DATA, calculateDistanceKm, type CaliBarrioInfo } from '../data/caliLocations';
import type { HelpNeed, UserCoordinates } from '../types';

/**
 * ¿La referencia de quien mide es un centroide (barrio, perfil o
 * predeterminada)? Solo el GPS y el pin fijado en el mapa cuentan como
 * «exactos»: el resto son aproximados y así se etiqueta la distancia.
 */
export function isApproximateOrigin(coords: UserCoordinates | null | undefined): boolean {
  if (!coords) return true;
  return coords.source !== 'gps' && coords.source !== 'map_pin';
}

/**
 * Nombre de barrio apto para mostrar: retira el sufijo «(Predeterminado)»
 * que arrastra la ubicación por defecto («San Antonio (Predeterminado)»).
 */
export function barrioLabel(name?: string | null): string {
  return (name ?? '').replace(/\s*\(predeterminado\)\s*$/i, '').trim();
}

/**
 * Nombre de barrio normalizado para comparar: sin tildes, en minúsculas y
 * sin el sufijo «(Predeterminado)» que arrastra la ubicación por defecto.
 */
export function normalizeBarrio(name?: string | null): string {
  return barrioLabel(name)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** ¿Los dos nombres de barrio son el mismo (con tildes o mayúsculas distintas)? */
export function sameBarrio(a?: string | null, b?: string | null): boolean {
  const normalized = normalizeBarrio(a);
  return normalized !== '' && normalized === normalizeBarrio(b);
}

/** Centroide del barrio donde se reportó la necesidad (o `null` si no está en Cali). */
export function needBarrioCentroid(need: HelpNeed): CaliBarrioInfo | null {
  const direct = CALI_BARRIOS_DATA[need.barrio];
  if (direct) return direct;
  const wanted = normalizeBarrio(need.barrio);
  if (wanted === '') return null;
  return Object.values(CALI_BARRIOS_DATA).find((barrio) => normalizeBarrio(barrio.name) === wanted) ?? null;
}

/**
 * Distancia (km) desde `from` hasta el centroide del barrio de la necesidad.
 * `null` cuando no hay ubicación o el barrio es desconocido: en ese caso la
 * necesidad se queda al final, en su orden original.
 */
export function needDistanceKm(
  from: UserCoordinates | null | undefined,
  need: HelpNeed,
): number | null {
  if (!from) return null;
  const centroid = needBarrioCentroid(need);
  if (!centroid) return null;
  return calculateDistanceKm(from.lat, from.lng, centroid.lat, centroid.lng);
}

/** Distancia corta para la UI en es-CO: `1,2 km`. */
export function formatKm(km: number): string {
  return `${km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km`;
}
