import type {
  HelpCategory,
  HelpPoint,
  NeedStatus,
  NeedUrgency,
  PointStatus,
  UserRole,
} from '../src/types/index.js';
import type { HelpNeedWithAuthor, ReportEntityType } from './entities.js';
import type { GeoPoint } from './geo.js';

/**
 * Validación y saneamiento de los payloads que llegan por HTTP.
 *
 * Reglas generales:
 * - Nunca confiamos en el cuerpo de la petición (todo se valida y recorta).
 * - **La identidad nunca se lee del cuerpo** (decisión 2026-09-28): los campos
 *   `authorId`, `userId`, `userName`, `userRole`, `userBarrio` y `verified`
 *   que mande el cliente se **ignoran** y el handler los rellena desde el JWT
 *   verificado. Se ignoran (no se rechazan) para no romper a los clientes que
 *   aún los envían; el validador estricto llega con el cliente (T9).
 * - Se normalizan espacios y largos máximos para evitar basura en la BD.
 * - Los enums se comparan contra listas permitidas; en la creación, si no
 *   coincide, se usa un valor por defecto seguro; en una **actualización**
 *   (PATCH/PUT) un valor desconocido se **rechaza**, para no escribir por
 *   sorpresa un estado distinto del que pidió quien edita.
 */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const CATEGORIES: readonly HelpCategory[] = ['acopio', 'veterinaria', 'albergue', 'salud'];
const POINT_STATUSES: readonly PointStatus[] = ['abierto', 'alta_demanda', 'cerrado'];
const URGENCIES: readonly NeedUrgency[] = ['alta', 'media', 'baja'];
const USER_ROLES: readonly UserRole[] = ['ciudadano', 'voluntario', 'coordinador'];
/**
 * Estados que un **autor** puede dar a su necesidad (FEAT-01). `archivada`
 * entró con T10 (ciclo de vida en la UI): amplía `NeedStatus` del cliente en
 * `src/types/index.ts` y se acepta exactamente igual que los demás. La
 * columna `help_needs.status` es `TEXT` sin `CHECK` (`schema.sql:56`), así
 * que no hay migración que tocar.
 */
export const NEED_STATUSES: readonly NeedStatus[] = [
  'activa',
  'en_proceso',
  'resuelta',
  'archivada',
];

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

export type PointDraft = Omit<
  HelpPoint,
  'id' | 'createdAt' | 'updatedAt' | 'verified' | 'authorId'
> & { id?: string };

export type NeedDraft = Omit<
  HelpNeedWithAuthor,
  'id' | 'createdAt' | 'supportersCount' | 'authorId'
> & { id?: string };

/**
 * Actualización parcial de una necesidad (`PATCH /api/needs/:id`).
 *
 * Solo campos editables por su autor: ni `id`, ni `supportersCount` (lo
 * recuenta la BD), ni `authorId` (identidad del JWT), ni `createdAt`.
 */
export type NeedPatch = Partial<
  Pick<
    NeedDraft,
    | 'title'
    | 'description'
    | 'category'
    | 'urgency'
    | 'barrio'
    | 'contactName'
    | 'contactPhone'
    | 'items'
    | 'status'
    | 'imageUrl'
  >
>;

/**
 * Actualización de un punto (`PUT /api/points/:id`).
 *
 * Como `NeedPatch`: sin `id`, sin `authorId` y **sin `verified`** — marcar
 * como verificado es una acción de moderación (T7), no del autor.
 */
export type PointPatch = Partial<
  Pick<
    PointDraft,
    | 'name'
    | 'category'
    | 'lat'
    | 'lng'
    | 'address'
    | 'barrio'
    | 'comuna'
    | 'phone'
    | 'whatsapp'
    | 'contactPerson'
    | 'description'
    | 'schedule'
    | 'status'
    | 'urgentItems'
    | 'capacity'
  >
>;

/**
 * Comentario: solo el texto y el punto. El autor (`userId`, `userName`,
 * `userRole`, `userBarrio`) lo rellena el handler desde la sesión verificada.
 */
export interface CommentDraft {
  pointId: string;
  comment: string;
}

/** Tipos de entidad que se pueden reportar (T28 · cola de moderación). */
const REPORT_ENTITY_TYPES: readonly ReportEntityType[] = ['point', 'need'];

/** Reporte: la entidad, su id y el motivo. Quién reporta va en el JWT. */
export interface ReportDraft {
  entityType: ReportEntityType;
  entityId: string;
  reason: string;
}

export interface ChatDraft {
  message: string;
  /** Barrio declarado por el usuario para personalizar la respuesta. */
  barrio?: string;
  /** Coordenadas del usuario, si las envió: habilitan el orden por proximidad. */
  coords?: GeoPoint | null;
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
  oneOf(value, NEED_STATUSES, 'activa');
export const normalizeRole = (value: unknown): UserRole => oneOf(value, USER_ROLES, 'ciudadano');

/**
 * Rol con forma válida o `undefined` si no lo es (T28 · moderación).
 *
 * A diferencia de `normalizeRole`, un valor desconocido **no** se corrige a
 * `ciudadano`: los permisos de moderación deciden con este rol y deben
 * fallar cerrado (sin rol reconocido no hay permisos).
 */
export function toUserRole(value: unknown): UserRole | undefined {
  const candidate = text(value, 40);
  return (USER_ROLES as readonly string[]).includes(candidate) ? (candidate as UserRole) : undefined;
}

/**
 * ¿Este rol puede moderar? (T28 · FEAT-02)
 *
 * Moderar es marcar `verified` en un punto y leer la cola de reportes. No
 * se crea ningún rol nuevo (eso tocaría `src/types/index.ts`, del área del
 * agente-frontend): el rol existente con esa responsabilidad es
 * `coordinador`. Si el rol no viene en el JWT se responde 403.
 */
export function isModerator(role: UserRole | undefined): boolean {
  return role === 'coordinador';
}

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
      // `authorId` NO se lee del cuerpo: lo pone el handler desde el JWT.
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
      status: oneOf<NeedStatus>(raw.status, NEED_STATUSES, 'activa'),
      imageUrl: text(raw.imageUrl, 300),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Actualizaciones (PATCH/PUT): estrictas, sin corregir en silencio            */
/* -------------------------------------------------------------------------- */

/** ¿El cuerpo trae alguna de las claves editables? (las demás se ignoran) */
function hasEditableKey(raw: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => key in raw);
}

const NEED_PATCH_KEYS = [
  'title',
  'description',
  'category',
  'urgency',
  'barrio',
  'contactName',
  'contactPhone',
  'items',
  'status',
  'imageUrl',
] as const;

const POINT_PATCH_KEYS = [
  'name',
  'category',
  'lat',
  'lng',
  'address',
  'barrio',
  'comuna',
  'phone',
  'whatsapp',
  'contactPerson',
  'description',
  'schedule',
  'status',
  'urgentItems',
  'capacity',
] as const;

/** Texto de un campo de parche: `''` y `null` lo borran, tipos no texto → error. */
function patchText(
  raw: Record<string, unknown>,
  key: string,
  max: number,
  errors: string[],
  label: string,
): string | undefined {
  const value = raw[key];
  if (value === null) return ''; // borrado explícito
  if (typeof value !== 'string') {
    errors.push(`${label} debe ser texto.`);
    return undefined;
  }
  return text(value, max);
}

/**
 * Actualización de una necesidad (`PATCH /api/needs/:id`).
 *
 * A diferencia de la creación, **no se corrige en silencio** lo que llega
 * mal: un `status`, `category` o `urgency` desconocido produce 400, para no
 * escribir por sorpresa algo distinto de lo que pidió quien edita. Las
 * claves desconocidas —incluidas las de identidad (`authorId`, `userId`,
 * `verified`, …)— se ignoran. Un cuerpo sin campos editables es un 400:
 * no hay nada que actualizar.
 */
export function validateNeedUpdate(raw: unknown): ValidationResult<NeedPatch> {
  if (!isRecord(raw)) return fail('El cuerpo de la petición debe ser un objeto JSON.');
  if (!hasEditableKey(raw, NEED_PATCH_KEYS)) {
    return fail('El cuerpo no contiene campos actualizables de la necesidad.');
  }

  const errors: string[] = [];
  const patch: NeedPatch = {};

  if ('title' in raw) {
    const title = patchText(raw, 'title', LIMITS.name, errors, 'El título');
    if (title !== undefined) {
      if (title.length < 5) errors.push('El título de la necesidad es obligatorio (mínimo 5 caracteres).');
      else patch.title = title;
    }
  }
  if ('description' in raw) {
    const description = patchText(raw, 'description', LIMITS.long, errors, 'La descripción');
    if (description !== undefined) patch.description = description;
  }
  if ('category' in raw) {
    const value = text(raw.category, 40);
    if (!(CATEGORIES as readonly string[]).includes(value)) {
      errors.push('La categoría indicada no es válida (acopio | veterinaria | albergue | salud).');
    } else patch.category = value as HelpCategory;
  }
  if ('urgency' in raw) {
    const value = text(raw.urgency, 40);
    if (!(URGENCIES as readonly string[]).includes(value)) {
      errors.push('La urgencia indicada no es válida (alta | media | baja).');
    } else patch.urgency = value as NeedUrgency;
  }
  if ('status' in raw) {
    const value = text(raw.status, 40);
    if (!(NEED_STATUSES as readonly string[]).includes(value)) {
      errors.push('El estado indicado no es válido (activa | en_proceso | resuelta | archivada).');
    } else patch.status = value as NeedStatus;
  }
  if ('barrio' in raw) {
    const barrio = patchText(raw, 'barrio', LIMITS.barrio, errors, 'El barrio');
    if (barrio !== undefined) {
      if (barrio.length < 2) errors.push('El barrio es obligatorio.');
      else patch.barrio = barrio;
    }
  }
  if ('contactName' in raw) {
    const value = patchText(raw, 'contactName', LIMITS.medium, errors, 'El nombre de contacto');
    if (value !== undefined) patch.contactName = value;
  }
  if ('contactPhone' in raw) {
    const value = patchText(raw, 'contactPhone', 40, errors, 'El teléfono de contacto');
    if (value !== undefined) patch.contactPhone = value;
  }
  if ('imageUrl' in raw) {
    const value = patchText(raw, 'imageUrl', 300, errors, 'La imagen');
    if (value !== undefined) patch.imageUrl = value;
  }
  if ('items' in raw) {
    if (raw.items !== null && !Array.isArray(raw.items)) {
      errors.push('La lista de ítems debe ser un arreglo de textos.');
    } else {
      patch.items = stringList(raw.items, 25, 120);
    }
  }

  if (errors.length > 0) return fail(...errors);
  return { ok: true, value: patch };
}

/**
 * Actualización de un punto (`PUT /api/points/:id`), con las mismas reglas
 * estrictas que `validateNeedUpdate`: enums y tipos malos → 400; `id`,
 * `authorId` y `verified` no se leen (T7 modera `verified`).
 */
export function validatePointUpdate(raw: unknown): ValidationResult<PointPatch> {
  if (!isRecord(raw)) return fail('El cuerpo de la petición debe ser un objeto JSON.');
  if (!hasEditableKey(raw, POINT_PATCH_KEYS)) {
    return fail('El cuerpo no contiene campos actualizables del punto.');
  }

  const errors: string[] = [];
  const patch: PointPatch = {};

  if ('name' in raw) {
    const name = patchText(raw, 'name', LIMITS.name, errors, 'El nombre');
    if (name !== undefined) {
      if (name.length < 3) errors.push('El nombre del punto es obligatorio (mínimo 3 caracteres).');
      else patch.name = name;
    }
  }
  if ('category' in raw) {
    const value = text(raw.category, 40);
    if (!(CATEGORIES as readonly string[]).includes(value)) {
      errors.push('La categoría indicada no es válida (acopio | veterinaria | albergue | salud).');
    } else patch.category = value as HelpCategory;
  }
  if ('status' in raw) {
    const value = text(raw.status, 40);
    if (!(POINT_STATUSES as readonly string[]).includes(value)) {
      errors.push('El estado indicado no es válido (abierto | alta_demanda | cerrado).');
    } else patch.status = value as PointStatus;
  }
  if ('lat' in raw) {
    const lat = toNumber(raw.lat);
    if (!inRange(lat, -90, 90)) errors.push('La latitud debe ser un número válido entre -90 y 90.');
    else patch.lat = lat;
  }
  if ('lng' in raw) {
    const lng = toNumber(raw.lng);
    if (!inRange(lng, -180, 180)) errors.push('La longitud debe ser un número válida entre -180 y 180.');
    else patch.lng = lng;
  }
  if ('address' in raw) {
    const address = patchText(raw, 'address', LIMITS.address, errors, 'La dirección');
    if (address !== undefined) {
      if (address.length < 3) errors.push('La dirección es obligatoria.');
      else patch.address = address;
    }
  }
  if ('barrio' in raw) {
    const barrio = patchText(raw, 'barrio', LIMITS.barrio, errors, 'El barrio');
    if (barrio !== undefined) {
      if (barrio.length < 2) errors.push('El barrio es obligatorio.');
      else patch.barrio = barrio;
    }
  }
  for (const key of ['comuna', 'phone', 'whatsapp', 'contactPerson', 'description', 'schedule', 'capacity'] as const) {
    if (!(key in raw)) continue;
    const label = { comuna: 'La comuna', phone: 'El teléfono', whatsapp: 'El WhatsApp', contactPerson: 'La persona de contacto', description: 'La descripción', schedule: 'El horario', capacity: 'La capacidad' }[key];
    const max = { comuna: LIMITS.short, phone: 40, whatsapp: 40, contactPerson: LIMITS.medium, description: LIMITS.long, schedule: LIMITS.medium, capacity: LIMITS.medium }[key];
    const value = patchText(raw, key, max, errors, label);
    if (value !== undefined) patch[key] = value;
  }
  if ('urgentItems' in raw) {
    if (raw.urgentItems !== null && !Array.isArray(raw.urgentItems)) {
      errors.push('La lista de ítems urgentes debe ser un arreglo de textos.');
    } else {
      patch.urgentItems = stringList(raw.urgentItems, 25, 120);
    }
  }

  if (errors.length > 0) return fail(...errors);
  return { ok: true, value: patch };
}

/**
 * Parche de moderación (`PATCH /api/points/:id`, T28): **solo** `verified`.
 *
 * Cualquier otra clave del cuerpo → 400: la verificación es la única acción
 * de moderación sobre un punto y no se edita «por las dudas» nada más (ni
 * nombre, ni estado, ni identidad). Un `verified` que no sea booleano
 * también es 400: aquí nunca se corrige en silencio.
 */
export function validateVerifiedUpdate(raw: unknown): ValidationResult<{ verified: boolean }> {
  if (!isRecord(raw)) return fail('El cuerpo de la petición debe ser un objeto JSON.');

  const errors: string[] = [];
  const extra = Object.keys(raw).filter((key) => key !== 'verified');
  if (extra.length > 0) errors.push('La moderación solo admite el campo "verified".');

  const value = raw.verified;
  if (!('verified' in raw)) errors.push('El campo "verified" es obligatorio.');
  else if (typeof value !== 'boolean') errors.push('El campo "verified" debe ser verdadero o falso.');

  if (errors.length > 0) return fail(...errors);
  // Seguro: el `if` anterior ya exigió presencia y tipo booleano.
  return { ok: true, value: { verified: value as boolean } };
}

/**
 * Reporte de contenido (`POST /api/reports`, T28).
 *
 * `entityType` es estricto (`point | need`), `entityId` con formato
 * controlado y `reason` un motivo de 3 a 500 caracteres (el texto largo se
 * recorta, como en el resto de la API). Quién reporta **no** se lee de aquí:
 * lo pone el handler desde el JWT verificado.
 */
export function validateReport(raw: unknown): ValidationResult<ReportDraft> {
  if (!isRecord(raw)) return fail('El cuerpo de la petición debe ser un objeto JSON.');

  const errors: string[] = [];
  const entityType = text(raw.entityType, 20);
  if (!(REPORT_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    errors.push('El tipo indicado no es válido (point | need).');
  }
  const entityId = text(raw.entityId, 80);
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(entityId)) {
    errors.push('El identificador de la entidad es inválido.');
  }
  const reason = paragraph(raw.reason, LIMITS.medium);
  if (reason.length < 3) errors.push('El motivo del reporte es obligatorio (mínimo 3 caracteres).');

  if (errors.length > 0) return fail(...errors);
  // Seguro: `entityType` solo llega aquí si está en la lista permitida.
  return { ok: true, value: { entityType: entityType as ReportEntityType, entityId, reason } };
}

export function validateComment(raw: unknown): ValidationResult<CommentDraft> {
  if (!isRecord(raw)) return fail('El cuerpo de la petición debe ser un objeto JSON.');

  const errors: string[] = [];
  const pointId = text(raw.pointId, 80);
  const comment = paragraph(raw.comment, LIMITS.comment);

  if (pointId.length < 3) errors.push('El identificador del punto es inválido.');
  if (comment.length < 2) errors.push('El comentario no puede estar vacío.');

  if (errors.length > 0) return fail(...errors);

  // Ni `userId`, ni `userName`, ni `userRole`, ni `userBarrio`: la identidad
  // y el nombre que se muestran salen de la sesión verificada (T1/FAL-03).
  return {
    ok: true,
    value: { pointId, comment },
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

  // FEAT-07: lat/lng opcionales. Un valor fuera de rango se ignora (nunca
  // rompe la conversación por una coordenada mala).
  let coords: GeoPoint | null = null;
  if (location) {
    const lat = toNumber(location.lat);
    const lng = toNumber(location.lng);
    if (inRange(lat, -90, 90) && inRange(lng, -180, 180)) coords = { lat, lng };
  }

  return {
    ok: true,
    value: {
      message,
      barrio: barrio || undefined,
      coords,
      history,
    },
  };
}

/** Normaliza un identificador leído de la ruta (`req.params`). */
export function sanitizeParam(value: unknown): string {
  return text(value, 80);
}
