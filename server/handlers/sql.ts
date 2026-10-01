import { createHash, timingSafeEqual } from 'node:crypto';
import type { ApiHandler, ApiRequest, JsonResponder } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { bearerToken, respondUnauthorized } from '../auth.js';
import { SUPABASE_SQL } from '../schema.js';

/**
 * `GET /api/supabase/sql`: el esquema completo para el SQL Editor.
 *
 * T3/FAL-05: el DDL ya no sale sin más. Exige
 * `Authorization: Bearer <SQL_ADMIN_TOKEN>` (variable de entorno del
 * servidor, jamás en el repo) y responde **401** si falta, no coincide o la
 * variable no está definida — nunca se revela cuál de los tres casos es.
 *
 * El orden de comprobaciones importa: primero método y ruta canónica (el
 * espejo filesystem `/api/sql` sigue respondiendo **404**, decisión
 * 2026-09-22) y solo después la autenticación.
 */

const TOKEN_ENV = 'SQL_ADMIN_TOKEN';

/** Comparación en tiempo constante sobre hashes: sin sondeo por longitud. */
function tokenMatches(provided: string, expected: string): boolean {
  const given = createHash('sha256').update(provided).digest();
  const wanted = createHash('sha256').update(expected).digest();
  return timingSafeEqual(given, wanted);
}

/** `true` si la cabecera trae el token esperado; si no, escribe el 401. */
function requireAdminToken(input: ApiRequest, res: JsonResponder): boolean {
  const expected = process.env[TOKEN_ENV]?.trim();
  const provided = bearerToken(input);
  if (expected && provided && tokenMatches(provided, expected)) return true;

  respondUnauthorized(res, `Se requiere Authorization: Bearer <${TOKEN_ENV}> para consultar el esquema.`);
  return false;
}

export const sqlHandler: ApiHandler = (input, res) => {
  if (effectiveMethod(input.method) !== 'GET') return notFoundResult(input);
  if (input.path !== '/supabase/sql') return notFoundResult(input);
  if (!requireAdminToken(input, res)) return null;
  return { status: 200, body: { sql: SUPABASE_SQL } };
};
