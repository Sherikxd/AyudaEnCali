export type HelpCategory = 'acopio' | 'veterinaria' | 'albergue' | 'salud';

export type PointStatus = 'abierto' | 'alta_demanda' | 'cerrado';

export type NeedUrgency = 'alta' | 'media' | 'baja';

/**
 * Ciclo de vida de una necesidad (FEAT-01).
 *
 * `archivada` retira el reporte del tablón **sin borrarlo** (a diferencia de
 * `resuelta`, que sí se muestra en su pestaña). El servidor la admite en
 * `PATCH /api/needs/:id` (`server/validation.ts`, `NEED_STATUSES`).
 */
export type NeedStatus = 'activa' | 'en_proceso' | 'resuelta' | 'archivada';

export type UserRole = 'ciudadano' | 'voluntario' | 'coordinador';

/**
 * Elemento creado en este dispositivo y **todavía no confirmado** por el
 * servidor (p. ej. reportado con el servidor caído). El flag vive solo en el
 * cliente: se conserva en cada sync y se retira en cuanto el servidor lo
 * acepta, para poder reintentarlo y avisar de que sigue pendiente.
 */
export interface PendingLocal {
  pending?: boolean;
  /**
   * Rechazo **permanente** del servidor (BUG-02): un 4xx que no se arregla
   * reintentando (400/403/404/409…, salvo 401/408/429). El ítem conserva su
   * payload y sigue `pending` (sigue en el dispositivo y sin confirmar), pero
   * ya **no** se reenvía solo: aparece en el aviso de pendientes con las
   * acciones «Reintentar» y «Descartar». Se limpia al reintentar o al
   * confirmarlo el servidor.
   */
  syncFailed?: boolean;
  /** Mensaje del servidor que provocó el rechazo (se muestra en el aviso). */
  syncError?: string;
}

export interface HelpPoint extends PendingLocal {
  id: string;
  name: string;
  category: HelpCategory;
  lat: number;
  lng: number;
  address: string;
  barrio: string;
  comuna: string;
  phone: string;
  whatsapp: string;
  contactPerson: string;
  description: string;
  schedule: string;
  status: PointStatus;
  urgentItems: string[];
  capacity?: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  authorId?: string;
}

export interface HelpNeed extends PendingLocal {
  id: string;
  title: string;
  description: string;
  category: HelpCategory;
  urgency: NeedUrgency;
  barrio: string;
  contactName: string;
  contactPhone: string;
  items: string[];
  status: NeedStatus;
  supportersCount: number;
  createdAt: string;
  imageUrl?: string;
  /**
   * `sub` del JWT de quien la publicó. **Solo lo rellena el servidor**
   * (decisión 2026-09-28): el cliente lo usa únicamente para mostrar las
   * acciones de edición a quien publicó; `undefined` = autor heredado
   * desconocido (nadie puede editarla por API).
   */
  authorId?: string;
}

/** Campos que acepta `PATCH /api/needs/:id` (el servidor los valida). */
export type NeedPatch = Partial<
  Pick<
    HelpNeed,
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

/** Campos que acepta `PUT /api/points/:id` (el servidor los valida). */
export type PointPatch = Partial<
  Pick<
    HelpPoint,
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

/** Respuesta de `DELETE /api/needs/:id` y `DELETE /api/points/:id`. */
export interface DeleteResponse {
  success: boolean;
  id: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  barrio: string;
  role: UserRole;
  organization?: string;
  isRegistered: boolean; // false = usuario no aún creado
  reportedPointIds: string[];
  savedPointIds: string[];
}

export interface PointComment extends PendingLocal {
  id: string;
  pointId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  userBarrio?: string;
  comment: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  relatedPoints?: HelpPoint[];
}

export interface UserCoordinates {
  lat: number;
  lng: number;
  barrio?: string;
  accuracy?: number;
  source?: 'gps' | 'barrio_selection' | 'map_pin' | 'default' | 'profile';
  address?: string;
  isCustom?: boolean;
}

/* ---------------------------------------------------------------------------
 * Contrato de la API REST (/api/*)
 * Compartido entre el cliente (src/) y el servidor (server.ts).
 * ------------------------------------------------------------------------- */

/** Origen de los datos devueltos por una respuesta. */
export type DataSource = 'supabase' | 'memory_cache';

export interface PointsResponse {
  points: HelpPoint[];
  source: DataSource;
}

export interface NeedsResponse {
  needs: HelpNeed[];
  source: DataSource;
}

export interface CommentsResponse {
  comments: PointComment[];
}

export interface PointResponse {
  point: HelpPoint;
}

export interface NeedResponse {
  need: HelpNeed;
}

export interface CommentResponse {
  comment: PointComment;
}

/* ---------------------------------------------------------------------------
 * Avisos efímeros (toasts) del cliente. Sin dependencias: solo estado del
 * contexto + un componente con `aria-live="polite"`.
 * ------------------------------------------------------------------------- */

/** Tipo de aviso: colorea el toast y define el texto accesible. */
export type ToastKind = 'success' | 'error' | 'warning' | 'info';

/**
 * Acción visible dentro de un aviso (BUG-02): «Reintentar» o «Descartar»
 * sobre una publicación rechazada. Los avisos con acciones **no** se cierra
 * solos: exigen una decisión y así no se pierden datos en silencio.
 */
export interface ToastAction {
  /** Identidad estable de la acción dentro del aviso (clave de React). */
  id: string;
  label: string;
  /** Recibe el id del aviso para poder cerrarlo al actuar. */
  run: (toastId: number) => void;
  /** Pinta el botón en rojo (acción destructiva, p. ej. «Descartar»). */
  variant?: 'default' | 'danger';
}

export interface ToastItem {
  /** Identidad estable (clave de React y para descartarla a mano). */
  id: number;
  kind: ToastKind;
  message: string;
  /** Si tiene acciones el aviso se queda hasta que se actúe o se cierre. */
  actions?: ToastAction[];
}

/** Acción de apoyo: `add` da el like, `remove` lo retira (una sola vez por usuario). */
export type SupportAction = 'add' | 'remove';

export interface SupportResponse {
  success: boolean;
  /** Contador actualizado de la necesidad (fuente de verdad: el servidor). */
  count: number;
  /** Estado final de *esta* cuenta: `true` si queda como apoyante. */
  supported: boolean;
}

export interface MySupportsResponse {
  /** IDs de las necesidades que la cuenta actual ya apoyó. */
  needIds: string[];
}

export interface ChatResponse {
  reply: string;
  /**
   * Quién redactó la respuesta: `local` cuando la sirvió el directorio del
   * servidor (T5, sin `GEMINI_API_KEY` o con el modelo caído). El cliente
   * muestra ese texto tal cual y **nunca** inventa uno propio (T14).
   */
  source?: 'gemini' | 'local';
}

export interface ConfigResponse {
  status: 'ok';
  appName: string;
  supabaseConnected: boolean;
  /** Dominio del proyecto Supabase, nunca credenciales. */
  supabaseUrl: string | null;
  /** `true` = tablas listas, `false` = faltan, `null` = sin verificar. */
  supabaseTablesReady: boolean | null;
  /** Pista accionable (qué ejecutar en Supabase) cuando algo falla. */
  supabaseHint: string | null;
  cartoConfigured: boolean;
  hasGeminiKey: boolean;
  /**
   * Clave pública de Clerk (`pk_…`) o `null` si no está definida.
   *
   * Se expone aquí a propósito: es pública por diseño y permite configurarla
   * en tiempo de ejecución (variables del contenedor) sin recompilar. La
   * secreta (`CLERK_SECRET_KEY`) nunca aparece en esta respuesta.
   */
  clerkPublishableKey: string | null;
  time: string;
}

export interface ApiErrorResponse {
  error: string;
  details?: string[];
}
