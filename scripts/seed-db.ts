/**
 * Siembra la base con el dataset inicial de la app (32 puntos y 6
 * necesidades de Cali, tomados de `server/seedData.ts`, que es copia
 * verbatim de `src/data/initialData.ts` — T29 semilla única). Además
 * respalda cada `supporters_count` con filas reales en `need_supporters`
 * para que ningún contador del tablón sea imposible.
 *
 * Idempotente: usa `ON CONFLICT … DO NOTHING` en las tres tablas y el
 * recuento de apoyos es determinista, así que nunca pisa lo que ya exista
 * en la base.
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
import { supporterRowsToSeed } from '../server/seedSupporters';
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

/** Aborta con el mismo formato de error que `seed` (incluida la pista de RLS). */
function fail(label: string, message: string): never {
  const rls = /row-level security/i.test(message)
    ? ' → El RLS bloqueó la escritura: usa SUPABASE_SERVICE_ROLE_KEY.'
    : '';
  console.error(`[ERROR] ${label}: ${message}${rls}`);
  process.exit(1);
}

async function seed(table: 'help_points' | 'help_needs', rows: object[], label: string) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) fail(label, error.message);
  console.log(`[OK] ${rows.length} ${label} (las filas ya existentes se conservaron)`);
}

/**
 * Apoyos semilla (T29 · FAL-08): `help_needs.supporters_count` es un
 * contador *materializado* (la RPC `toggle_need_support` lo recalcula con
 * `count(*)`), así que si la semilla no siembra filas en `need_supporters`
 * el tablón miente (18 apoyos y 0 filas).
 *
 * Las reglas (sembrar solo si la tabla está vacía; nunca inflar una base
 * con actividad; recuento final siempre) viven puras en
 * `server/seedSupporters.ts`, que `npm run test:server` verifica sin BD.
 * Aquí solo se aplica el plan y se escribe el contador resultante.
 */
async function seedSupporters(): Promise<void> {
  for (const need of INITIAL_HELP_NEEDS) {
    const target = need.supportersCount;

    const { count: existing, error: readError } = await supabase
      .from('need_supporters')
      .select('need_id', { count: 'exact', head: true })
      .eq('need_id', need.id);
    if (readError) fail(`recuento de apoyos de ${need.id}`, readError.message);

    const rows = supporterRowsToSeed(need.id, target, existing ?? 0);
    if (rows.length > 0) {
      const { error } = await supabase
        .from('need_supporters')
        .upsert(rows, { onConflict: 'need_id,user_id', ignoreDuplicates: true });
      if (error) fail(`apoyos semilla de ${need.id}`, error.message);
    }

    const { count: real, error: recountError } = await supabase
      .from('need_supporters')
      .select('need_id', { count: 'exact', head: true })
      .eq('need_id', need.id);
    if (recountError || real === null) {
      fail(`recuento final de ${need.id}`, recountError?.message ?? 'sin recuento');
    }

    const { error: updateError } = await supabase
      .from('help_needs')
      .update({ supporters_count: real })
      .eq('id', need.id);
    if (updateError) fail(`contador de ${need.id}`, updateError.message);

    console.log(`[OK] ${need.id}: supporters_count = ${real} (filas reales en need_supporters)`);
  }
}

await seed('help_points', INITIAL_HELP_POINTS.map(toPointRow), 'puntos sembrados');
await seed('help_needs', INITIAL_HELP_NEEDS.map(toNeedRow), 'necesidades sembradas');
await seedSupporters();
console.log('Listo: GET /api/points y GET /api/needs responderán con "source": "supabase".');
