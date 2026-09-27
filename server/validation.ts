import type {
  HelpCategory,
  HelpNeed,
  HelpPoint,
  NeedStatus,
  NeedUrgency,
  PointStatus,
  UserRole,
} from '../src/types';

/**
 * Validación y saneamiento de los payloads que llegan por HTTP.
 *
 * Reglas generales:
 * - Nunca confiamos en el cuerpo de la petición (todo se valida y recorta).
 * - Se normalizan espacios y largos máximos para evitar basura en la BD.
 * - Los enums se comparan contra listas permitidas; si no coincide, se usa
 *   un valor por defecto seguro.
 */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const CATEGORIES: readonly HelpCategory[] = ['acopio', 'veterinaria', 'albergue', 'salud'];
const POINT_STATUSES: readonly PointStatus[] = ['abierto', 'alta_demanda', 'cerrado'];
const URGENCIES: readonly NeedUrgency[] = ['alta', 'media', 'baja'];
const USER_ROLES: readonly UserRole[] = ['ciudadano', 'voluntario', 'coordinador'];

export const LIMITS = {
  name: 160,
  address: 220,
  barrio: 120,
  short: 60,
  medium: 500,
  long: 2000,
  comment: 1200,
  chat: 2000,
  historyItems: 10,
} as const;

export type PointDraft = Omit<HelpPoint, 'id' | 'createdAt' | 'updatedAt' | 'verified'> & {
  id?: string;
};

export type NeedDraft = Omit<HelpNeed, 'id' | 'createdAt' | 'supportersCount'> & { id?: string };

export interface CommentDraft {
  pointId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  userBarrio: string;
  comment: string;
}

export interface ChatDraft {
  message: string;
  /** Barrio declarado por el usuario para personalizar la respuesta. */
  barrio?: string;
  history: Array<{ sender: 'user' | 'assistant'; text: string }>;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Texto plano de una sola línea. */
function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Texto con saltos de línea (descripciones, comentarios). */
function paragraph(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function stringList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => text(item, maxLen))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = text(value, 40);
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T) : fallback;
}

function optionalId(value: unknown): string | undefined {
  const id = text(value, 80);
  // Solo se aceptan identificadores con formato controlado.
  return /^[A-Za-z0-9_-]{4,80}$/.test(id) ? id : undefined;
}

function fail(...errors: string[]): { ok: false; errors: string[] } {
  return { ok: false, errors };
}

/** Normalizadores reutilizados también al mapear filas de la base de datos. */
export const normalizeCategory = (value: unknown): HelpCategory => oneOf(value, CATEGORIES, 'acopio');
export const normalizePointStatus = (value: unknown): PointStatus => oneOf(value, POINT_STATUSES, 'abierto');
export const normalizeUrgency = (value: unknown): NeedUrgency => oneOf(value, URGENCIES, 'media');
export const normalizeNeedStatus = (value: unknown): NeedStatus =>
  oneOf(value, ['activa', 'en_proceso', 'resuelta'], 'activa');
export const normalizeRole = (value: unknown): UserRole => oneOf(value, USER_ROLES, 'ciudadano');

/* -------------------------------------------------------------------------- */
/* Validadores públicos                                                        */
/* -------------------------------------------------------------------------- */

export function validatePoint(raw: unknown): ValidationResult<PointDraft> {
  if (!isRecord(raw)) return fail('El cuerpo de la petición debe ser un objeto JSON.');

  const errors: string[] = [];
  const name = text(raw.name, LIMITS.name);
  const lat = toNumber(raw.lat);
  const lng = toNumber(raw.lng);
  const address = text(raw.address, LIMITS.address);
  const barrio = text(raw.barrio, LIMITS.barrio);

  if (name.length < 3) errors.push('El nombre del punto es obligatorio (mínimo 3 caracteres).');
  if (!inRange(lat, -90, 90)) errors.push('La latitud debe ser un número válido entre -90 y 90.');
  if (!inRange(lng, -180, 180)) errors.push('La longitud debe ser un número válida entre -180 y 180.');
  if (address.length < 3) errors.push('La dirección es obligatoria.');
  if (barrio.length < 2) errors.push('El barrio es obligatorio.');

  if (errors.length > 0) return fail(...errors);

  return {
    ok: true,
    value: {
      id: optionalId(raw.id),
      name,
      category: oneOf(raw.category, CATEGORIES, 'acopio'),
      lat,
      lng,
      address,
      barrio,
      comuna: text(raw.comuna, LIMITS.short) || 'Sin comuna',
      phone: text(raw.phone, 40),
      whatsapp: text(raw.whatsapp, 40),
      contactPerson: text(raw.contactPerson, LIMITS.medium),
      description: paragraph(raw.description, LIMITS.long),
      schedule: text(raw.schedule, LIMITS.medium),
      status: oneOf(raw.status, POINT_STATUSES, 'abierto'),
      urgentItems: stringList(raw.urgentItems, 25, 120),
      capacity: text(raw.capacity, LIMITS.medium),
      authorId: optionalId(raw.authorId),
    },
  };
}

export function validateNeed(raw: unknown): ValidationResult<NeedDraft> {
  if (!isRecord(raw)) return fail('El cuerpo de la petición debe ser un objeto JSON.');

  const errors: string[] = [];
  const title = text(raw.title, LIMITS.name);
  const barrio = text(raw.barrio, LIMITS.barrio);

  if (title.length < 5) errors.push('El título de la necesidad es obligatorio (mínimo 5 caracteres).');
  if (barrio.length < 2) errors.push('El barrio es obligatorio.');

  if (errors.length > 0) return fail(...errors);

  return {
    ok: true,
    value: {
      id: optionalId(raw.id),
      title,
      description: paragraph(raw.description, LIMITS.long),
      category: oneOf(raw.category, CATEGORIES, 'acopio'),
      urgency: oneOf(raw.urgency, URGENCIES, 'media'),
      barrio,
      contactName: text(raw.contactName, LIMITS.medium),
      contactPhone: text(raw.contactPhone, 40),
      items: stringList(raw.items, 25, 120),
      status: oneOf<NeedStatus>(raw.status, ['activa', 'en_proceso', 'resuelta'], 'activa'),
      imageUrl: text(raw.imageUrl, 300),
    },
  };
}

export function validateComment(raw: unknown): ValidationResult<CommentDraft> {
  if (!isRecord(raw)) return fail('El cuerpo de la petición debe ser un objeto JSON.');

  const errors: string[] = [];
  const pointId = text(raw.pointId, 80);
  const comment = paragraph(raw.comment, LIMITS.comment);

  if (pointId.length < 3) errors.push('El identificador del punto es inválido.');
  if (comment.length < 2) errors.push('El comentario no puede estar vacío.');

  if (errors.length > 0) return fail(...errors);

  return {
    ok: true,
    value: {
      pointId,
      userId: text(raw.userId, 80) || 'usr-anon',
      userName: text(raw.userName, LIMITS.medium) || 'Ciudadano Solidario',
      userRole: oneOf(raw.userRole, USER_ROLES, 'ciudadano'),
      userBarrio: text(raw.userBarrio, LIMITS.barrio) || 'Cali',
      comment,
    },
  };
}

export function validateChat(raw: unknown): ValidationResult<ChatDraft> {
  if (!isRecord(raw)) return fail('El cuerpo de la petición debe ser un objeto JSON.');

  const message = paragraph(raw.message, LIMITS.chat);
  if (message.length === 0) return fail('El mensaje es obligatorio.');

  const history: ChatDraft['history'] = [];
  if (Array.isArray(raw.conversationHistory)) {
    for (const item of raw.conversationHistory.slice(-LIMITS.historyItems)) {
      if (!isRecord(item)) continue;
      const sender = item.sender === 'assistant' ? 'assistant' : 'user';
      const textValue = paragraph(item.text, LIMITS.chat);
      if (textValue) history.push({ sender, text: textValue });
    }
  }

  const location = isRecord(raw.userLocation) ? raw.userLocation : undefined;
  const barrio = location ? text(location.barrio, LIMITS.barrio) : '';

  return {
    ok: true,
    value: {
      message,
      barrio: barrio || undefined,
      history,
    },
  };
}

/** Normaliza un identificador leído de la ruta (`req.params`). */
export function sanitizeParam(value: unknown): string {
  return text(value, 80);
}
