import { randomUUID } from 'node:crypto';
import type { ApiHandler } from '../http';
import { effectiveMethod, notFoundResult } from '../http';
import { getAuthenticatedUser, respondUnauthorized } from '../auth';
import { writeLimiter } from '../limiters';
import { memory, pushInCache } from '../store';
import {
  getSupabaseClient,
  mapPointRow,
  maybeVerifySchema,
  respondWriteFailure,
  toPointRow,
  withSupabaseRetry,
} from '../supabase';
import type { HelpPointRow } from '../supabase';
import { validatePoint } from '../validation';
import type { HelpPoint } from '../../src/types';

/**
 * `GET /api/points` · `POST /api/points`.
 *
 * Lectura desde Supabase con respaldo en la caché en memoria; escritura
 * autenticada con el límite de tasa compartido.
 */
export const pointsHandler: ApiHandler = async (input, res) => {
  const method = effectiveMethod(input.method);

  if (method === 'GET') {
    await maybeVerifySchema();
    const client = getSupabaseClient();

    if (client) {
      const { data, error } = await withSupabaseRetry<HelpPointRow[]>('Supabase help_points', () =>
        client.from('help_points').select('*').order('created_at', { ascending: false }),
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        const points = data.map(mapPointRow);
        memory.points = points;
        return { status: 200, body: { points, source: 'supabase' } };
      }
    }

    return { status: 200, body: { points: memory.points, source: 'memory_cache' } };
  }

  if (method === 'POST') {
    if (writeLimiter.enforce(input.clientIp, res)) return null;

    // Escritura autenticada: sin sesión de Clerk no se publica nada (T1).
    const user = await getAuthenticatedUser(input);
    if (!user) {
      respondUnauthorized(res, 'Debes iniciar sesión para reportar un punto de ayuda.');
      return null;
    }

    const parsed = validatePoint(input.body);
    if (!parsed.ok) {
      return { status: 400, body: { error: 'Datos de punto inválidos.', details: parsed.errors } };
    }

    const now = new Date().toISOString();
    const point: HelpPoint = {
      ...parsed.value,
      // Identificador propio del servidor: `randomUUID()` no colisiona como
      // `Date.now()`; el prefijo `cali-point-` sigue siendo compatible con
      // los IDs semilla y con los que genera el cliente.
      id: parsed.value.id ?? `cali-point-${randomUUID()}`,
      // La identidad sale SOLO del JWT: el `authorId` del cuerpo se ignora.
      authorId: user.userId,
      // Un reporte nuevo nace sin verificar: verificar es un paso aparte.
      verified: false,
      createdAt: now,
      updatedAt: now,
    };

    await maybeVerifySchema();
    const client = getSupabaseClient();
    if (client) {
      const { error } = await withSupabaseRetry('Supabase insert help_points', () =>
        client.from('help_points').insert([toPointRow(point)]),
      );
      if (error) {
        // Nunca un 201 con el insert fallido (T4): 409 colisión / 503 BD caída.
        respondWriteFailure(res, 'el punto', error);
        return null;
      }
    }

    memory.points = pushInCache(memory.points, point);
    return { status: 201, body: { point } };
  }

  return notFoundResult(input);
};
