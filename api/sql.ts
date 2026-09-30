/** `GET /api/supabase/sql` — el esquema completo para el SQL Editor. */
import '../server/bootstrap.js'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel.js';
import { sqlHandler } from '../server/handlers/sql.js';

export default createApiRoute(sqlHandler);
