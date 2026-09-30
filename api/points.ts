/** `GET · POST /api/points` — listado y publicación de puntos de ayuda. */
import '../server/bootstrap'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel';
import { pointsHandler } from '../server/handlers/points';

export default createApiRoute(pointsHandler);
