/** `GET /api/config` — estado del despliegue para el cliente. */
import '../server/bootstrap'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel';
import { configHandler } from '../server/handlers/config';

export default createApiRoute(configHandler);
