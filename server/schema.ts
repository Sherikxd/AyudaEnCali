/**
 * Esquema SQL de Supabase servido por `GET /api/supabase/sql`.
 *
 * La fuente única de verdad es `supabase/schema.sql` (compatible con la CLI
 * de Supabase: `supabase db push`). Aquí solo lo leemos en memoria.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorMessage, logger } from './logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '..', 'supabase', 'schema.sql');

const FALLBACK_SQL = `-- No se pudo leer supabase/schema.sql desde el servidor.
-- Copia ese archivo y pégalo en el SQL Editor de Supabase.`;

function loadSchema(): string {
  try {
    return fs.readFileSync(SCHEMA_PATH, 'utf8');
  } catch (error) {
    logger.warn(`No se encontró supabase/schema.sql: ${errorMessage(error)}`);
    return FALLBACK_SQL;
  }
}

export const SUPABASE_SQL = loadSchema();
