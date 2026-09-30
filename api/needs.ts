/** `GET · POST /api/needs` — tablón de necesidades. */
import '../server/bootstrap.js'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel.js';
import { needsHandler } from '../server/handlers/needs.js';

export default createApiRoute(needsHandler);
