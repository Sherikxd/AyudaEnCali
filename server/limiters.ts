/**
 * Limitadores compartidos por los núcleos de ruta.
 *
 * La cuenta vive en Redis (`server/rateLimit.ts`): una sola ventana por IP y
 * por tipo de operación para **todo** el despliegue. En Vercel eso además
 * corrige la fragmentación por función (antes cada módulo contaba por su
 * lado y el límite efectivo se multiplicaba por el número de funciones).
 * Si Redis no está, cada proceso cuenta en memoria con los mismos `max`.
 */
import { createRateLimiter } from './rateLimit.js';

/** Escrituras autenticadas (puntos, necesidades, apoyos y comentarios). */
export const writeLimiter = createRateLimiter({
  name: 'write',
  windowMs: 60_000,
  max: 60,
  message: 'Demasiadas escrituras, espera un minuto antes de volver a intentar.',
});

/**
 * Lecturas públicas (GET de puntos, necesidades y comentarios) — T3/FAL-05.
 *
 * Antes solo se limitaban las escrituras, así que el scrapeo de los GET más
 * usados era gratis. Una sola cuenta compartida por las tres rutas (120/min
 * por IP), ahora también compartida entre funciones en Vercel.
 */
export const readLimiter = createRateLimiter({
  name: 'read',
  windowMs: 60_000,
  max: 120,
  message: 'Demasiadas consultas seguidas. Espera un minuto antes de volver a cargar el listado.',
});

/** Preguntas al asistente (más restrictivo: cuesta tokens del modelo). */
export const chatLimiter = createRateLimiter({
  name: 'chat',
  windowMs: 60_000,
  max: 15,
  message: 'Has hecho muchas preguntas seguidas. Espera unos segundos antes de continuar.',
});
