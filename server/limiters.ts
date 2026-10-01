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

/**
 * Lecturas públicas (GET de puntos, necesidades y comentarios) — T3/FAL-05.
 *
 * Antes solo se limitaban las escrituras, así que el scrapeo de los GET más
 * usados era gratis. Una sola cuenta compartida por las tres rutas (120/min
 * por IP): en Vercel cada función sigue teniendo la suya, igual que el resto
 * de límites en memoria por despliegue.
 */
export const readLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  message: 'Demasiadas consultas seguidas. Espera un minuto antes de volver a cargar el listado.',
});

/** Preguntas al asistente (más restrictivo: cuesta tokens del modelo). */
export const chatLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 15,
  message: 'Has hecho muchas preguntas seguidas. Espera unos segundos antes de continuar.',
});
