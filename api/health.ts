/** `GET /api/health` — sonda de vida del despliegue. */
import '../server/bootstrap'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel';
import { healthHandler } from '../server/handlers/health';

export default createApiRoute(healthHandler);
