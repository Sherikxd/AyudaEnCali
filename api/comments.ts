/** `GET · POST /api/comments` — comentarios de un punto de ayuda. */
import '../server/bootstrap.js'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel.js';
import { commentsHandler } from '../server/handlers/comments.js';

export default createApiRoute(commentsHandler);
