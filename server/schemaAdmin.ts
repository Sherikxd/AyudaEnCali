/**
 * Aplicación del esquema vía la **Supabase Management API**.
 *
 * Permite que el servidor cree `help_points` / `help_needs` (con sus índices y
 * políticas RLS) sin que nadie tenga que pegar SQL a mano. Requiere un token
 * de gestión en `SUPABASE_ACCESS_TOKEN`; si no existe, este módulo no hace
 * nada y se sigue el camino manual (SQL Editor).
 *
 * Seguridad:
 *  - El token jamás se registra en logs ni se expone en `/api/config`.
 *  - Solo se ejecuta cuando el sondeo detectó que **faltan** las tablas.
 *  - `supabase/schema.sql` es idempotente, así que repetirlo es seguro.
 */
import { errorMessage } from './logger';
import { SUPABASE_SQL } from './schema';

const MANAGEMENT_API = 'https://api.supabase.com/v1';
const REQUEST_TIMEOUT_MS = 30_000;

export interface ApplyResult {
  ok: boolean;
  /** Detalle legible para logs y para la pista que ve el usuario. */
  message: string;
}

/** `mdkyrtrzsptkjwuqrwgf.supabase.co` → `mdkyrtrzsptkjwuqrwgf`. */
export function projectRefFromHost(host: string | null): string | null {
  if (!host) return null;
  const ref = host.split('.')[0];
  return ref && ref !== 'supabase' ? ref : null;
}

/**
 * Ejecuta `supabase/schema.sql` contra el proyecto indicado.
 * Devuelve `null` si no hay configuración suficiente (token o proyecto).
 */
export async function applySupabaseSchema(
  ref: string | null,
  token: string | null | undefined,
): Promise<ApplyResult | null> {
  if (!ref || !token) return null;

  try {
    const response = await fetch(`${MANAGEMENT_API}/projects/${ref}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: SUPABASE_SQL }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) {
      return { ok: true, message: `esquema aplicado con la Management API (HTTP ${response.status})` };
    }

    // El cuerpo de error no lleva credenciales: sirve para diagnosticar.
    const detail = (await response.text()).slice(0, 300);
    return { ok: false, message: `Management API devolvió ${response.status}: ${detail}` };
  } catch (error) {
    return { ok: false, message: `no se pudo contactar la Management API: ${errorMessage(error)}` };
  }
}
