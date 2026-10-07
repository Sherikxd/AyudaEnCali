import type { NextFunction, Request, Response } from 'express';
import type { JsonResponder } from './http.js';
import { clientIp } from './http.js';
import { withRedis } from './redis.js';

export interface RateLimitOptions {
  /** Ventana de tiempo en milisegundos. */
  windowMs: number;
  /** Máximo de peticiones permitidas por ventana e IP. */
  max: number;
  /** Namespace de la cuenta en Redis (`write`, `read`, `chat`). */
  name: string;
  message?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  /**
   * Aplica el límite a la `key` indicada. Escribe siempre las cabeceras
   * `RateLimit-*`; si la ventana se desborda responde `429` en `res` y
   * devuelve `true` (el llamante no debe continuar).
   *
   * Es **asíncrono**: la cuenta vive en Redis (compartida por todas las
   * réplicas y funciones de Vercel) y solo cae al Map local cuando Redis no
   * está disponible.
   */
  enforce(key: string, res: JsonResponder): Promise<boolean>;
  /** Adaptador Express del mismo límite: resuelve la IP del `req` y, si no
   *  se limita, continúa con `next()`. */
  middleware(req: Request, res: Response, next: NextFunction): Promise<void>;
}

/**
 * INCR + PEXPIRE atómicos y la ventana restante en **una sola ida** a Redis.
 * Devuelve `{contador, ttl en ms}`; sin `PEXPIRE` la clave viviría para
 * siempre y la ventana nunca se cerraría.
 */
const WINDOW_SCRIPT = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }`;

interface Tally {
  count: number;
  resetAt: number;
}

/** Clave Redis de la cuenta: `aec:rl:<nombre>:<key>`. */
function accountKey(name: string, key: string): string {
  return `aec:rl:${name}:${key}`;
}

function readTally(raw: unknown, windowMs: number, now: number): Tally | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const [count, ttl] = raw as [unknown, unknown];
  if (typeof count !== 'number') return null;
  // `PTTL` puede devolver -1/-2 si la clave expiró entre comandos: en ese
  // caso la ventana se reinicia en lugar de dar un resetAt en el pasado.
  const remaining = typeof ttl === 'number' && ttl > 0 ? ttl : windowMs;
  return { count, resetAt: now + remaining };
}

/**
 * Limitador de tasa con cuenta **compartida en Redis** y respaldo en memoria.
 *
 * Redis manda cuando responde: todas las réplicas (y las funciones de
 * Vercel, hoy con una cuenta independiente por módulo) ven la misma
 * ventana, así que el límite deja de multiplicarse por el número de
 * instancias. Si Redis no está —sin configuración, en enfriamiento o con un
 * comando caducado— se cuenta en el Map local: el límite sigue existiendo,
 * solo que por proceso, que era exactamente el comportamiento anterior.
 *
 * El núcleo de `enforce` sigue siendo framework-agnóstico (funciona sobre
 * cualquier respuesta con `setHeader`/`status`/`json`: Express y Vercel).
 */
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { windowMs, max, name, message = 'Demasiadas solicitudes. Intenta de nuevo en unos segundos.' } =
    options;
  const buckets = new Map<string, Bucket>();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweeper.unref?.();

  /** Cuenta en memoria: respaldo de Redis caído (una cuenta por proceso). */
  function advanceLocal(key: string, now: number): Tally {
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    return { count: bucket.count, resetAt: bucket.resetAt };
  }

  async function advance(name: string, key: string, now: number): Promise<Tally> {
    const remote = await withRedis((client) =>
      client.eval(WINDOW_SCRIPT, 1, accountKey(name, key), String(windowMs)),
    );
    const tally = readTally(remote, windowMs, now);
    if (tally) {
      // Redis respondió: el Map local deja de contar para esta clave, que ya
      // no es la fuente (evita mezclar dos contadores en una misma ventana).
      buckets.delete(key);
      return tally;
    }
    return advanceLocal(key, now);
  }

  async function enforce(key: string, res: JsonResponder): Promise<boolean> {
    const now = Date.now();
    const tally = await advance(name, key, now);

    const retryAfter = Math.max(1, Math.ceil((tally.resetAt - now) / 1000));

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - tally.count)));
    res.setHeader('RateLimit-Reset', String(retryAfter));

    if (tally.count > max) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: message });
      return true;
    }

    return false;
  }

  return {
    enforce,
    async middleware(req, res, next) {
      if (await enforce(clientIp(req), res)) return;
      next();
    },
  };
}
