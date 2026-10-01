/**
 * Paginación de los listados públicos (T3 · FAL-05).
 *
 * Contrato:
 *
 *  - **Sin `page` ni `limit` la respuesta es exactamente la de siempre**
 *    (dataset completo, sin metadatos): así `src/services/api.ts` y
 *    `AppContext` siguen funcionando sin tocar el cliente.
 *  - Con `page` y/o `limit` la respuesta añade `page`, `limit`, `total` y
 *    `totalPages` **sin quitar** el array (`PointsResponse`, `NeedsResponse`
 *    y `CommentsResponse` de `src/types/index.ts` siguen cumpliéndose).
 *  - `limit` máximo 100 (por defecto 20) y `page` ≥ 1: `?page=999` devuelve
 *    un array vacío con el `total` real, nunca el dataset entero.
 *
 * Los valores no numéricos o fuera de rango se **corrigen** en vez de
 * rechazar: una consulta malformada no debe tumbar el listado del mapa.
 */

/** Tope de elementos por página. */
export const MAX_PAGE_SIZE = 100;

/** Tamaño por defecto cuando se pagina sin indicar `limit`. */
export const DEFAULT_PAGE_SIZE = 20;

export interface PageParams {
  /** Página solicitada (≥ 1). */
  page: number;
  /** Elementos por página (1..MAX_PAGE_SIZE). */
  limit: number;
  /** Desplazamiento equivalente: `(page - 1) * limit`. */
  offset: number;
}

/** Metadatos que se añaden a la respuesta cuando hay paginación. */
export interface PageMeta {
  page: number;
  limit: number;
  /** Total de elementos que cumplen el filtro (todas las páginas). */
  total: number;
  totalPages: number;
}

function readInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^[0-9]{1,7}$/.test(value.trim())) return Number(value.trim());
  return null;
}

/**
 * Lee `?page=&limit=` de la query. Devuelve `null` si la petición no pide
 * paginación (compatibilidad con el contrato actual de la API).
 */
export function readPageParams(query: Record<string, unknown>): PageParams | null {
  const wantsPagination = 'page' in query || 'limit' in query;
  if (!wantsPagination) return null;

  const rawPage = readInt(query.page);
  const page = rawPage !== null && rawPage >= 1 ? Math.min(rawPage, 1_000_000) : 1;

  const rawLimit = readInt(query.limit);
  const limit =
    rawLimit !== null && rawLimit >= 1 ? Math.min(rawLimit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  return { page, limit, offset: (page - 1) * limit };
}

/** Metadatos de la respuesta paginada. */
export function pageMeta(params: PageParams, total: number): PageMeta {
  return {
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.ceil(total / params.limit),
  };
}

/** Aplica la paginación a una lista ya cargada (respaldo en memoria). */
export function paginate<T>(items: T[], params: PageParams): T[] {
  return items.slice(params.offset, params.offset + params.limit);
}
