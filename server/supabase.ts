/**
 * Adaptador de Supabase: conexión, verificación del esquema, reintentos y
 * mapeo fila (snake_case) <-> entidad (camelCase).
 *
 * Diseño:
 *  - Nunca lanza: si Supabase falla, el llamador usa la caché en memoria.
 *  - Clasifica cada error (`missing` / `auth` / `transient` / `other`) para
 *    ofrecer una pista accionable en `GET /api/config` y en los logs.
 *  - Si la SERVICE ROLE KEY no sirve, degrada a la ANON KEY automáticamente.
 *  - Todas las peticiones llevan timeout para no dejar colgado el proceso.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { errorMessage, logger } from './logger';
import type { JsonResponder } from './http';
import { applySupabaseSchema, projectRefFromHost, type ApplyResult } from './schemaAdmin';
import {
  normalizeCategory,
  normalizeNeedStatus,
  normalizePointStatus,
  normalizeRole,
  normalizeUrgency,
} from './validation';
import type { HelpNeed, HelpPoint, PointComment } from '../src/types';

/* -------------------------------------------------------------------------- */
/* Estado compartido (lo lee GET /api/config)                                  */
/* -------------------------------------------------------------------------- */

export type SupabaseKeyType = 'service_role' | 'anon';

export interface SupabaseStatus {
  configured: boolean;
  host: string | null;
  keyType: SupabaseKeyType | null;
  /** `true` = tablas accesibles, `false` = faltan tablas, `null` = sin verificar. */
  tablesReady: boolean | null;
  /** Mensaje accionable para quien administra el proyecto. */
  hint: string | null;
}

const status: SupabaseStatus = {
  configured: false,
  host: null,
  keyType: null,
  tablesReady: null,
  hint: null,
};

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  return client;
}

export function getSupabaseStatus(): SupabaseStatus {
  return { ...status };
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

/** Solo el host de una URL: jamás credenciales. */
function safeHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).host;
  } catch {
    return null;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetch con tope de duración: evita que una consulta colgada frene la API. */
const FETCH_TIMEOUT_MS = 8_000;
const timedFetch: typeof fetch = (input, init = {}) => {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};

function buildClient(url: string, key: string): SupabaseClient | null {
  try {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: timedFetch },
    });
  } catch (error) {
    logger.error('No se pudo inicializar el cliente Supabase:', errorMessage(error));
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Clasificación de errores                                                     */
/* -------------------------------------------------------------------------- */

export type SupabaseErrorKind = 'missing' | 'auth' | 'transient' | 'other';

export interface SupabaseLikeError {
  code?: string;
  message: string;
}

/**
 * Traduce un error de PostgREST / red a una categoría usable.
 * - `missing`: no existen las tablas del esquema (PGRST205).
 * - `auth`: clave inválida o permisos insuficientes.
 * - `transient`: red, timeout o sobrecarga puntual (reintentable).
 */
export function classifySupabaseError(error: SupabaseLikeError): SupabaseErrorKind {
  const code = error.code ?? '';
  const message = error.message ?? '';

  if (code === 'PGRST205' || /could not find the (table|function)/i.test(message)) return 'missing';
  if (
    code === 'PGRST301' ||
    /invalid api key|api key not found|jwt (is )?(invalid|expired)|not authorized|permission denied|401 unauthorized|403/i.test(
      message,
    )
  ) {
    return 'auth';
  }
  if (
    /fetch failed|network|econnreset|econnrefused|etimedout|eai_again|enotfound|socket hang up|aborted|timeout|429|50[234]|overloaded|temporarily unavailable/i.test(
      message,
    )
  ) {
    return 'transient';
  }
  return 'other';
}

/* -------------------------------------------------------------------------- */
/* Pistas accionables                                                           */
/* -------------------------------------------------------------------------- */

function sqlEditorUrl(host: string | null): string {
  return host ? `https://${host}/project/_/sql` : 'el SQL Editor de Supabase';
}

function missingTablesHint(host: string | null): string {
  const where = sqlEditorUrl(host);
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return `Faltan tablas del esquema (help_points, help_needs, need_supporters o point_comments). El servidor intentará crearlas solo; si no puede, pega supabase/schema.sql en ${where}.`;
  }
  return `Faltan tablas del esquema (help_points, help_needs, need_supporters o point_comments). Ejecuta el esquema en ${where} (o descárgalo con GET /api/supabase/sql).`;
}

const AUTH_HINT = 'Claves de Supabase rechazadas: revisa SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY en .env.';
const DOWN_HINT = 'Supabase no responde: se usa la caché en memoria hasta que vuelva.';

/**
 * Registra un error de Supabase actualizando el estado visible.
 * Solo escribe en log cuando cambia la categoría, para no saturar la consola.
 */
let lastLoggedKind: SupabaseErrorKind | 'ok' | null = null;

/** Escribe en el log solo cuando cambia la categoría, para no saturarlo. */
function logOnce(kind: SupabaseErrorKind | 'ok', message: string): void {
  if (lastLoggedKind === kind) return;
  lastLoggedKind = kind;
  logger.warn(message);
}

export function noteSupabaseError(label: string, error: SupabaseLikeError): void {
  const kind = classifySupabaseError(error);

  if (kind === 'missing') {
    status.tablesReady = false;
    status.hint = missingTablesHint(status.host);
  } else if (kind === 'auth') {
    status.hint = AUTH_HINT;
  } else if (kind === 'transient' && status.tablesReady !== false) {
    status.hint = DOWN_HINT;
  }

  const detail = `${error.code ? `${error.code}: ` : ''}${error.message}`;
  if (kind === 'missing') logOnce(kind, `${label}: ${detail}. ${status.hint ?? ''}`);
  else if (kind === 'auth') logOnce(kind, `${label}: ${detail}. ${AUTH_HINT}`);
  else if (kind === 'transient') logOnce(kind, `${label}: ${detail}. ${DOWN_HINT}`);
  else logOnce(kind, `${label}: ${detail}. Se usa la caché en memoria.`);
}

/** Marca la conexión como sana (llamar cuando una consulta termina bien). */
function noteSupabaseOk(): void {
  if (status.tablesReady === true && status.hint === null) return;
  status.tablesReady = true;
  status.hint = null;
  lastLoggedKind = null;
  logger.info('Supabase: esquema verificado (help_points, help_needs, need_supporters y point_comments accesibles).');
}

/* -------------------------------------------------------------------------- */
/* Reintentos                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_ATTEMPTS = 2;

/** Forma mínima que comparten las respuestas de PostgREST. */
export interface SupabaseResult<T> {
  data: T | null;
  error: SupabaseLikeError | null;
}

/**
 * Ejecuta una operación de Supabase reintentando solo los fallos transitorios.
 * El error final (si lo hay) NO se lanza: se clasifica y se devuelve tal cual,
 * para que el llamador caiga a la caché en memoria sin romper la respuesta.
 */
export async function withSupabaseRetry<T>(
  label: string,
  operation: () => PromiseLike<SupabaseResult<T>>,
): Promise<SupabaseResult<T>> {
  let result = await operation();

  for (let attempt = 1; attempt < MAX_ATTEMPTS && result.error; attempt++) {
    if (classifySupabaseError(result.error) !== 'transient') break;
    await sleep(300 * attempt);
    result = await operation();
  }

  if (result.error) noteSupabaseError(label, result.error);
  else noteSupabaseOk();

  return result;
}

/* -------------------------------------------------------------------------- */
/* Verificación del esquema al arrancar (y de forma perezosa)                   */
/* -------------------------------------------------------------------------- */

const VERIFY_THROTTLE_MS = 30_000;
let lastVerifyAt = 0;
let inflight: Promise<void> | null = null;

/** Columna existente de cada tabla del esquema (para sondearla sin error de columna). */
const SCHEMA_PROBES: ReadonlyArray<readonly [table: string, column: string]> = [
  ['help_points', 'id'],
  ['help_needs', 'id'],
  ['need_supporters', 'need_id'],
  ['point_comments', 'id'],
];

async function probe(target: SupabaseClient): Promise<SupabaseErrorKind | 'ok'> {
  // Ojo: no usar `head: true` aquí. Con peticiones HEAD PostgREST no devuelve
  // cuerpo de error, así que una tabla inexistente parecería una consulta OK.
  // Se comprueba **toda** la tabla del esquema: si aparece una nueva (p. ej.
  // point_comments) el sondeo la detecta y se aplica/actualiza el DDL solo.
  for (const [table, column] of SCHEMA_PROBES) {
    const { error } = await target.from(table).select(column).limit(1);
    if (error) return classifySupabaseError(error);
  }
  return 'ok';
}

/** Espera entre intentos de creación automática del esquema. */
const APPLY_MIN_INTERVAL_MS = 10 * 60_000;
/** Corto circuito: como mucho 3 intentos por proceso. */
const MAX_APPLY_ATTEMPTS = 3;
let applyAttempts = 0;
let lastApplyAt = 0;

/**
 * Crea el esquema con la Management API cuando hay token configurado.
 * Devuelve `null` si no corresponde intentar (sin token/proyecto, límite de
 * intentos agotado o aún no ha pasado el intervalo mínimo).
 */
async function autoApplySchema(): Promise<ApplyResult | null> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRefFromHost(status.host);
  if (!token || !ref) return null;
  if (applyAttempts >= MAX_APPLY_ATTEMPTS) return null;
  if (applyAttempts > 0 && Date.now() - lastApplyAt < APPLY_MIN_INTERVAL_MS) return null;

  applyAttempts += 1;
  lastApplyAt = Date.now();
  return applySupabaseSchema(ref, token);
}

async function verify(): Promise<void> {
  if (!client) return;

  let result = await probe(client);
  if (result === 'transient') {
    await sleep(400);
    result = await probe(client);
  }

  // La SERVICE ROLE KEY no sirve: probamos con la ANON KEY antes de rendirnos.
  if (result === 'auth' && status.keyType === 'service_role') {
    const anon = process.env.SUPABASE_ANON_KEY;
    const fallback = anon ? buildClient(process.env.SUPABASE_URL ?? '', anon) : null;
    if (fallback) {
      const fallbackResult = await probe(fallback);
      if (fallbackResult === 'ok' || fallbackResult === 'missing') {
        client = fallback;
        status.keyType = 'anon';
        logger.warn('La SERVICE ROLE KEY no fue aceptada: se usa la ANON KEY (escrituras requerirán RLS).');
        result = fallbackResult;
      }
    }
  }

  if (result === 'ok') {
    noteSupabaseOk();
    return;
  }
  if (result === 'missing') {
    // Con SUPABASE_ACCESS_TOKEN configurado, el servidor se crea las tablas.
    const applied = await autoApplySchema();
    if (applied?.ok) {
      logger.info(`Supabase: ${applied.message}; se vuelve a verificar el esquema.`);
      result = await probe(client);
      // PostgREST recarga su caché de esquema con retardo tras el DDL:
      // esperamos y reintentamos antes de concluir que siguen faltando.
      for (let attempt = 0; attempt < 3 && result !== 'ok'; attempt++) {
        await sleep(1_500);
        result = await probe(client);
      }
      if (result === 'ok') {
        noteSupabaseOk();
        return;
      }
    }

    status.tablesReady = false;
    status.hint =
      applied && !applied.ok
        ? `Faltan tablas del esquema (help_points, help_needs, need_supporters o point_comments) y no se pudieron crear (${applied.message}). Pega supabase/schema.sql en ${sqlEditorUrl(status.host)}.`
        : missingTablesHint(status.host);
    logOnce('missing', `Supabase: ${status.hint}`);
    return;
  }
  if (result === 'auth') {
    status.hint = AUTH_HINT;
    logOnce('auth', `Supabase: ${AUTH_HINT}`);
    return;
  }
  status.hint = DOWN_HINT;
  logOnce('transient', `Supabase: no se pudo verificar el esquema (red). ${DOWN_HINT}`);
}

/**
 * Verifica el esquema de forma perezosa: la primera vez fuerza la comprobación
 * y, si algo falla, vuelve a intentarlo como máximo cada 30 s. Evita que dos
 * peticiones simultáneas disparen dos verificaciones a la vez.
 */
export function maybeVerifySchema(force = false): Promise<void> {
  if (!client) return Promise.resolve();
  if (inflight) return inflight;
  if (!force && status.tablesReady === true) return Promise.resolve();
  if (!force && Date.now() - lastVerifyAt < VERIFY_THROTTLE_MS) return Promise.resolve();

  lastVerifyAt = Date.now();
  inflight = verify().finally(() => {
    inflight = null;
  });
  return inflight;
}

/* -------------------------------------------------------------------------- */
/* Inicialización                                                              */
/* -------------------------------------------------------------------------- */

/** Crea el cliente con las variables de entorno. Nunca lanza. */
export function initSupabase(): void {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const key = serviceKey ?? anonKey;
  status.host = url ? safeHost(url) : null;

  if (!url || !key) {
    logger.warn('Supabase no configurado (SUPABASE_URL / claves): la API usará la caché en memoria.');
    status.hint = 'Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env para persistir datos.';
    return;
  }

  const built = buildClient(url, key);
  if (!built) return;

  client = built;
  status.configured = true;
  status.keyType = serviceKey ? 'service_role' : 'anon';
  logger.info(`Supabase conectado a ${status.host ?? url} (clave ${status.keyType}).`);
}

/* -------------------------------------------------------------------------- */
/* Mapeo fila (snake_case) <-> entidad (camelCase)                             */
/* -------------------------------------------------------------------------- */

export interface HelpPointRow {
  id?: string;
  name?: string;
  category?: string;
  lat?: number;
  lng?: number;
  address?: string;
  barrio?: string;
  comuna?: string | null;
  phone?: string;
  whatsapp?: string | null;
  contact_person?: string | null;
  description?: string | null;
  schedule?: string | null;
  status?: string | null;
  urgent_items?: unknown;
  capacity?: string | null;
  verified?: boolean | null;
  author_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HelpNeedRow {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  urgency?: string | null;
  barrio?: string;
  contact_name?: string;
  contact_phone?: string;
  items?: unknown;
  status?: string | null;
  supporters_count?: number | null;
  image_url?: string | null;
  created_at?: string;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function mapPointRow(row: HelpPointRow): HelpPoint {
  const createdAt = row.created_at ?? new Date().toISOString();
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    category: normalizeCategory(row.category),
    lat: Number(row.lat ?? 0),
    lng: Number(row.lng ?? 0),
    address: String(row.address ?? ''),
    barrio: String(row.barrio ?? ''),
    comuna: String(row.comuna ?? ''),
    phone: String(row.phone ?? ''),
    whatsapp: String(row.whatsapp ?? ''),
    contactPerson: String(row.contact_person ?? ''),
    description: String(row.description ?? ''),
    schedule: String(row.schedule ?? ''),
    status: normalizePointStatus(row.status),
    urgentItems: toStringArray(row.urgent_items),
    capacity: row.capacity ? String(row.capacity) : undefined,
    verified: Boolean(row.verified),
    authorId: row.author_id ? String(row.author_id) : undefined,
    createdAt,
    updatedAt: row.updated_at ?? createdAt,
  };
}

export function mapNeedRow(row: HelpNeedRow): HelpNeed {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    category: normalizeCategory(row.category),
    urgency: normalizeUrgency(row.urgency),
    barrio: String(row.barrio ?? ''),
    contactName: String(row.contact_name ?? ''),
    contactPhone: String(row.contact_phone ?? ''),
    items: toStringArray(row.items),
    status: normalizeNeedStatus(row.status),
    supportersCount: Number(row.supporters_count ?? 0),
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export function toPointRow(point: HelpPoint): HelpPointRow {
  return {
    id: point.id,
    name: point.name,
    category: point.category,
    lat: point.lat,
    lng: point.lng,
    address: point.address,
    barrio: point.barrio,
    comuna: point.comuna,
    phone: point.phone,
    whatsapp: point.whatsapp,
    contact_person: point.contactPerson,
    description: point.description,
    schedule: point.schedule,
    status: point.status,
    urgent_items: point.urgentItems,
    capacity: point.capacity,
    verified: point.verified,
    author_id: point.authorId,
    created_at: point.createdAt,
    updated_at: point.updatedAt,
  };
}

export function toNeedRow(need: HelpNeed): HelpNeedRow {
  return {
    id: need.id,
    title: need.title,
    description: need.description,
    category: need.category,
    urgency: need.urgency,
    barrio: need.barrio,
    contact_name: need.contactName,
    contact_phone: need.contactPhone,
    items: need.items,
    status: need.status,
    supporters_count: need.supportersCount,
    image_url: need.imageUrl,
    created_at: need.createdAt,
  };
}

export interface PointCommentRow {
  id?: string;
  point_id?: string;
  author_id?: string;
  author_name?: string;
  author_role?: string | null;
  author_barrio?: string | null;
  body?: string;
  created_at?: string;
}

export function mapCommentRow(row: PointCommentRow): PointComment {
  return {
    id: String(row.id ?? ''),
    pointId: String(row.point_id ?? ''),
    userId: String(row.author_id ?? ''),
    userName: String(row.author_name ?? ''),
    userRole: normalizeRole(row.author_role),
    userBarrio: row.author_barrio ? String(row.author_barrio) : undefined,
    comment: String(row.body ?? ''),
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export function toCommentRow(comment: PointComment): PointCommentRow {
  return {
    id: comment.id,
    point_id: comment.pointId,
    author_id: comment.userId,
    author_name: comment.userName,
    author_role: comment.userRole,
    author_barrio: comment.userBarrio ?? null,
    body: comment.comment,
    created_at: comment.createdAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Escrituras fallidas                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Responde ante un fallo de escritura en Supabase: **nunca** un éxito con la
 * operación fallida.
 *
 * - Colisión de identificador (`23505` / «duplicate key») → `409`, para que
 *   el cliente sepa que debe cambiar el identificador y no reintentar a ciegas.
 * - Cualquier otro fallo (BD caída, red, permisos, tabla ausente) → `503`,
 *   con mensaje reintentable.
 *
 * El detalle del error queda siempre en el log (nunca en la respuesta).
 */
export function respondWriteFailure(res: JsonResponder, label: string, error: SupabaseLikeError): void {
  const detail = `${error.code ? `${error.code}: ` : ''}${error.message}`;
  const duplicated =
    error.code === '23505' || /duplicate key|already exists|primary key/i.test(error.message);

  if (duplicated) {
    logger.warn(`Escritura rechazada (${label}): identificador duplicado — ${detail}`);
    res.status(409).json({
      error: `Ya existe ${label} con ese identificador. Recarga la página y vuelve a intentarlo.`,
    });
    return;
  }

  logger.error(`Escritura fallida (${label}): ${detail}`);
  res.status(503).json({
    error: 'La base de datos no está disponible. Inténtalo de nuevo en unos segundos.',
  });
}
