export type HelpCategory = 'acopio' | 'veterinaria' | 'albergue' | 'salud';

export type PointStatus = 'abierto' | 'alta_demanda' | 'cerrado';

export type NeedUrgency = 'alta' | 'media' | 'baja';

export type NeedStatus = 'activa' | 'en_proceso' | 'resuelta';

export type UserRole = 'ciudadano' | 'voluntario' | 'coordinador';

export interface HelpPoint {
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

export interface HelpNeed {
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

export interface PointComment {
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
  source?: 'gemini';
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
