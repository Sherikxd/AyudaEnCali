/**
 * `POST /api/chat` — asistente CaliSolidaria IA (Gemini con respaldo local).
 *
 * Además del arranque común, **precalienta el contexto** (puntos y
 * necesidades desde Supabase) en el momento de importar el módulo: en Vercel
 * cada función es un módulo aislado con su propia `memory`, y sin esta
 * precarga el asistente respondería con la semilla en el primer deploy.
 */
import '../server/bootstrap.js'; // entorno primero: dotenv + initSupabase()
import { warmContext } from '../server/context.js';
import { createApiRoute } from '../server/vercel.js';
import { chatHandler } from '../server/handlers/chat.js';

warmContext(); // fire-and-forget: nunca rechaza

export default createApiRoute(chatHandler);
