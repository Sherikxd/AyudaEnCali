import type { ApiHandler } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { getSupabaseStatus, maybeVerifySchema } from '../supabase.js';
import type { ConfigResponse } from '../../src/types/index.js';

/**
 * `GET /api/config`: estado del despliegue para el cliente.
 *
 * Verifica el esquema de forma perezosa (máx. una vez cada 30 s) para que
 * `supabaseTablesReady`/`supabaseHint` estén al día sin coste por petición.
 * Cualquier método distinto de GET responde 404 (como Express con `app.get`).
 */
export const configHandler: ApiHandler = async (input) => {
  if (effectiveMethod(input.method) !== 'GET') return notFoundResult(input);

  await maybeVerifySchema();

  const supabaseState = getSupabaseStatus();
  const config: ConfigResponse = {
    status: 'ok',
    appName: 'AyudaEnCali',
    supabaseConnected: supabaseState.configured,
    supabaseUrl: supabaseState.host,
    supabaseTablesReady: supabaseState.tablesReady,
    supabaseHint: supabaseState.hint,
    cartoConfigured: Boolean(process.env.CARTO_API_KEY),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    // Clave pública de Clerk: se lee aquí en **tiempo de ejecución** para que
    // baste con definirla en el entorno del despliegue (Cloud Run, Vercel…),
    // sin recompilar el bundle. Es pública por diseño (viaja al navegador);
    // la secreta (CLERK_SECRET_KEY) jamás sale del servidor.
    clerkPublishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || null,
    time: new Date().toISOString(),
  };
  return { status: 200, body: config };
};
