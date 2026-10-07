/**
 * Cliente Redis compartido: caché de lecturas y límite de tasa global.
 *
 * Diseño pensado para los dos despliegues que comparten este código:
 *
 *  - **Express / Docker / Cloud Run** (`server.ts`): una conexión por
 *    proceso, reutilizada en todas las peticiones.
 *  - **Vercel** (`api/*.ts`): una función por ruta, cada una con su propio
 *    aislamiento y su propio cliente. Redis es aquí lo que *une* las cuentas
 *    de límite de tasa (hoy 4 copias independientes) y la caché de lectura.
 *
 * Reglas, en orden de importancia:
 *
 *  1. **Jamás lanza.** Sin `REDIS_URL`, con la BD de Redis caída o con un
 *     comando caducado, la API sigue respondiendo con sus respaldos de
 *     memoria. Un cacheo nunca puede ser el origen de un `500`.
 *  2. **Latencia acotada.** `connectTimeout` y `commandTimeout` cortos,
 *     `enableOfflineQueue: false` (si no estamos `ready`, el comando falla en
 *     vez de encolarse) y un *circuit breaker* que deja de intentar durante
 *     `COOLDOWN_MS` tras varios fallos seguidos.
 *  3. **Sin reintentos de escritura.** `autoResendUnfulfilledCommands: false`
 *     y `maxRetriesPerRequest: 1`: en rate limit y en invalidación, un
 *     fallo se traduce en respaldo local, nunca en una petición colgada.
 *
 * El único punto de acceso es {@link withRedis}: recibe el cliente y devuelve
 * `null` si Redis no está disponible o si la operación falla.
 */
import { Redis } from 'ioredis';
import { errorMessage, logger } from './logger.js';

/** Estados que expone `/api/health`. */
export type RedisStatus = 'disabled' | 'connecting' | 'ready' | 'reconnecting' | 'error';

const CONNECT_TIMEOUT_MS = 2_000;
const COMMAND_TIMEOUT_MS = 1_500;
/** Fallos seguidos antes de dejar de intentar durante un rato. */
const MAX_CONSECUTIVE_FAILURES = 3;
const COOLDOWN_MS = 30_000;

let client: Redis | null = null;
let configured = false;
let consecutiveFailures = 0;
let cooldownUntil = 0;
let loggedConfig = false;

function redisUrl(): string {
  return (process.env.REDIS_URL ?? '').trim();
}

/**
 * Crea (una sola vez) el cliente. Se llama desde `server/bootstrap.ts`,
 * después de `initSupabase()`. Nunca lanza: sin `REDIS_URL` no hay cliente.
 *
 * La conexión arranca en segundo plano; el primer comando espera a que esté
 * `ready` como mucho `connectTimeout`, y si no, `withRedis` devuelve `null`.
 */
export function initRedis(): void {
  if (configured) return;
  configured = true;

  const url = redisUrl();
  if (!url) {
    if (!loggedConfig) {
      loggedConfig = true;
      logger.info('Redis: deshabilitado (falta REDIS_URL); la API usa sus respaldos en memoria.');
    }
    return;
  }

  client = new Redis(url, {
    // Lazy + offline queue apagada: un comando sin conexión falla enseguida
    // en lugar de encolarse y añadir latencia a la petición.
    lazyConnect: false,
    enableOfflineQueue: false,
    connectTimeout: CONNECT_TIMEOUT_MS,
    commandTimeout: COMMAND_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    autoResendUnfulfilledCommands: false,
    retryStrategy: (times: number) => Math.min(times * 500, 5_000),
  });

  client.on('ready', () => {
    consecutiveFailures = 0;
    cooldownUntil = 0;
    logger.info('Redis: conectado.');
  });
  client.on('error', (error: Error) => {
    // Un `error` sin listener de ioredis rompe el proceso: aquí se traga y
    // se traduce en "sin Redis", que es exactamente el contrato de este módulo.
    consecutiveFailures += 1;
    if (consecutiveFailures === 1) logger.warn(`Redis: ${errorMessage(error)}`);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) enterCooldown();
  });
  client.on('close', () => logger.debug('Redis: conexión cerrada.'));
}

function enterCooldown(): void {
  cooldownUntil = Date.now() + COOLDOWN_MS;
  logger.warn(
    `Redis: inactivo durante ${Math.round(COOLDOWN_MS / 1000)} s; la API sigue con respaldos en memoria.`,
  );
}

/** `true` si vale la pena intentar una operación ahora mismo. */
function usable(): boolean {
  if (!client) return false;
  if (Date.now() < cooldownUntil) return false;
  return client.status === 'ready';
}

/**
 * Ejecuta `fn` sobre el cliente y devuelve su resultado, o `null` si Redis
 * no está disponible o la operación falla (cualquier error se registra en
 * `debug` y se convierte en `null`).
 */
export async function withRedis<T>(fn: (client: Redis) => Promise<T>): Promise<T | null> {
  if (!usable() || !client) return null;
  try {
    const result = await fn(client);
    consecutiveFailures = 0;
    return result;
  } catch (error) {
    consecutiveFailures += 1;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) enterCooldown();
    logger.debug(`Redis: operación fallida (${consecutiveFailures}).`, errorMessage(error));
    return null;
  }
}

/** Estado para `/api/health`: `disabled` si no hay configuración. */
export function redisStatus(): RedisStatus {
  if (!configured) return 'disabled';
  if (!client) return redisUrl() ? 'error' : 'disabled';
  if (Date.now() < cooldownUntil) return 'error';
  switch (client.status) {
    case 'ready':
      return 'ready';
    case 'connecting':
      return 'connecting';
    case 'reconnecting':
      return 'reconnecting';
    default:
      return 'error';
  }
}

/**
 * Cierra la conexión (apagado ordenado del servidor de desarrollo y tests).
 * Tras llamarlo, `initRedis()` vuelve a poder crear un cliente.
 */
export async function closeRedis(): Promise<void> {
  const current = client;
  client = null;
  configured = false;
  if (!current) return;
  try {
    await current.quit();
  } catch {
    current.disconnect();
  }
}
