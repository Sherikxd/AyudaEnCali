/**
 * Limitadores compartidos por los núcleos de ruta.
 *
 * Una sola instancia por proceso (misma cuenta que la de Express): en Vercel
 * cada función tiene su propio aislamiento, igual que cualquier límite en
 * memoria por despliegue.
 */
import { createRateLimiter } from './rateLimit.js';

/** Escrituras autenticadas (puntos, necesidades, apoyos y comentarios). */
export const writeLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  message: 'Demasiadas escrituras, espera un minuto antes de volver a intentar.',
});

/** Preguntas al asistente (más restrictivo: cuesta tokens del modelo). */
export const chatLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 15,
  message: 'Has hecho muchas preguntas seguidas. Espera unos segundos antes de continuar.',
});
