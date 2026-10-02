/**
 * Contexto de datos del asistente (puntos y necesidades) para
 * `server/handlers/chat.ts`.
 *
 * El chat es la **única** ruta que antes no consultaba Supabase: su
 * `memory` es la semilla, así que en una función de Vercel (aislada por
 * módulo) anunciaba las necesidades de la semilla aunque la BD tuviera las
 * reales, o datos inventados si la BD estaba caída. Este módulo carga el contexto igual que
 * hacen `GET /api/points` y `GET /api/needs`, con una caducidad para no
 * disparar dos SELECT en cada pregunta.
 *
 * Solo **lee**: no toca `maybeVerifySchema` (nada de DDL desde el chat).
 * Si falla una consulta se conserva una última copia leída con éxito, pero
 * una semilla local nunca se presenta como directorio real.
 */
import { errorMessage, logger } from './logger.js';
import { memory } from './store.js';
import { getSupabaseClient, mapNeedRow, mapPointRow, withSupabaseRetry } from './supabase.js';
import type { HelpNeedRow, HelpPointRow } from './supabase.js';

/** Caducidad del contexto en memoria (por instancia de función/proceso). */
const CONTEXT_TTL_MS = 30_000;

/** Espera tras un fallo: no hace falta esperar el TTL entero para reintentar. */
const RETRY_MS = 5_000;

/** Instante a partir del cual se vuelve a consultar la BD. */
let nextAttemptAt = 0;

/** Carga en curso (aunque pidan varias a la vez, solo hay una). */
let inFlight: Promise<void> | null = null;
let hasLivePoints = false;
let hasLiveNeeds = false;

export interface ChatContextAvailability {
  points: boolean;
  needs: boolean;
}

/** Indica qué tablas tienen una copia leída con éxito de Supabase. */
export function getChatContextAvailability(): ChatContextAvailability {
  return { points: hasLivePoints, needs: hasLiveNeeds };
}

async function loadContext(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return; // sin configuración no hay contexto real disponible para el chat

  const [points, needs] = await Promise.all([
    withSupabaseRetry<HelpPointRow[]>('Supabase help_points (chat)', () =>
      client.from('help_points').select('*').order('created_at', { ascending: false }),
    ),
    withSupabaseRetry<HelpNeedRow[]>('Supabase help_needs (chat)', () =>
      client.from('help_needs').select('*').order('created_at', { ascending: false }),
    ),
  ]);

  // Una respuesta exitosa, incluso vacía, reemplaza la semilla/caché; una
  // tabla vacía nunca debe hacer pasar datos de ejemplo por datos actuales.
  if (!points.error && Array.isArray(points.data)) {
    memory.points = points.data.map(mapPointRow);
    hasLivePoints = true;
  }
  if (!needs.error && Array.isArray(needs.data)) {
    memory.needs = needs.data.map(mapNeedRow);
    hasLiveNeeds = true;
  }
}

/**
 * Asegura que `memory.points` / `memory.needs` estén frescos antes de
 * construir las instrucciones del asistente.
 *
 * Nunca rechaza: si la BD falla, el llamador sigue con la caché que haya.
 */
export function ensureContextFresh(): Promise<void> {
  const now = Date.now();
  if (inFlight) return inFlight;
  if (now < nextAttemptAt) return Promise.resolve();

  nextAttemptAt = now + CONTEXT_TTL_MS;
  inFlight = loadContext()
    .catch((error: unknown) => {
      nextAttemptAt = Date.now() + RETRY_MS;
      logger.warn('No se pudo cargar el contexto del asistente:', errorMessage(error));
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Precarga el contexto en el arranque de la entrada (`api/chat.ts`): la
 * primera petición no paga la carga y, si la BD no está lista, la reintenta
 * en la petición real. Fire-and-forget: `ensureContextFresh` nunca rechaza.
 */
export function warmContext(): void {
  void ensureContextFresh();
}
