import type { ApiHandler, ApiRequest } from '../http';
import { effectiveMethod, notFoundResult } from '../http';
import { getAuthenticatedUser, respondUnauthorized } from '../auth';
import { writeLimiter } from '../limiters';
import { getSupporterSet, memory, pushInCache } from '../store';
import {
  classifySupabaseError,
  getSupabaseClient,
  mapNeedRow,
  respondWriteFailure,
  withSupabaseRetry,
} from '../supabase';
import type { HelpNeedRow } from '../supabase';
import { sanitizeParam } from '../validation';
import type { HelpNeed, SupportAction, SupportResponse } from '../../src/types';

/** Acciones aceptadas por `POST /api/needs/:id/support`. */
const SUPPORT_ACTIONS: ReadonlySet<string> = new Set<string>(['add', 'remove']);

/**
 * Identificador de la necesidad.
 *
 * - Express (y la función de Vercel cuando ve la URL original): en la ruta
 *   canónica `/needs/<id>/support`.
 * - Rewrite de Vercel (`/api/needs/:id/support → /api/needs-support`): el id
 *   llega también en el query `?id=…` que añade el rewrite; se usa como
 *   respaldo cuando la función ve la URL de destino y `_orig` no llega
 *   expandido.
 * - Espejo filesystem `/api/needs-support?id=…` (sin rewrite, 404 en
 *   Express): **no** cuenta el query → responde 404 como Express.
 */
function resolveNeedId(input: ApiRequest): string {
  const match = /^\/needs\/([^/]+)\/support\/?$/.exec(input.path);
  if (match) return sanitizeParam(match[1]);
  if (!input.rewritten) return '';
  const fromQuery = input.query.id;
  return typeof fromQuery === 'string' && fromQuery ? sanitizeParam(fromQuery) : '';
}

/**
 * `POST /api/needs/:id/support` — apoyar (like) o retirar el apoyo.
 *
 * Reglas de la dinámica:
 *  - Solo quien tiene **cuenta** puede apoyar (token de Clerk verificado
 *    criptográficamente en el servidor: `401` sin sesión).
 *  - Un usuario = un apoyo por necesidad: repetir `add` es idempotente y
 *    `remove` retira el apoyo sin dejar el contador en negativo.
 *  - La fuente de verdad es `need_supporters` (PK compuesta `need_id,user_id`)
 *    y el recuento lo escribe la BD en la misma transacción que modifica la
 *    tabla (RPC `toggle_need_support`). La caché **nunca** escribe
 *    `supporters_count`: era una escritura absoluta que perdía apoyos.
 */
export const needsSupportHandler: ApiHandler = async (input, res) => {
  if (effectiveMethod(input.method) !== 'POST') return notFoundResult(input);

  const id = resolveNeedId(input);
  // Sin id no hay ruta (equivale al 404 de Express para `/api/needs-support`).
  if (!id) return notFoundResult(input);

  if (writeLimiter.enforce(input.clientIp, res)) return null;

  const user = await getAuthenticatedUser(input);
  if (!user) {
    respondUnauthorized(res, 'Debes iniciar sesión para apoyar una necesidad.');
    return null;
  }

  const body = (input.body ?? {}) as { action?: unknown };
  const action = typeof body.action === 'string' && SUPPORT_ACTIONS.has(body.action)
    ? (body.action as SupportAction)
    : null;
  if (!action) {
    return { status: 400, body: { error: 'Acción no válida: usa "add" o "remove".', details: ['action'] } };
  }
  const wantAdd = action === 'add';

  let need = memory.needs.find((item) => item.id === id);

  // La caché local puede estar desactualizada: preguntamos a la base.
  if (!need) {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await withSupabaseRetry<HelpNeedRow[]>('Supabase select help_needs', () =>
        client.from('help_needs').select('*').eq('id', id).limit(1),
      );
      if (!error && Array.isArray(data) && data[0]) {
        need = mapNeedRow(data[0]);
        memory.needs = pushInCache(memory.needs, need);
      }
    }
  }

  if (!need) {
    return { status: 404, body: { error: 'Necesidad no encontrada.' } };
  }

  const target: HelpNeed = need;
  const supporters = getSupporterSet(target.id);
  const client = getSupabaseClient();

  let handledInDb = false;

  if (client) {
    // 1) Camino normal: la RPC hace el INSERT/DELETE en `need_supporters`
    //    y recalcula `supporters_count` con `count(*)` en la misma
    //    transacción, bloqueando la fila de la necesidad para que dos
    //    apoyos simultáneos no se pisen. Devuelve el recuento real.
    const { data: realCount, error: rpcError } = await withSupabaseRetry<number | null>(
      'Supabase rpc toggle_need_support',
      () =>
        client.rpc('toggle_need_support', {
          p_need_id: target.id,
          p_user_id: user.userId,
          p_action: wantAdd ? 'add' : 'remove',
        }),
    );

    if (!rpcError && typeof realCount === 'number') {
      handledInDb = true;
      target.supportersCount = realCount;
      if (wantAdd) supporters.add(user.userId);
      else supporters.delete(user.userId);
    } else if (rpcError && classifySupabaseError(rpcError) !== 'transient') {
      // 2) Respaldo: la BD responde pero aún no tiene la función (esquema
      //    anterior a `npm run db:setup`). Se escribe directo y el
      //    contador se recalcula con el recuento real de la tabla, nunca
      //    con el valor que traía la caché.
      const write = await (wantAdd
        ? withSupabaseRetry<{ need_id: string }[]>('Supabase insert need_supporters', () =>
            client
              .from('need_supporters')
              .upsert(
                { need_id: target.id, user_id: user.userId },
                { onConflict: 'need_id,user_id', ignoreDuplicates: true },
              )
              .select('need_id'),
          )
        : withSupabaseRetry<{ need_id: string }[]>('Supabase delete need_supporters', () =>
            client
              .from('need_supporters')
              .delete()
              .eq('need_id', target.id)
              .eq('user_id', user.userId)
              .select('need_id'),
          ));

      if (!write.error) {
        const { data: rows, error: countError } = await withSupabaseRetry<{ need_id: string }[]>(
          'Supabase recount need_supporters',
          () =>
            client.from('need_supporters').select('need_id').eq('need_id', target.id).limit(10_000),
        );

        if (countError || !Array.isArray(rows)) {
          // El apoyo ya está escrito pero no podemos confirmar el
          // recuento: se responde error en lugar de un éxito inventado.
          respondWriteFailure(
            res,
            'el apoyo',
            countError ?? { message: 'El recuento de apoyos no está disponible.' },
          );
          return null;
        }

        const recount = rows.length;
        const { error: updateError } = await withSupabaseRetry('Supabase update supporters_count', () =>
          client.from('help_needs').update({ supporters_count: recount }).eq('id', target.id),
        );
        if (updateError) {
          respondWriteFailure(res, 'el contador de apoyos', updateError);
          return null;
        }

        handledInDb = true;
        target.supportersCount = recount;
        if (wantAdd) supporters.add(user.userId);
        else supporters.delete(user.userId);
      }
    }
  }

  if (!handledInDb) {
    // Sin base de datos (o red caída): toggle local idempotente, el mismo
    // comportamiento que con la tabla disponible. Último recurso: aquí el
    // contador es el de la caché porque no existe otra fuente.
    if (wantAdd && !supporters.has(user.userId)) {
      supporters.add(user.userId);
      target.supportersCount += 1;
    } else if (!wantAdd && supporters.has(user.userId)) {
      supporters.delete(user.userId);
      target.supportersCount = Math.max(0, target.supportersCount - 1);
    }
  }

  const payload: SupportResponse = {
    success: true,
    count: target.supportersCount,
    supported: supporters.has(user.userId),
  };
  return { status: 200, body: payload };
};
