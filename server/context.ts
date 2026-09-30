/**
 * Contexto de datos del asistente (puntos y necesidades) para
 * `server/handlers/chat.ts`.
 *
 * El chat es la **única** ruta que antes no consultaba Supabase: su
 * `memory` es la semilla, así que en una función de Vercel (aislada por
 * módulo) anunciaba 3 necesidades aunque la BD tuviera las reales, o datos
 * inventados si la BD estaba caída. Este módulo carga el contexto igual que
 * hacen `GET /api/points` y `GET /api/needs`, con una caducidad para no
 * disparar dos SELECT en cada pregunta.
 *
 * Solo **lee**: no toca `maybeVerifySchema` (nada de DDL desde el chat).
 * Si Supabase no responde se conserva la caché actual (la semilla) y se
 * reintenta antes de que venza el TTL: nunca rompe la respuesta.
 */
import { errorMessage, logger } from './logger';
import { memory } from './store';
import { getSupabaseClient, mapNeedRow, mapPointRow, withSupabaseRetry } from './supabase';
import type { HelpNeedRow, HelpPointRow } from './supabase';

/** Caducidad del contexto en memoria (por instancia de función/proceso). */
const CONTEXT_TTL_MS = 30_000;

/** Espera tras un fallo: no hace falta esperar el TTL entero para reintentar. */
const RETRY_MS = 5_000;

/** Instante a partir del cual se vuelve a consultar la BD. */
let nextAttemptAt = 0;

/** Carga en curso (aunque pidan varias a la vez, solo hay una). */
let inFlight: Promise<void> | null = null;

async function loadContext(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return; // sin configuración: la semilla sigue siendo el respaldo

  const [points, needs] = await Promise.all([
    withSupabaseRetry<HelpPointRow[]>('Supabase help_points (chat)', () =>
      client.from('help_points').select('*').order('created_at', { ascending: false }),
    ),
    withSupabaseRetry<HelpNeedRow[]>('Supabase help_needs (chat)', () =>
      client.from('help_needs').select('*').order('created_at', { ascending: false }),
    ),
  ]);

  // Mismo criterio que los GET: solo se sustituye la caché si la BD devolvió
  // filas (una tabla vacía no borra lo que ya está en memoria).
  if (!points.error && Array.isArray(points.data) && points.data.length > 0) {
    memory.points = points.data.map(mapPointRow);
  }
  if (!needs.error && Array.isArray(needs.data) && needs.data.length > 0) {
    memory.needs = needs.data.map(mapNeedRow);
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
