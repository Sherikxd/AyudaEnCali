import type { NextFunction, Request, Response } from 'express';

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

/**
 * Limitador de tasa en memoria.
 *
 * Es deliberadamente simple y sin dependencias: protege la API y al modelo de
 * lenguaje de abusos puntuales. Para despliegues con varias réplicas conviene
 * sustituirlo por un almacén compartido (Redis) manteniendo esta misma firma.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = 'Demasiadas solicitudes. Intenta de nuevo en unos segundos.' } = options;
  const buckets = new Map<string, Bucket>();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweeper.unref?.();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';

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
      return;
    }

    next();
  };
}
