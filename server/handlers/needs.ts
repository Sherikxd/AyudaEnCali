import { randomUUID } from 'node:crypto';
import type { ApiHandler, ApiRequest, ApiResult, JsonResponder } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { getAuthenticatedUser, respondUnauthorized } from '../auth.js';
import { readLimiter, writeLimiter } from '../limiters.js';
import { pageMeta, paginate, readPageParams, type PageParams } from '../pagination.js';
import { resolveEntityId } from '../resourceId.js';
import { memory, purgeReportsFromCache, pushInCache, removeFromCache, replaceInCache } from '../store.js';
import {
  getSupabaseClient,
  mapNeedRow,
  maybeVerifySchema,
  respondWriteFailure,
  toNeedPatchRow,
  toNeedRow,
  withSupabaseRetry,
} from '../supabase.js';
import type { HelpNeedRow } from '../supabase.js';
import type { HelpNeedWithAuthor } from '../entities.js';
import { validateNeed, validateNeedUpdate } from '../validation.js';

/**
 * `GET · POST /api/needs` · `PATCH · DELETE /api/needs/:id`.
 *
 * Lectura con respaldo en memoria y paginación opcional (T3); escritura y
 * ciclo de vida autenticados (T1/T2): la autoría sale del JWT y solo el
 * autor puede editar o borrar su necesidad (403 para el resto; el rol
 * moderador llegará en T7).
 */

/** Lee la necesidad de la caché o, si no está, de la base de datos. */
async function loadNeed(id: string): Promise<HelpNeedWithAuthor | null> {
  const cached = memory.needs.find((need) => need.id === id);
  if (cached) return cached;

  await maybeVerifySchema();
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await withSupabaseRetry<HelpNeedRow[]>('Supabase select help_needs', () =>
      client.from('help_needs').select('*').eq('id', id).limit(1),
    );
    if (!error && Array.isArray(data) && data[0]) {
      const need = mapNeedRow(data[0]);
      memory.needs = pushInCache(memory.needs, need);
      return need;
    }
  }
  return null;
}

/** `true` solo si `authorId` es el `sub` del JWT presente (T2: 403 si no). */
function isAuthor(authorId: string | undefined, userId: string): boolean {
  return typeof authorId === 'string' && authorId.length > 0 && authorId === userId;
}

/**
 * `PATCH /api/needs/:id` y `DELETE /api/needs/:id`.
 *
 * Orden: límite de tasa → sesión (401) → existencia (404) → autoría (403)
 * → validación estricta del parche (400). Un `status` fuera de
 * `activa|en_proceso|resuelta|archivada` se rechaza, no se corrige en silencio.
 * Al crear, el estado siempre nace `activa`.
 */
async function lifecycle(
  input: ApiRequest,
  res: JsonResponder,
  method: string,
  id: string,
): Promise<ApiResult> {
  if (method !== 'PATCH' && method !== 'DELETE') return notFoundResult(input);
  if (writeLimiter.enforce(input.clientIp, res)) return null;

  const user = await getAuthenticatedUser(input);
  if (!user) {
    respondUnauthorized(res, 'Debes iniciar sesión para editar una necesidad.');
    return null;
  }

  const need = await loadNeed(id);
  if (!need) return { status: 404, body: { error: 'Necesidad no encontrada.' } };
  if (!isAuthor(need.authorId, user.userId)) {
    return { status: 403, body: { error: 'Solo quien publicó la necesidad puede modificarla.' } };
  }

  if (method === 'DELETE') {
    await maybeVerifySchema();
    const client = getSupabaseClient();
    if (client) {
      // Los apoyos se van con ella (FK `ON DELETE CASCADE` del esquema).
      const { error } = await withSupabaseRetry('Supabase delete help_needs', () =>
        client.from('help_needs').delete().eq('id', need.id),
      );
      if (error) {
        respondWriteFailure(res, 'la necesidad', error);
        return null;
      }
    }
    memory.needs = removeFromCache(memory.needs, need.id);
    // Sus reportes se van con ella (misma regla que la FK `ON DELETE
    // CASCADE` de `entity_reports`, T28).
    purgeReportsFromCache('need', need.id);
    return { status: 200, body: { success: true, id: need.id } };
  }

  const parsed = validateNeedUpdate(input.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: 'Datos de necesidad inválidos.', details: parsed.errors } };
  }

  const patch = parsed.value;
  const updated: HelpNeedWithAuthor = {
    ...need,
    ...patch,
    // Ni el id, ni la autoría, ni el recuento de apoyos cambian al editar:
    // `supporters_count` lo escribe la BD en su transacción de apoyos.
    id: need.id,
    authorId: need.authorId,
    supportersCount: need.supportersCount,
    createdAt: need.createdAt,
  };

  await maybeVerifySchema();
  const client = getSupabaseClient();
  if (client) {
    const { error } = await withSupabaseRetry('Supabase update help_needs', () =>
      client.from('help_needs').update(toNeedPatchRow(patch)).eq('id', need.id),
    );
    if (error) {
      respondWriteFailure(res, 'la necesidad', error);
      return null;
    }
  }

  memory.needs = replaceInCache(memory.needs, updated);
  return { status: 200, body: { need: updated } };
}

/** Listado público, con paginación `?page=&limit=` opcional (T3/FAL-05). */
async function listNeeds(input: ApiRequest, res: JsonResponder): Promise<ApiResult> {
  if (readLimiter.enforce(input.clientIp, res)) return null;

  const params: PageParams | null = readPageParams(input.query);
  await maybeVerifySchema();
  const client = getSupabaseClient();

  if (client) {
    const { data, error, count } = await withSupabaseRetry<HelpNeedRow[]>('Supabase help_needs', () => {
      let query = client
        .from('help_needs')
        .select('*', params ? { count: 'exact' } : undefined)
        .order('created_at', { ascending: false });
      if (params) query = query.range(params.offset, params.offset + params.limit - 1);
      return query;
    });

    if (!error && Array.isArray(data) && (params || data.length > 0)) {
      const needs = data.map(mapNeedRow);
      // Solo una lectura completa refresca la caché: una página no lo es.
      if (!params) memory.needs = needs;
      const body: Record<string, unknown> = params
        ? { needs, source: 'supabase', ...pageMeta(params, typeof count === 'number' ? count : data.length) }
        : { needs, source: 'supabase' };
      return { status: 200, body };
    }
  }

  const needs = params ? paginate(memory.needs, params) : memory.needs;
  const body: Record<string, unknown> = params
    ? { needs, source: 'memory_cache', ...pageMeta(params, memory.needs.length) }
    : { needs, source: 'memory_cache' };
  return { status: 200, body };
}

export const needsHandler: ApiHandler = async (input, res) => {
  const method = effectiveMethod(input.method);
  const id = resolveEntityId(input, 'needs');

  // Ruta con id (`/needs/XYZ`): solo PATCH/DELETE; el resto → 404.
  if (id) return lifecycle(input, res, method, id);

  if (method === 'GET') return listNeeds(input, res);

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

    const need: HelpNeedWithAuthor = {
      ...parsed.value,
      // `randomUUID()` evita las colisiones de `Date.now()` y el prefijo
      // `cali-need-` mantiene la compatibilidad con los IDs semilla.
      id: parsed.value.id ?? `cali-need-${randomUUID()}`,
      // El ciclo comienza activa; cambiarlo después exige autoría.
      status: 'activa',
      // El primer apoyo real lo da la BD (T2).
      supportersCount: 0,
      // La identidad sale SOLO del JWT: cualquier `authorId` del cuerpo se
      // ignora (decisión 2026-09-28).
      authorId: user.userId,
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
