/**
 * `GET · POST /api/comments` — comentarios de un punto de ayuda.
 *
 * T28: esta misma función atiende también `GET · POST /api/reports` (la
 * cola de moderación), que llega aquí por el rewrite `/api/reports` de
 * `vercel.json` con `?_orig=reports`. Así se suma una ruta **sin** crear
 * una función más (límite de 12 del plan Hobby): el despacho se decide por
 * el `path` canónico que arma `server/vercel.ts` a partir del `_orig`.
 */
import '../server/bootstrap.js'; // entorno primero: dotenv + initSupabase()
import { createApiRoute } from '../server/vercel.js';
import { commentsHandler } from '../server/handlers/comments.js';
import { reportsHandler } from '../server/handlers/reports.js';
import type { ApiHandler } from '../server/http.js';

const dispatch: ApiHandler = (input, res) =>
  input.path === '/reports' ? reportsHandler(input, res) : commentsHandler(input, res);

export default createApiRoute(dispatch);
