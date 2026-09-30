import type { ApiHandler } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { getAuthenticatedUser, respondUnauthorized } from '../auth.js';
import { allSupporters } from '../store.js';
import { getSupabaseClient, withSupabaseRetry } from '../supabase.js';
import type { MySupportsResponse } from '../../src/types/index.js';

/**
 * `GET /api/support/mine` — apoyos de la cuenta que hace la petición (el
 * "corazón relleno" del tablón).
 *
 * Exige sesión de Clerk verificada: responde 401 en caso contrario.
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
      for (const row of data) needIds.add(row.need_id);
    }
  }

  // Añade los apoyos que solo viven en memoria (sin BD o tabla sin crear).
  for (const [needId, supporters] of allSupporters()) {
    if (supporters.has(user.userId)) needIds.add(needId);
  }

  const payload: MySupportsResponse = { needIds: [...needIds] };
  return { status: 200, body: payload };
};
