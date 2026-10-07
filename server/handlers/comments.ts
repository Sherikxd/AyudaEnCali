import { randomUUID } from 'node:crypto';
import type { ApiHandler, ApiRequest, ApiResult, JsonResponder } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { getAuthenticatedUser, respondUnauthorized, resolveDisplayName } from '../auth.js';
import { readLimiter, writeLimiter } from '../limiters.js';
import { pageMeta, paginate, readPageParams, type PageParams } from '../pagination.js';
import { memory, pushInCache } from '../store.js';
import {
  getSupabaseClient,
  mapCommentRow,
  maybeVerifySchema,
  respondWriteFailure,
  toCommentRow,
  withSupabaseRetry,
} from '../supabase.js';
import type { PointCommentRow, SupabaseLikeError } from '../supabase.js';
import { sanitizeParam, validateComment } from '../validation.js';
import type { PointComment } from '../../src/types/index.js';

/**
 * `GET /api/comments` · `POST /api/comments`.
 *
 * Comentarios de un punto: lee de `point_comments` (persistente) y, si
 * Supabase no responde o la tabla aún no existe, cae a la caché en memoria.
 *
 * T1/FAL-03: la identidad **nunca** sale del cuerpo. `userId` es el `sub`
 * del JWT verificado, `userName` se resuelve en el servidor (claims →
 * perfil de Clerk → nombre genérico) y `userRole` es `ciudadano`: el rol
 * efectivo de la cuenta es un dato de cliente que llegará con T7.
 */

/** `true` si el error es la clave foránea `point_comments.point_id → help_points.id`. */
function isMissingPoint(error: SupabaseLikeError): boolean {
  return error.code === '23503' || /violates foreign key constraint/i.test(error.message ?? '');
}

async function listComments(input: ApiRequest, res: JsonResponder): Promise<ApiResult> {
  if (await readLimiter.enforce(input.clientIp, res)) return null;

  const params: PageParams | null = readPageParams(input.query);
  const rawPointId = input.query.pointId;
  const pointId = typeof rawPointId === 'string' ? sanitizeParam(rawPointId) : '';

  await maybeVerifySchema();
  const client = getSupabaseClient();

  if (client) {
    const { data, error, count } = await withSupabaseRetry<PointCommentRow[]>(
      'Supabase point_comments',
      () => {
        let query = client
          .from('point_comments')
          .select('*', params ? { count: 'exact' } : undefined)
          .order('created_at', { ascending: false });
        // El filtro baja a la BD: sin paginación se conserva el tope
        // histórico de 500, con paginación manda `range`.
        if (pointId) query = query.eq('point_id', pointId);
        query = params
          ? query.range(params.offset, params.offset + params.limit - 1)
          : query.limit(500);
        return query;
      },
    );

    // Una página o un punto concreto NO refrescan la caché completa: solo lo
    // hace una lectura sin filtros (comportamiento anterior).
    if (!error && Array.isArray(data) && (params || data.length > 0)) {
      const comments = data.map(mapCommentRow);
      if (!params && !pointId) memory.comments = comments;
      const body: Record<string, unknown> = { comments };
      if (params) {
        Object.assign(body, pageMeta(params, typeof count === 'number' ? count : data.length));
      }
      return { status: 200, body };
    }
  }

  const filtered = pointId
    ? memory.comments.filter((comment) => comment.pointId === pointId)
    : memory.comments;
  const comments = params ? paginate(filtered, params) : filtered;
  const body: Record<string, unknown> = { comments };
  if (params) Object.assign(body, pageMeta(params, filtered.length));
  return { status: 200, body };
}

export const commentsHandler: ApiHandler = async (input, res) => {
  const method = effectiveMethod(input.method);

  if (method === 'GET') return listComments(input, res);

  if (method === 'POST') {
    if (await writeLimiter.enforce(input.clientIp, res)) return null;

    // Escritura autenticada: sin sesión de Clerk no se comenta (T1).
    const user = await getAuthenticatedUser(input);
    if (!user) {
      respondUnauthorized(res, 'Debes iniciar sesión para comentar.');
      return null;
    }

    const parsed = validateComment(input.body);
    if (!parsed.ok) {
      return { status: 400, body: { error: 'Comentario inválido.', details: parsed.errors } };
    }

    await maybeVerifySchema();
    const client = getSupabaseClient();

    // Sin BD, la caché hace de FK: un punto inexistente no puede recibir
    // comentarios (mismo 400 que devuelve la restricción `23503`).
    if (!client && !memory.points.some((point) => point.id === parsed.value.pointId)) {
      return { status: 400, body: { error: 'El punto de ayuda indicado no existe.' } };
    }

    // El nombre se resuelve en el servidor (JWT → Clerk → genérico); el
    // barrio no se guarda: no hay fuente verificada para él.
    const userName = await resolveDisplayName(user);
    const comment: PointComment = {
      ...parsed.value,
      userId: user.userId,
      userName,
      userRole: 'ciudadano',
      id: `comm-${randomUUID()}`,
      createdAt: new Date().toISOString(),
    };

    if (client) {
      const { error } = await withSupabaseRetry('Supabase insert point_comments', () =>
        client.from('point_comments').insert([toCommentRow(comment)]),
      );
      if (error) {
        // Un `point_id` inexistente choca con la clave foránea (T1): 400
        // accionable en vez de un 503 genérico.
        if (isMissingPoint(error)) {
          return { status: 400, body: { error: 'El punto de ayuda indicado no existe.' } };
        }
        // Nunca un 201 con el insert fallido (T4): 409 colisión / 503 BD caída.
        respondWriteFailure(res, 'el comentario', error);
        return null;
      }
    }

    memory.comments = pushInCache(memory.comments, comment);
    return { status: 201, body: { comment } };
  }

  return notFoundResult(input);
};
