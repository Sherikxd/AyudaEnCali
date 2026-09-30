/**
 * `POST /api/needs/:id/support` — apoyar o retirar el apoyo de una
 * necesidad. En Vercel la ruta canónica se reescribe a esta función
 * (`vercel.json`) y el id llega en el query `?id=…` (con la ruta original
 * como respaldo).
 */
import '../server/bootstrap'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel';
import { needsSupportHandler } from '../server/handlers/needsSupport';

export default createApiRoute(needsSupportHandler);
