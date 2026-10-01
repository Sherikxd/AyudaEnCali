import type { ApiRequest } from './http.js';
import { sanitizeParam } from './validation.js';

/** Recursos con ciclo de vida por id (`PATCH/PUT/DELETE /<recurso>/:id`). */
export type EntityResource = 'needs' | 'points';

/**
 * Identificador de la entidad que toca la petición (T2).
 *
 * Cadena de decisión, idéntica a `resolveNeedId` de
 * `server/handlers/needsSupport.ts`:
 *
 *  - **Ruta canónica** (`/needs/XYZ` en Express, o `_orig=needs/XYZ` en la
 *    función de Vercel): el id sale de ahí.
 *  - **Solo query `?id=`** cuando la petición llegó **reescrita**
 *    (`input.rewritten`, es decir con `_orig`): es el mismo id que añade el
 *    rewrite de `vercel.json`.
 *  - **Espejo filesystem** (`/api/needs/XYZ` sin rewrite): no se lee el
 *    query → `''`, para responder 404 como hace Express.
 *  - **Colección** (`/needs`, `/points`): `''`.
 */
export function resolveEntityId(input: ApiRequest, resource: EntityResource): string {
  const match = new RegExp(`^/${resource}/([^/]+)/?$`).exec(input.path);
  if (match) return sanitizeParam(match[1]);
  if (!input.rewritten) return '';
  const fromQuery = input.query.id;
  return typeof fromQuery === 'string' && fromQuery ? sanitizeParam(fromQuery) : '';
}
