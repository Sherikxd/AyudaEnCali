import { ApiError } from '../services/api';
import {
  INITIAL_HELP_NEEDS,
  INITIAL_HELP_POINTS,
  INITIAL_POINT_COMMENTS,
} from '../data/initialData';

/**
 * Constantes y auxiliares puros del contexto: viven fuera del provider para
 * que `AppContext.tsx` se quede en la composición de hooks. Ninguno de estos
 * valores depende del render, así que compartirlos no cambia semántica.
 */

export const STORAGE_KEYS = {
  POINTS: 'ayudaencali_points_v4',
  NEEDS: 'ayudaencali_needs_v3',
  COMMENTS: 'ayudaencali_comments_v3',
  PROFILE: 'ayudaencali_profile_v3',
  LOCATION: 'ayudaencali_location_v2',
  /** Suscripción a alertas de nuevas necesidades cerca del usuario (MEJ-03). */
  NEED_ALERTS: 'ayudaencali_need_alerts_v1',
};

/**
 * IDs del contenido de ejemplo local. Son relleno de arranque: la fuente de
 * verdad de esos IDs es el servidor, así que en cada sync se descartan si no
 * vienen de allá (evita duplicar los puntos oficiales en el mapa).
 */
export const SEED_IDS = {
  POINTS: new Set(INITIAL_HELP_POINTS.map((point) => point.id)),
  NEEDS: new Set(INITIAL_HELP_NEEDS.map((need) => need.id)),
  COMMENTS: new Set(INITIAL_POINT_COMMENTS.map((comment) => comment.id)),
};

/** Avisos simultáneos en pantalla (se recorta por la cola). */
export const MAX_TOASTS = 3;
/** Segundos que permanece cada aviso antes de cerrarse solo. */
export const TOAST_DURATION_MS = 6_000;
/** Reanudaciones automáticas de una escritura guardada (p. ej. al entrar). */
export const MAX_WRITE_RESUMES = 1;
/** Una escritura guardada deja de ser relevante pasados 10 minutos. */
export const PENDING_WRITE_TTL_MS = 10 * 60_000;
/** Reenvíos de cada elemento local sin confirmar, por sesión de la app. */
export const MAX_SYNC_ATTEMPTS = 3;
/** Enfriamiento entre avisos de identidad por 401 (evita pop-ups en bucle). */
export const IDENTITY_PROMPT_COOLDOWN_MS = 5_000;
/** Mensaje por defecto cuando una escritura se queda sin identidad de Clerk. */
export const IDENTITY_MESSAGE =
  'Para continuar necesitas entrar con tu cuenta de AyudaEnCali: así evitamos reportes falsos.';
/**
 * Cadencia del sondeo de nuevas necesidades (MEJ-03). Solo con la
 * suscripción activa y usando el **mismo** `GET /api/needs` del sync: sin
 * coordenadas en la petición, sin funciones nuevas ni dependencias.
 */
export const NEED_ALERT_POLL_MS = 75_000;
/** Máximo de novedades que se detallan en un aviso de cercanía (MEJ-03). */
export const MAX_ALERTED_NEEDS = 3;

/**
 * Campos de identidad que el cliente ya **no** envía en los cuerros de
 * escritura (T9 · FAL-03): la identidad viaja solo en el JWT de Clerk y el
 * servidor la lee de ahí. Se retiran también del reenvío de lo pendiente
 * para que ningún payload vuelva a mandarlos.
 */
export const IDENTITY_KEYS = [
  'authorId',
  'userId',
  'userName',
  'userRole',
  'userBarrio',
  'verified',
] as const;

export const withoutIdentity = (payload: object): Record<string, unknown> => {
  const clean: Record<string, unknown> = { ...payload };
  for (const key of IDENTITY_KEYS) delete clean[key];
  return clean;
};

/** El servidor respondió «no tienes sesión válida» (T1: 401 en las escrituras). */
export const isUnauthorized = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 401;

/** El servidor ni siquiera respondió: red caída o timeout. */
export const isServerUnreachable = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 0;

/**
 * Rechazo **permanente** (BUG-02): un 4xx que volver a enviar no va a
 * arreglar. Se separa del transitorio (red, 5xx, 429 y los 401/408 que ya
 * tienen su propio flujo) para poder pasar el ítem a estado `failed` y
 * ofrecer acciones en lugar de reintentarlo 3 veces en vano.
 */
export const isPermanentRejection = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 401 &&
  error.status !== 408 &&
  error.status !== 429;

/** A qué lista local pertenece un elemento encolado (BUG-02). */
export type SyncKind = 'point' | 'need' | 'comment';

/** Escritura guardada mientras no hay identidad (T8). */
export interface PendingWrite {
  run: () => void;
  at: number;
  /** Veces que ya se ha reanudado; por encima de `MAX_WRITE_RESUMES` se descarta. */
  resumes: number;
}

/** Texto amable para «N publicaciones pendientes». */
export const pendingLabel = (total: number): string =>
  total === 1
    ? '1 publicación sigue sin confirmarse'
    : `${total} publicaciones siguen sin confirmarse`;
