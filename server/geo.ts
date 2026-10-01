/**
 * Distancias sobre la esfera terrestre (FEAT-07 / FEAT-08).
 *
 * Helper puro y sin estado para que el asistente pueda ordenar puntos y
 * necesidades por proximidad y para que, más adelante, el tablón «cerca de
 * mí» reutilice el mismo cálculo en vez de copiarlo.
 */

/** Coordenadas geográficas en grados decimales. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Radio medio de la Tierra en kilómetros. */
const EARTH_RADIUS_KM = 6371;

/**
 * Distancia en línea recta (haversine) entre dos puntos, en kilómetros.
 * Devuelve `NaN` si alguna coordenada no es un número válido.
 */
export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng)) return Number.NaN;
  if (!Number.isFinite(to.lat) || !Number.isFinite(to.lng)) return Number.NaN;

  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Etiqueta corta para el prompt: `1.2 km` (o los metros si está muy cerca).
 * Fuera de rango (coordenada inválida) → cadena vacía.
 */
export function distanceLabel(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
