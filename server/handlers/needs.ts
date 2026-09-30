import { randomUUID } from 'node:crypto';
import type { ApiHandler } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { getAuthenticatedUser, respondUnauthorized } from '../auth.js';
import { writeLimiter } from '../limiters.js';
import { memory, pushInCache } from '../store.js';
import {
  getSupabaseClient,
  mapNeedRow,
  maybeVerifySchema,
  respondWriteFailure,
  toNeedRow,
  withSupabaseRetry,
} from '../supabase.js';
import type { HelpNeedRow } from '../supabase.js';
import { validateNeed } from '../validation.js';
import type { HelpNeed } from '../../src/types/index.js';

/**
 * `GET /api/needs` · `POST /api/needs`.
 *
 * Mismo patrón que los puntos: lectura con respaldo en memoria y escritura
 * autenticada.
 */
export const needsHandler: ApiHandler = async (input, res) => {
  const method = effectiveMethod(input.method);

  if (method === 'GET') {
    await maybeVerifySchema();
    const client = getSupabaseClient();

    if (client) {
      const { data, error } = await withSupabaseRetry<HelpNeedRow[]>('Supabase help_needs', () =>
        client.from('help_needs').select('*').order('created_at', { ascending: false }),
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        const needs = data.map(mapNeedRow);
        memory.needs = needs;
        return { status: 200, body: { needs, source: 'supabase' } };
      }
    }

    return { status: 200, body: { needs: memory.needs, source: 'memory_cache' } };
  }

  if (method === 'POST') {
    if (writeLimiter.enforce(input.clientIp, res)) return null;

    // Escritura autenticada: sin sesión de Clerk no se publica nada (T1).
    const user = await getAuthenticatedUser(input);
    if (!user) {
      respondUnauthorized(res, 'Debes iniciar sesión para publicar una necesidad.');
      return null;
    }

    const parsed = validateNeed(input.body);
    if (!parsed.ok) {
      return { status: 400, body: { error: 'Datos de necesidad inválidos.', details: parsed.errors } };
    }

    const need: HelpNeed = {
      ...parsed.value,
      // `randomUUID()` evita las colisiones de `Date.now()` y el prefijo
      // `cali-need-` mantiene la compatibilidad con los IDs semilla.
      id: parsed.value.id ?? `cali-need-${randomUUID()}`,
      status: 'activa',
      supportersCount: 1,
      createdAt: new Date().toISOString(),
    };

    await maybeVerifySchema();
    const client = getSupabaseClient();
    if (client) {
      const { error } = await withSupabaseRetry('Supabase insert help_needs', () =>
        client.from('help_needs').insert([toNeedRow(need)]),
      );
      if (error) {
        // Nunca un 201 con el insert fallido (T4): 409 colisión / 503 BD caída.
        respondWriteFailure(res, 'la necesidad', error);
        return null;
      }
    }

    memory.needs = pushInCache(memory.needs, need);
    return { status: 201, body: { need } };
  }

  return notFoundResult(input);
};
