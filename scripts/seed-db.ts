/**
 * Siembra la base con los datos iniciales de la app (5 puntos y 3 necesidades
 * de Cali). Idempotente: usa `ON CONFLICT (id) DO NOTHING`, así que nunca
 * pisa lo que ya exista en la base.
 *
 * Uso:
 *   npm run db:seed
 *
 * Requiere `SUPABASE_URL` y preferiblemente `SUPABASE_SERVICE_ROLE_KEY`
 * (la escritura con solo la ANON KEY queda bloqueada por las políticas RLS).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { INITIAL_HELP_NEEDS, INITIAL_HELP_POINTS } from '../server/seedData';
import { toNeedRow, toPointRow } from '../server/supabase';

dotenv.config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = serviceKey ?? process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env (ver .env.example).');
  process.exit(1);
}
if (!serviceKey) {
  console.warn('[AVISO] Sin SUPABASE_SERVICE_ROLE_KEY: el RLS bloqueará los INSERT.');
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function seed(table: 'help_points' | 'help_needs', rows: object[], label: string) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) {
    const rls = /row-level security/i.test(error.message)
      ? ' → El RLS bloqueó la escritura: usa SUPABASE_SERVICE_ROLE_KEY.'
      : '';
    console.error(`[ERROR] ${label}: ${error.message}${rls}`);
    process.exit(1);
  }
  console.log(`[OK] ${rows.length} ${label} (las filas ya existentes se conservaron)`);
}

await seed('help_points', INITIAL_HELP_POINTS.map(toPointRow), 'puntos sembrados');
await seed('help_needs', INITIAL_HELP_NEEDS.map(toNeedRow), 'necesidades sembradas');
console.log('Listo: GET /api/points y GET /api/needs responderán con "source": "supabase".');
