import type { ApiHandler } from '../http';
import { effectiveMethod, notFoundResult } from '../http';
import { SUPABASE_SQL } from '../schema';

/**
 * `GET /api/supabase/sql`: el esquema completo para el SQL Editor.
 *
 * Solo responde en la ruta canónica: en Vercel el fichero es accesible
 * directamente como `/api/sql` (precedencia del filesystem), y ese espejo
 * debe responder igual que Express (`404 GET /sql`), no exponer el SQL.
 */
export const sqlHandler: ApiHandler = (input) => {
  if (effectiveMethod(input.method) !== 'GET') return notFoundResult(input);
  if (input.path !== '/supabase/sql') return notFoundResult(input);
  return { status: 200, body: { sql: SUPABASE_SQL } };
};
