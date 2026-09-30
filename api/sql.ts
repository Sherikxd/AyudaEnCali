/** `GET /api/supabase/sql` — el esquema completo para el SQL Editor. */
import '../server/bootstrap'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel';
import { sqlHandler } from '../server/handlers/sql';

export default createApiRoute(sqlHandler);
