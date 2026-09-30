import type { NextFunction, Request, Response } from 'express';
import type { JsonResponder } from './http';
import { clientIp } from './http';

export interface RateLimitOptions {
  /** Ventana de tiempo en milisegundos. */
  windowMs: number;
  /** Máximo de peticiones permitidas por ventana e IP. */
  max: number;
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
   */
  enforce(key: string, res: JsonResponder): boolean;
  /** Adaptador Express del mismo límite: resuelve la IP del `req` y, si no
   *  se limita, continúa con `next()`. */
  middleware(req: Request, res: Response, next: NextFunction): void;
}

/**
 * Limitador de tasa en memoria.
 *
 * Es deliberadamente simple y sin dependencias: protege la API y al modelo de
 * lenguaje de abusos puntuales. Para despliegues con varias réplicas conviene
 * sustituirlo por un almacén compartido (Redis) manteniendo esta misma firma.
 *
 * El núcleo de `enforce` es framework-agnóstico (funciona sobre cualquier
 * respuesta con `setHeader`/`status`/`json`: Express y Vercel); `middleware`
 * es solo el envoltorio para rutas Express.
 */
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { windowMs, max, message = 'Demasiadas solicitudes. Intenta de nuevo en unos segundos.' } = options;
  const buckets = new Map<string, Bucket>();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweeper.unref?.();

  function enforce(key: string, res: JsonResponder): boolean {
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(retryAfter));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: message });
      return true;
    }

    return false;
  }

  return {
    enforce,
    middleware(req, res, next) {
      if (!enforce(clientIp(req), res)) next();
    },
  };
}
