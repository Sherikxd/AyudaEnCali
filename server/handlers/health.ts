import type { ApiHandler } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { cacheStats, redisPing } from '../cache.js';
import { redisStatus } from '../redis.js';

/**
 * `GET /api/health`: sonda de vida del despliegue (sin límite ni auth).
 *
 * Además de la marca de vida expone el estado de Redis (`up`/`down`/
 * `disabled`) para que el despliegue pueda comprobar de un vistazo si la
 * caché y el límite de tasa compartidos están operativos: `down` no es un
 * error de la API — la ruta sigue en `200`, porque con Redis caído todo el
 * mundo sigue respondiendo con sus respaldos en memoria.
 *
 * `cache` añade los contadores de la caché (aciertos, fallos, escrituras y
 * claves borradas) para medir el alivio real sobre Supabase. Son por
 * instancia: en Vercel cada función suma la suya.
 *
 * Cualquier otro método responde 404, como Express con `app.get('/api/health')`.
 */
export const healthHandler: ApiHandler = async (input) => {
  if (effectiveMethod(input.method) !== 'GET') return notFoundResult(input);

  const status = redisStatus();
  const redis = status === 'disabled' ? 'disabled' : await redisPing() ? 'up' : 'down';

  return {
    status: 200,
    body: { status: 'ok', time: new Date().toISOString(), redis, cache: cacheStats() },
  };
};
