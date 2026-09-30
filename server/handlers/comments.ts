import { randomUUID } from 'node:crypto';
import type { ApiHandler } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { getAuthenticatedUser, respondUnauthorized } from '../auth.js';
import { writeLimiter } from '../limiters.js';
import { memory, pushInCache } from '../store.js';
import {
  getSupabaseClient,
  mapCommentRow,
  maybeVerifySchema,
  respondWriteFailure,
  toCommentRow,
  withSupabaseRetry,
} from '../supabase.js';
import type { PointCommentRow } from '../supabase.js';
import { sanitizeParam, validateComment } from '../validation.js';
import type { PointComment } from '../../src/types/index.js';

/**
 * `GET /api/comments` · `POST /api/comments`.
 *
 * Comentarios de un punto: lee de `point_comments` (persistente) y, si
 * Supabase no responde o la tabla aún no existe, cae a la caché en memoria:
 * mismo patrón que los puntos.
 */
export const commentsHandler: ApiHandler = async (input, res) => {
  const method = effectiveMethod(input.method);

  if (method === 'GET') {
    const rawPointId = input.query.pointId;
    const pointId = typeof rawPointId === 'string' ? sanitizeParam(rawPointId) : '';

    await maybeVerifySchema();
    const client = getSupabaseClient();

    if (client) {
      const { data, error } = await withSupabaseRetry<PointCommentRow[]>('Supabase point_comments', () =>
        client
          .from('point_comments')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500),
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        const comments = data.map(mapCommentRow);
        memory.comments = comments;
        return {
          status: 200,
          body: { comments: pointId ? comments.filter((c) => c.pointId === pointId) : comments },
        };
      }
    }

    return {
      status: 200,
      body: {
        comments: pointId ? memory.comments.filter((c) => c.pointId === pointId) : memory.comments,
      },
    };
  }

  if (method === 'POST') {
    if (writeLimiter.enforce(input.clientIp, res)) return null;

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

    const comment: PointComment = {
      ...parsed.value,
      // El autor es SOLO el JWT: el `userId` del cuerpo se ignora. El nombre
      // y el barrio son datos de vitrina (ya saneados), no de identidad.
      userId: user.userId,
      id: `comm-${randomUUID()}`,
      createdAt: new Date().toISOString(),
    };

    await maybeVerifySchema();
    const client = getSupabaseClient();
    if (client) {
      const { error } = await withSupabaseRetry('Supabase insert point_comments', () =>
        client.from('point_comments').insert([toCommentRow(comment)]),
      );
      if (error) {
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
