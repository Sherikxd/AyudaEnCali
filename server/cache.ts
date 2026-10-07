/**
 * Caché de lecturas en Redis.
 *
 * Es una **capa de latencia**, nunca una fuente de verdad: solo almacena
 * snapshots que salieron de un `SELECT` a Supabase y la invalidación es
 * inmediata en cualquier escritura. Por eso puede convivir sin tensión con la
 * decisión *«el contador de apoyos sale de la BD, nunca de la caché»*
 * (`docs/agentes/decisiones.md`, 2026-09-28): aquí **no se calcula, no se
 * fusiona y no se reescribe** ningún `supporters_count`; el valor guardado es
 * literalmente lo que devolvió la BD y se borra en el mismo request que lo
 * cambia (`server/handlers/needsSupport.ts`).
 *
 * Comportamiento:
 *
 *  - **Sin `REDIS_URL` o con Redis caído**: `getOrSet` ejecuta el cargador y
 *    `invalidate` no hace nada. Cero impacto, cero errores.
 *  - **Invalidación por prefijo**: `invalidate('dir')` hace `SCAN`+`UNLINK`
 *    sobre `aec:dir:*`. Es la operación de la escritura (rara); las lecturas
 *    se quedan en un único `GET` (rápido), sin scripts ni dobles idas.
 *  - **Claves**: `aec:<espacio>:<clave>` con TTL siempre presente, así que
 *    aunque una invalidación no llegue, ninguna respuesta vive para siempre.
 */
import { errorMessage, logger } from './logger.js';
import { withRedis } from './redis.js';

/** Prefijo global de todas las claves de la app. */
const KEY_PREFIX = 'aec:';

/** Iteraciones máximas de `SCAN` por invalidación (red de seguridad). */
const SCAN_LIMIT = 50;
const SCAN_COUNT = 100;

/**
 * Contadores de la caché, expuestos en `GET /api/health` para poder medir el
 * alivio real sobre Supabase (aciertos, fallos y claves borradas).
 *
 * Son **por instancia**: en Express es un único proceso, pero en Vercel cada
 * función cuenta lo suyo y el agregado solo se ve en los logs. No guardan
 * nada sensible (solo números), por eso pueden salir en una ruta pública.
 */
export interface CacheStats {
  /** `GET` que respondieron desde Redis. */
  hits: number;
  /** `GET` sin valor (incluye Redis caído o desactivado). */
  misses: number;
  /** Escrituras confirmadas en Redis. */
  sets: number;
  /** Invalidaciones ejecutadas (cualquier espacio). */
  invalidations: number;
  /** Claves borradas por invalidación. */
  keysDeleted: number;
  /** `hits / (hits + misses)` con dos decimales; `0` si aún no hubo tráfico. */
  hitRate: number;
}

const counters = { hits: 0, misses: 0, sets: 0, invalidations: 0, keysDeleted: 0 };

/** Fotografía de los contadores (copia, no referencia: seguro de serializar). */
export function cacheStats(): CacheStats {
  const total = counters.hits + counters.misses;
  const hitRate = total === 0 ? 0 : Math.round((counters.hits / total) * 100) / 100;
  return { ...counters, hitRate };
}


/** Resultado de {@link getOrSet}: `hit` dice si venía de Redis. */
export interface CacheResult<T> {
  /** `null` si el cargador no produjo valor (BD caída, tabla vacía…). */
  value: T | null;
  hit: boolean;
}

function serialize(value: unknown): string | null {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? null : json;
  } catch (error) {
    logger.debug('Caché: valor no serializable.', errorMessage(error));
    return null;
  }
}

function deserialize<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    // JSON corrupto: se descarta y se vuelve a leer de la BD en el siguiente
    // intento, en lugar de propagar una excepción de parseo.
    logger.debug('Caché: contenido corrupto descartado.', errorMessage(error));
    return null;
  }
}

/** Lee una clave. `null` si no existe, si está caducada o si Redis falla. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await withRedis((client) => client.get(KEY_PREFIX + key));
  if (raw === null) {
    counters.misses += 1;
    return null;
  }
  const value = deserialize<T>(raw);
  if (value === null) counters.misses += 1;
  else counters.hits += 1;
  return value;
}

/** Escribe una clave con TTL. Devuelve `false` si no se pudo guardar. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  const payload = serialize(value);
  if (payload === null) return false;
  const done = await withRedis((client) => client.set(KEY_PREFIX + key, payload, 'EX', ttlSeconds));
  if (done === 'OK') {
    counters.sets += 1;
    return true;
  }
  return false;
}

/**
 * Devuelve el valor cacheado o, si no está, ejecuta `load` y guarda el
 * resultado. Solo se cachean valores no nulos: un cargador que devuelve
 * `null` (BD caída, tabla vacía…) deja el fallo en manos del llamador, que
 * es quien decide con qué respaldar.
 */
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T | null>,
): Promise<CacheResult<T>> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return { value: cached, hit: true };

  const value = await load();
  if (value !== null) await cacheSet(key, value, ttlSeconds);
  return { value, hit: false };
}

/**
 * Borra todas las claves de los espacios indicados (`invalidate('dir')` →
 * `aec:dir:*`). Fire-and-forget seguro: nunca lanza.
 */
export async function invalidate(...spaces: string[]): Promise<void> {
  if (spaces.length === 0) return;
  await withRedis(async (client) => {
    counters.invalidations += 1;
    for (const space of spaces) {
      const pattern = `${KEY_PREFIX}${space}:*`;
      let cursor = '0';
      let iterations = 0;
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT);
        cursor = next;
        if (keys.length > 0) {
          await client.unlink(...keys);
          counters.keysDeleted += keys.length;
        }
        iterations += 1;
      } while (cursor !== '0' && iterations < SCAN_LIMIT);
    }
  });
}

/** `true` si Redis responde a un `PING` (usado por `/api/health`). */
export async function redisPing(): Promise<boolean> {
  const pong = await withRedis((client) => client.ping());
  return pong === 'PONG';
}
