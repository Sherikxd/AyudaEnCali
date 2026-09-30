import type { ApiHandler } from '../http';
import { effectiveMethod, notFoundResult } from '../http';

/**
 * `GET /api/health`: sonda de vida del despliegue (sin límite ni auth).
 * Cualquier otro método responde 404, como Express con `app.get('/api/health')`.
 */
export const healthHandler: ApiHandler = (input) => {
  if (effectiveMethod(input.method) !== 'GET') return notFoundResult(input);
  return {
    status: 200,
    body: { status: 'ok', time: new Date().toISOString() },
  };
};
