import type { ApiHandler } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { getAuthenticatedUser, respondUnauthorized } from '../auth.js';
import { cacheGet, cacheSet } from '../cache.js';
import { allSupporters } from '../store.js';
import { getSupabaseClient, withSupabaseRetry } from '../supabase.js';
import type { MySupportsResponse } from '../../src/types/index.js';

/** Vida de los apoyos de una cuenta en Redis (se invalidan al apoyar). */
const MY_SUPPORTS_TTL_S = 60;

/**
 * `GET /api/support/mine` — apoyos de la cuenta que hace la petición (el
 * "corazón relleno" del tablón).
 *
 * Exige sesión de Clerk verificada: responde 401 en caso contrario.
 *
 * La lista se cachea en Redis por cuenta (`aec:sup:<uid>:mine`, 60 s) para
 * que abrir el tablón no cueste un `SELECT` a `need_supporters` cada vez; se
 * borra en el mismo request en que la cuenta apoya o retira un apoyo
 * (`server/handlers/needsSupport.ts`). Solo se guarda lo que devolvió la BD:
 * los apoyos locales del respaldo (sin BD) se fusionan en cada lectura.
 *
 * Solo responde en la ruta canónica (mismo criterio que `sqlHandler`): en
 * Vercel el fichero es accesible directamente como `/api/support-mine`
 * (precedencia del filesystem) y ese espejo debe responder 404 como Express.
 */
export const supportMineHandler: ApiHandler = async (input, res) => {
  if (effectiveMethod(input.method) !== 'GET') return notFoundResult(input);
  if (!/^\/support\/mine\/?$/.test(input.path)) return notFoundResult(input);

  const user = await getAuthenticatedUser(input);
  if (!user) {
    respondUnauthorized(res, 'Debes iniciar sesión para ver tus apoyos.');
    return null;
  }

  const needIds = new Set<string>();
  const cacheKey = `sup:${user.userId}:mine`;
  const cached = await cacheGet<string[]>(cacheKey);
  res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');

  if (cached) {
    for (const needId of cached) needIds.add(needId);
  } else {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await withSupabaseRetry<{ need_id: string }[]>(
        'Supabase select need_supporters',
        () =>
          client
            .from('need_supporters')
            .select('need_id')
            .eq('user_id', user.userId)
            .limit(500),
      );
      if (!error && Array.isArray(data)) {
        const fromDb = data.map((row) => row.need_id);
        for (const needId of fromDb) needIds.add(needId);
        // Snapshot de lo que devolvió la BD, sin mezclar el respaldo local:
        // éste se fusiona en cada lectura y no debe quedarse 60 s en Redis.
        await cacheSet(cacheKey, fromDb, MY_SUPPORTS_TTL_S);
      }
    }
  }

  // Añade los apoyos que solo viven en memoria (sin BD o tabla sin crear).
  for (const [needId, supporters] of allSupporters()) {
    if (supporters.has(user.userId)) needIds.add(needId);
  }

  const payload: MySupportsResponse = { needIds: [...needIds] };
  return { status: 200, body: payload };
};
