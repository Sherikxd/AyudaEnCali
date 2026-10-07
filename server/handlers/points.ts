import { randomUUID } from 'node:crypto';
import type { ApiHandler, ApiRequest, ApiResult, JsonResponder } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import {
  MODERATION_FORBIDDEN,
  canModerate,
  getAuthenticatedUser,
  respondUnauthorized,
} from '../auth.js';
import { readLimiter, writeLimiter } from '../limiters.js';
import { pageMeta, paginate, readPageParams, type PageParams } from '../pagination.js';
import { resolveEntityId } from '../resourceId.js';
import { cacheGet, cacheSet, getOrSet, invalidate } from '../cache.js';
import { memory, purgeReportsFromCache, pushInCache, removeFromCache, replaceInCache } from '../store.js';
import {
  getSupabaseClient,
  mapPointRow,
  maybeVerifySchema,
  respondWriteFailure,
  toPointPatchRow,
  toPointRow,
  withSupabaseRetry,
} from '../supabase.js';
import type { HelpPointRow } from '../supabase.js';
import { validatePoint, validatePointUpdate, validateVerifiedUpdate } from '../validation.js';
import type { HelpPoint } from '../../src/types/index.js';

/**
 * `GET · POST /api/points` · `PUT · PATCH · DELETE /api/points/:id`.
 *
 * Lectura desde Supabase con respaldo en la caché en memoria; escritura
 * autenticada con el límite de tasa compartido. El ciclo de vida (T2) solo
 * lo usa **quien publicó el punto**: sesión obligatoria (401) y autoría
 * comprobada contra el JWT (403). `PATCH` es la acción de moderación (T28):
 * solo `coordinador` (o la lista blanca `MODERATOR_USER_IDS`) marca
 * `verified`. En Vercel las rutas con id llegan por los rewrites de
 * `vercel.json`.
 */

/** Vida de un listado en Redis: corta a propósito (el mapa se refresca). */
const LIST_TTL_S = 30;
/** Vida de un punto por id en Redis. */
const POINT_TTL_S = 60;

/**
 * Lee el punto: memoria local → Redis → base de datos.
 *
 * Redis solo guarda puntos que salieron de un `SELECT` y se invalida en cada
 * escritura (`invalidate('dir')`), de modo que la caché no puede mostrar un
 * punto editado ni borrado.
 */
async function loadPoint(id: string): Promise<HelpPoint | null> {
  const cached = memory.points.find((point) => point.id === id);
  if (cached) return cached;

  const cacheKey = `dir:pts:${encodeURIComponent(id)}`;
  const remote = await cacheGet<HelpPoint>(cacheKey);
  if (remote) return remote;

  await maybeVerifySchema();
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await withSupabaseRetry<HelpPointRow[]>('Supabase select help_points', () =>
      client.from('help_points').select('*').eq('id', id).limit(1),
    );
    if (!error && Array.isArray(data) && data[0]) {
      const point = mapPointRow(data[0]);
      memory.points = pushInCache(memory.points, point);
      await cacheSet(cacheKey, point, POINT_TTL_S);
      return point;
    }
  }
  return null;
}

/** `true` solo si `authorId` es el `sub` del JWT presente (T2: 403 si no). */
function isAuthor(authorId: string | undefined, userId: string): boolean {
  return typeof authorId === 'string' && authorId.length > 0 && authorId === userId;
}

/**
 * `PUT`/`DELETE /api/points/:id` (autoría) y `PATCH /api/points/:id`
 * (moderación, T28).
 *
 * Orden de comprobaciones:
 *
 *  - `PUT`/`DELETE`: límite de tasa → sesión (401) → existencia (404) →
 *    autoría (403) → validación (400) — el orden histórico de T2.
 *  - `PATCH`: límite de tasa → sesión (401) → **permiso de moderación
 *    (403)** → existencia (404) → validación (400): el permiso no depende
 *    del punto, así que se decide antes de mirar la BD (y un ciudadano no
 *    aprende qué ids existen ni cuáles no).
 *
 * El id se resuelve con la misma regla que los apoyos (`server/resourceId.ts`).
 */
async function lifecycle(
  input: ApiRequest,
  res: JsonResponder,
  method: string,
  id: string,
): Promise<ApiResult> {
  if (method !== 'PUT' && method !== 'DELETE' && method !== 'PATCH') return notFoundResult(input);
  if (await writeLimiter.enforce(input.clientIp, res)) return null;

  const user = await getAuthenticatedUser(input);
  if (!user) {
    respondUnauthorized(
      res,
      method === 'PATCH'
        ? 'Debes iniciar sesión para verificar un punto de ayuda.'
        : 'Debes iniciar sesión para editar un punto de ayuda.',
    );
    return null;
  }

  if (method === 'PATCH') {
    if (!canModerate(user)) return { status: 403, body: { error: MODERATION_FORBIDDEN } };

    const target = await loadPoint(id);
    if (!target) return { status: 404, body: { error: 'Punto de ayuda no encontrado.' } };

    const parsedVerified = validateVerifiedUpdate(input.body);
    if (!parsedVerified.ok) {
      return {
        status: 400,
        body: { error: 'Datos de moderación inválidos.', details: parsedVerified.errors },
      };
    }

    const now = new Date().toISOString();
    const moderated: HelpPoint = {
      ...target,
      verified: parsedVerified.value.verified,
      updatedAt: now,
    };

    await maybeVerifySchema();
    const client = getSupabaseClient();
    if (client) {
      const { error } = await withSupabaseRetry('Supabase moderate help_points', () =>
        client
          .from('help_points')
          .update({ verified: moderated.verified, updated_at: now })
          .eq('id', target.id),
      );
      if (error) {
        respondWriteFailure(res, 'el punto', error);
        return null;
      }
    }

    memory.points = replaceInCache(memory.points, moderated);
    await invalidate('dir');
    return { status: 200, body: { point: moderated } };
  }

  const point = await loadPoint(id);
  if (!point) return { status: 404, body: { error: 'Punto de ayuda no encontrado.' } };
  if (!isAuthor(point.authorId, user.userId)) {
    return { status: 403, body: { error: 'Solo quien publicó el punto puede modificarlo.' } };
  }

  const now = new Date().toISOString();

  if (method === 'DELETE') {
    await maybeVerifySchema();
    const client = getSupabaseClient();
    if (client) {
      const { error } = await withSupabaseRetry('Supabase delete help_points', () =>
        client.from('help_points').delete().eq('id', point.id),
      );
      if (error) {
        respondWriteFailure(res, 'el punto', error);
        return null;
      }
    }
    memory.points = removeFromCache(memory.points, point.id);
    // Los comentarios del punto se van con él (misma regla que la FK
    // `ON DELETE CASCADE` de `supabase/schema.sql`)… y también sus reportes.
    memory.comments = memory.comments.filter((comment) => comment.pointId !== point.id);
    purgeReportsFromCache('point', point.id);
    await invalidate('dir');
    return { status: 200, body: { success: true, id: point.id } };
  }

  const parsed = validatePointUpdate(input.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: 'Datos de punto inválidos.', details: parsed.errors } };
  }

  const patch = parsed.value;
  const updated: HelpPoint = {
    ...point,
    ...patch,
    // Una edición invalida la verificación: los datos relevantes para el
    // directorio y la proximidad deben volver a moderarse.
    id: point.id,
    authorId: point.authorId,
    verified: false,
    createdAt: point.createdAt,
    updatedAt: now,
  };

  await maybeVerifySchema();
  const client = getSupabaseClient();
  if (client) {
    const { error } = await withSupabaseRetry('Supabase update help_points', () =>
      client
        .from('help_points')
        .update({ ...toPointPatchRow(patch), verified: false, updated_at: now })
        .eq('id', point.id),
    );
    if (error) {
      respondWriteFailure(res, 'el punto', error);
      return null;
    }
  }

  memory.points = replaceInCache(memory.points, updated);
  await invalidate('dir');
  return { status: 200, body: { point: updated } };
}

/**
 * Listado público, con paginación `?page=&limit=` opcional (T3/FAL-05).
 *
 * El listado se cachea en Redis (`aec:dir:*`, TTL {@link LIST_TTL_S}) y se
 * invalida con cada escritura, así que una página cacheada es un snapshot
 * exacto de la BD en los últimos segundos. `X-Cache: HIT|MISS` permite
 * verlo en la respuesta sin tocar el cuerpo, que conserva `source`.
 */
async function listPoints(input: ApiRequest, res: JsonResponder): Promise<ApiResult> {
  if (await readLimiter.enforce(input.clientIp, res)) return null;

  const params: PageParams | null = readPageParams(input.query);
  const cacheKey = params ? `dir:pts:list:${params.offset}:${params.limit}` : 'dir:pts:list:all';

  const loaded = await getOrSet<Record<string, unknown>>(cacheKey, LIST_TTL_S, async () => {
    await maybeVerifySchema();
    const client = getSupabaseClient();
    if (!client) return null;

    const { data, error, count } = await withSupabaseRetry<HelpPointRow[]>('Supabase help_points', () => {
      let query = client
        .from('help_points')
        .select('*', params ? { count: 'exact' } : undefined)
        .order('created_at', { ascending: false });
      if (params) query = query.range(params.offset, params.offset + params.limit - 1);
      return query;
    });

    // Con paginación se respeta lo que devuelva la BD (una página vacía es
    // una página vacía); sin ella se conserva el comportamiento anterior:
    // si la tabla está vacía, la caché de respaldo sigue pintando datos.
    if (error || !Array.isArray(data) || (!params && data.length === 0)) return null;

    const points = data.map(mapPointRow);
    // Solo una lectura completa refresca la caché: una página no lo es.
    if (!params) memory.points = points;
    return params
      ? { points, source: 'supabase', ...pageMeta(params, typeof count === 'number' ? count : data.length) }
      : { points, source: 'supabase' };
  });

  res.setHeader('X-Cache', loaded.hit ? 'HIT' : 'MISS');
  if (loaded.value) return { status: 200, body: loaded.value };

  const points = params ? paginate(memory.points, params) : memory.points;
  const body: Record<string, unknown> = params
    ? { points, source: 'memory_cache', ...pageMeta(params, memory.points.length) }
    : { points, source: 'memory_cache' };
  return { status: 200, body };
}

export const pointsHandler: ApiHandler = async (input, res) => {
  const method = effectiveMethod(input.method);
  const id = resolveEntityId(input, 'points');

  // Ruta con id (`/points/XYZ`): solo PUT/PATCH/DELETE; el resto → 404.
  if (id) return lifecycle(input, res, method, id);

  if (method === 'GET') return listPoints(input, res);

  if (method === 'POST') {
    if (await writeLimiter.enforce(input.clientIp, res)) return null;

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
    await invalidate('dir');
    return { status: 201, body: { point } };
  }

  return notFoundResult(input);
};
