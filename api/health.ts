/** `GET /api/health` — sonda de vida del despliegue. */
import '../server/bootstrap.js'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel.js';
import { healthHandler } from '../server/handlers/health.js';

export default createApiRoute(healthHandler);
