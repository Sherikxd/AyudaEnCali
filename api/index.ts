/**
 * Fallback de Vercel para cualquier `/api/*` sin función propia.
 *
 * `vercel.json` reescribe el catch-all a esta función, que responde el mismo
 * 404 JSON que el `apiNotFound` de Express:
 * `{"error":"Ruta no encontrada: <MÉTODO> <ruta sin /api>"}`.
 *
 * Ojo: este módulo ya **no** exporta la app Express (antes era la única
 * función). La app sigue viva en `server/app.ts` para `server.ts`.
 */
import '../server/bootstrap'; // entorno primero: dotenv + initSupabase()
import { notFoundResult, type ApiHandler } from '../server/http';
import { createApiRoute } from '../server/vercel';

const notFoundHandler: ApiHandler = (input) => notFoundResult(input);

export default createApiRoute(notFoundHandler);
