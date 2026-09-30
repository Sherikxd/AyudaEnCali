/** `GET · POST /api/needs` — tablón de necesidades. */
import '../server/bootstrap'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel';
import { needsHandler } from '../server/handlers/needs';

export default createApiRoute(needsHandler);
