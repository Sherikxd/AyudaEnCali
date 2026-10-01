import type { HelpNeed } from '../src/types/index.js';

/**
 * Identidad de autoría y `verified` viven en el servidor (T1/FAL-01).
 *
 * El cliente no debe rellenarlos ni leerlos con fiabilidad: `authorId` es un
 * **dato interno** derivado del JWT de Clerk verificado (nunca del cuerpo de
 * la petición) y, hasta que el frontend (T9) deje de leerlos de otra forma,
 * se mantienen fuera de `HelpNeed` para que el tipo del cliente no dé por
 * sentado que puede escribirlos.
 *
 * `authorId` es opcional porque los registros heredados (anteriores al
 * backfill de `supabase/schema.sql`) pueden no tener autor conocido: nadie
 * podrá editarlos salvo un moderador (T7).
 */
export interface HelpNeedWithAuthor extends HelpNeed {
  /** Clerk `user_id` (`user_...`) del autor o `null` en datos heredados. */
  authorId?: string;
}

/** `true` si `authorId` identifica a un usuario de Clerk. */
export function isClerkUserId(authorId: string | undefined | null): authorId is string {
  return typeof authorId === 'string' && authorId.startsWith('user_');
}
