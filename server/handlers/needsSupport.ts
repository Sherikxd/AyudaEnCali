import type { ApiHandler, ApiRequest } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { getAuthenticatedUser, respondUnauthorized } from '../auth.js';
import { writeLimiter } from '../limiters.js';
import { invalidate } from '../cache.js';
import { getSupporterSet, memory, pushInCache } from '../store.js';
import {
  classifySupabaseError,
  getSupabaseClient,
  mapNeedRow,
  respondWriteFailure,
  withSupabaseRetry,
} from '../supabase.js';
import type { HelpNeedRow } from '../supabase.js';
import { sanitizeParam } from '../validation.js';
import type { HelpNeed, SupportAction, SupportResponse } from '../../src/types/index.js';

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
 *  - **Con BD configurada, o se confirma la escritura o responde error**
 *    (503 reintentable): nunca un `success: true` alimentado solo de la
 *    caché, que en Vercel se pierde en el siguiente cold start (BUG-01).
 *    El toggle en caché existe únicamente **sin cliente Supabase**
 *    (modo sin BD, comportamiento documentado) y sigue siendo idempotente.
 */
export const needsSupportHandler: ApiHandler = async (input, res) => {
  if (effectiveMethod(input.method) !== 'POST') return notFoundResult(input);

  const id = resolveNeedId(input);
  // Sin id no hay ruta (equivale al 404 de Express para `/api/needs-support`).
  if (!id) return notFoundResult(input);

  if (await writeLimiter.enforce(input.clientIp, res)) return null;

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

      if (write.error) {
        // La BD está configurada y la escritura no se confirmó: error
        // explícito (BUG-01), nunca un 200 con la caché.
        respondWriteFailure(res, 'el apoyo', write.error);
        return null;
      }

      // Recuento EXACTO vía PostgREST (`head` + `count=exact`): sin tope
      // de filas, así el total no se trunca aunque `need_supporters`
      // tenga más de 10 000 apoyos (BUG-03). Devuelve solo la cabecera
      // `content-range`, no las filas.
      const { error: countError, count } = await withSupabaseRetry<{ need_id: string }[]>(
        'Supabase recount need_supporters',
        () =>
          client
            .from('need_supporters')
            .select('need_id', { count: 'exact', head: true })
            .eq('need_id', target.id),
      );

      if (countError || typeof count !== 'number') {
        // El apoyo ya está escrito pero no podemos confirmar el
        // recuento: se responde error en lugar de un éxito inventado.
        respondWriteFailure(
          res,
          'el apoyo',
          countError ?? { message: 'El recuento de apoyos no está disponible.' },
        );
        return null;
      }

      const { error: updateError } = await withSupabaseRetry('Supabase update supporters_count', () =>
        client.from('help_needs').update({ supporters_count: count }).eq('id', target.id),
      );
      if (updateError) {
        respondWriteFailure(res, 'el contador de apoyos', updateError);
        return null;
      }

      target.supportersCount = count;
      if (wantAdd) supporters.add(user.userId);
      else supporters.delete(user.userId);
    } else {
      // 3) BUG-01: la BD está configurada pero NADA se confirmó (RPC
      //    transitoria agotada, o respuesta sin recuento numérico). En
      //    Vercel la caché no es persistencia: responder `success: true`
      //    aquí daría un apoyo por bueno que un cold start borra. Se
      //    responde 503 explícito SIN tocar la caché ni el set de
      //    supporters: el cliente ya revierte su actualización
      //    optimista al recibir error (`AppContext.supportNeed`).
      respondWriteFailure(
        res,
        'el apoyo',
        rpcError ?? { message: 'La función toggle_need_support no devolvió un recuento válido.' },
      );
      return null;
    }
  } else {
    // Sin cliente Supabase (modo sin BD): toggle local idempotente, el
    // mismo comportamiento que con la tabla disponible. Último recurso:
    // aquí el contador es el de la caché porque no existe otra fuente.
    if (wantAdd && !supporters.has(user.userId)) {
      supporters.add(user.userId);
      target.supportersCount += 1;
    } else if (!wantAdd && supporters.has(user.userId)) {
      supporters.delete(user.userId);
      target.supportersCount = Math.max(0, target.supportersCount - 1);
    }
  }

  // El recuento acaba de cambiar en la BD (o en el respaldo local): todo lo
  // que hubiera cacheado el espacio `dir` queda obsoleto. Se borra ANTES de
  // responder para que ninguna lectura posterior sirva un contador anterior
  // al que se acaba de confirmar — así la decisión 2026-09-28 (el recuento
  // lo escribe la BD y la caché nunca lo infiere) sobrevive a la caché de
  // Redis: ésta solo refleja y se retira en el mismo request.
  await invalidate('dir');

  const payload: SupportResponse = {
    success: true,
    count: target.supportersCount,
    supported: supporters.has(user.userId),
  };
  return { status: 200, body: payload };
};
