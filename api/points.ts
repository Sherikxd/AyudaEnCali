/** `GET · POST /api/points` — listado y publicación de puntos de ayuda. */
import '../server/bootstrap.js'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel.js';
import { pointsHandler } from '../server/handlers/points.js';

export default createApiRoute(pointsHandler);
