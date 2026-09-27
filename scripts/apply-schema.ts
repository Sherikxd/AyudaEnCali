/**
 * Aplica `supabase/schema.sql` al proyecto configurado en `.env` usando la
 * Supabase Management API. Equivalente manual del auto-aplicado del servidor.
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
