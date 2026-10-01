/**
 * Aplica `supabase/schema.sql` al proyecto configurado en `.env` usando la
 * Supabase Management API. Equivalente manual del auto-aplicado del servidor.
 *
 * Crea (con `CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION`, todo
 * idempotente) las tablas `help_points`, `help_needs`, `need_supporters` y
 * `point_comments`, sus índices, las políticas RLS, la autoría
 * (`help_needs.author_id` + índice) y la clave foránea
 * `point_comments.point_id → help_points.id ON DELETE CASCADE`, además de la
 * función `toggle_need_support` del recuento de apoyos. No borra tablas ni
 * datos (la única limpieza es la de comentarios huérfanos que documenta el
 * propio `schema.sql`, y solo la primera vez que se añade la restricción).
 *
 * Uso:
 *   npm run db:setup
 *
 * Requiere `SUPABASE_URL` y `SUPABASE_ACCESS_TOKEN`. El script es seguro de
 * re-ejecutar: el esquema es idempotente (no borra datos).
 */
import dotenv from 'dotenv';
import { applySupabaseSchema, projectRefFromHost } from '../server/schemaAdmin';

dotenv.config();

function hostFromEnv(): string | null {
  try {
    return new URL(process.env.SUPABASE_URL ?? '').host || null;
  } catch {
    return null;
  }
}

const result = await applySupabaseSchema(projectRefFromHost(hostFromEnv()), process.env.SUPABASE_ACCESS_TOKEN);

if (!result) {
  console.error('Faltan SUPABASE_URL o SUPABASE_ACCESS_TOKEN en .env (ver .env.example).');
  process.exit(1);
}

if (result.ok) {
  console.log(`[OK] ${result.message}`);
  process.exit(0);
}

console.error(`[ERROR] ${result.message}`);
process.exit(1);
