import { randomUUID } from 'node:crypto';
import type { ApiHandler, ApiRequest, ApiResult, JsonResponder } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { logger } from '../logger.js';
import {
  MODERATION_FORBIDDEN,
  canModerate,
  getAuthenticatedUser,
  respondUnauthorized,
} from '../auth.js';
import { readLimiter, writeLimiter } from '../limiters.js';
import {
  DEFAULT_PAGE_SIZE,
  pageMeta,
  paginate,
  readPageParams,
  type PageParams,
} from '../pagination.js';
import { memory, pushInCache } from '../store.js';
import {
  getSupabaseClient,
  mapReportRow,
  maybeVerifySchema,
  respondWriteFailure,
  toReportRow,
  withSupabaseRetry,
} from '../supabase.js';
import type { EntityReportRow, SupabaseLikeError } from '../supabase.js';
import { validateReport } from '../validation.js';
import type { EntityReport, ReportEntityType } from '../entities.js';

/**
 * `GET · POST /api/reports` — cola de moderación (T28 · FEAT-02).
 *
 *  - `POST`: cualquier cuenta con sesión deja un reporte sobre un punto o
 *    una necesidad. La identidad **nunca** sale del cuerpo: `reporterId` es
 *    el `sub` del JWT verificado. Un mismo ciudadano no acumula el mismo
 *    reporte dos veces (dedup: la repetición responde `200` con
 *    `duplicate: true`, así la cola offline del cliente es idempotente).
 *  - `GET`: solo moderación (`canModerate`), siempre paginada: es una vista
 *    de trabajo, no un listado público con contrato que preservar.
 *
 * En Vercel la ruta llega por el rewrite `/api/reports` de `vercel.json`
 * hacia la función de comentarios (`api/comments.ts` la despacha aquí):
 * una ruta nueva sin función nueva (límite de 12 del plan Hobby).
 */

/** `true` si el error es la clave foránea a `help_points`/`help_needs`. */
function isMissingEntity(error: SupabaseLikeError): boolean {
  return error.code === '23503' || /violates foreign key constraint/i.test(error.message ?? '');
}

/** `true` si es la clave única `(reporter_id, entity_type, entity_id)`. */
function isDuplicateReport(error: SupabaseLikeError): boolean {
  return error.code === '23505' || /duplicate key/i.test(error.message ?? '');
}

/** ¿Existe la entidad en la caché? (sin BD es donde la caché hace de FK). */
function entityExists(entityType: ReportEntityType, entityId: string): boolean {
  return entityType === 'point'
    ? memory.points.some((point) => point.id === entityId)
    : memory.needs.some((need) => need.id === entityId);
}

async function createReport(input: ApiRequest, res: JsonResponder): Promise<ApiResult> {
  if (writeLimiter.enforce(input.clientIp, res)) return null;

  // Escritura autenticada: sin sesión de Clerk no se reporta nada (T1).
  const user = await getAuthenticatedUser(input);
  if (!user) {
    respondUnauthorized(res, 'Debes iniciar sesión para reportar contenido.');
    return null;
  }

  const parsed = validateReport(input.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: 'Reporte inválido.', details: parsed.errors } };
  }
  const { entityType, entityId, reason } = parsed.value;

  await maybeVerifySchema();
  const client = getSupabaseClient();

  if (!client) {
    // Sin BD la caché hace de FK: no se puede reportar algo que no existe
    // (con BD la misma regla la impone la clave foránea → `23503` → 400).
    if (!entityExists(entityType, entityId)) {
      return { status: 400, body: { error: 'La entidad indicada no existe.' } };
    }
    const repeated = memory.reports.find(
      (report) =>
        report.reporterId === user.userId &&
        report.entityType === entityType &&
        report.entityId === entityId,
    );
    if (repeated) return { status: 200, body: { report: repeated, duplicate: true } };
  }

  const report: EntityReport = {
    // Identificador propio del servidor (prefijo para distinguirlos en logs).
    id: `rep-${randomUUID()}`,
    entityType,
    entityId,
    // La identidad sale SOLO del JWT: el `reporterId` del cuerpo se ignora.
    reporterId: user.userId,
    reason,
    createdAt: new Date().toISOString(),
  };

  if (client) {
    const { error } = await withSupabaseRetry('Supabase insert entity_reports', () =>
      client.from('entity_reports').insert([toReportRow(report)]),
    );
    if (error) {
      if (isMissingEntity(error)) {
        return { status: 400, body: { error: 'La entidad indicada no existe.' } };
      }
      if (isDuplicateReport(error)) {
        // Otra petición ganó la carrera: se devuelve el reporte ya guardado
        // (idempotente, mismo contrato que el dedup en memoria).
        const { data, error: selectError } = await withSupabaseRetry<EntityReportRow[]>(
          'Supabase select entity_reports',
          () =>
            client
              .from('entity_reports')
              .select('*')
              .eq('reporter_id', user.userId)
              .eq('entity_type', entityType)
              .eq('entity_id', entityId)
              .limit(1),
        );
        if (!selectError && Array.isArray(data) && data[0]) {
          return { status: 200, body: { report: mapReportRow(data[0]), duplicate: true } };
        }
      }
      // Nunca un 201 con el insert fallido (T4): 409 colisión / 503 BD caída.
      respondWriteFailure(res, 'el reporte', error);
      return null;
    }
  }

  memory.reports = pushInCache(memory.reports, report);
  return { status: 201, body: { report } };
}

/** Cola completa, paginada siempre (`?page=&limit=`, T3). */
async function listReports(input: ApiRequest, res: JsonResponder): Promise<ApiResult> {
  if (readLimiter.enforce(input.clientIp, res)) return null;

  const user = await getAuthenticatedUser(input);
  if (!user) {
    respondUnauthorized(res, 'Debes iniciar sesión para ver la cola de reportes.');
    return null;
  }
  if (!canModerate(user)) return { status: 403, body: { error: MODERATION_FORBIDDEN } };

  // La cola SIEMPRE viene paginada: sin `?page=` mandan los mismos
  // defaults que el resto de la API (página 1, 20 por página).
  const params: PageParams = readPageParams(input.query) ?? {
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    offset: 0,
  };

  await maybeVerifySchema();
  const client = getSupabaseClient();

  if (client) {
    const { data, error, count } = await withSupabaseRetry<EntityReportRow[]>(
      'Supabase entity_reports',
      () =>
        client
          .from('entity_reports')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(params.offset, params.offset + params.limit - 1),
    );
    if (!error && Array.isArray(data)) {
      const reports = data.map(mapReportRow);
      return {
        status: 200,
        body: {
          reports,
          source: 'supabase',
          ...pageMeta(params, typeof count === 'number' ? count : data.length),
        },
      };
    }

    // Con una BD configurada, una cola parcial en memoria ocultaría reportes
    // persistidos en otras instancias (especialmente en funciones serverless).
    // No convertir un fallo de lectura en una cola vacía con apariencia de éxito.
    if (!error) logger.error('Supabase no devolvió una cola válida de entity_reports.');
    return {
      status: 503,
      body: { error: 'No se pudo cargar la cola de reportes. Inténtalo de nuevo en unos segundos.' },
    };
  }

  const reports = paginate(memory.reports, params);
  return {
    status: 200,
    body: {
      reports,
      source: 'memory_cache',
      ...pageMeta(params, memory.reports.length),
    },
  };
}

export const reportsHandler: ApiHandler = async (input, res) => {
  const method = effectiveMethod(input.method);

  if (method === 'GET') return listReports(input, res);
  if (method === 'POST') return createReport(input, res);

  return notFoundResult(input);
};
