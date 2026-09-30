/** `GET /api/config` — estado del despliegue para el cliente. */
import '../server/bootstrap.js'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel.js';
import { configHandler } from '../server/handlers/config.js';

export default createApiRoute(configHandler);
