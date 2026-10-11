/**
 * Distancias en línea recta sobre la esfera terrestre (haversine).
 *
 * Un único sitio para el radio de la Tierra y el cálculo: antes el mismo
 * haversine con `const R = 6371` estaba duplicado en `AppContext` (distancia
 * del usuario) y en `src/data/caliLocations.ts` (barrio más cercano).
 * `server/geo.ts` es el equivalente del backend y no se toca aquí.
 */

/** Radio medio de la Tierra en kilómetros (WGS-84 aproximado). */
export const EARTH_RADIUS_KM = 6371;

/**
 * Distancia en kilómetros entre dos coordenadas. El resultado sale sin
 * redondear: quien lo use decide los decimales (`toFixed`).
 *
 * @param lat1 latitud del punto A (grados)
 * @param lng1 longitud del punto A (grados)
 * @param lat2 latitud del punto B (grados)
 * @param lng2 longitud del punto B (grados)
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}
