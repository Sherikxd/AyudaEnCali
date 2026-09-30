/** `GET /api/support/mine` — apoyos de la cuenta que hace la petición. */
import '../server/bootstrap'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel';
import { supportMineHandler } from '../server/handlers/supportMine';

export default createApiRoute(supportMineHandler);
