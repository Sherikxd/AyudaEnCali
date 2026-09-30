/** `GET · POST /api/comments` — comentarios de un punto de ayuda. */
import '../server/bootstrap'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel';
import { commentsHandler } from '../server/handlers/comments';

export default createApiRoute(commentsHandler);
