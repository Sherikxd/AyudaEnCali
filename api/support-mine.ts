/** `GET /api/support/mine` — apoyos de la cuenta que hace la petición. */
import '../server/bootstrap.js'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel.js';
import { supportMineHandler } from '../server/handlers/supportMine.js';

export default createApiRoute(supportMineHandler);
