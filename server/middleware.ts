import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { errorMessage, logger } from './logger';

/** Cabeceras básicas de seguridad aplicadas a toda la API. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
};

/** 404 consistente para rutas de API inexistentes. */
export const apiNotFound: RequestHandler = (req: Request, res: Response) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
};

/**
 * Middleware central de errores: nunca filtra stack traces al cliente y
 * responde 400 ante cuerpos JSON malformados.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const type = typeof error === 'object' && error !== null && 'type' in error
    ? (error as { type?: string }).type
    : undefined;

  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON inválido en el cuerpo de la petición.' });
    return;
  }

  logger.error('Error no controlado en la API:', errorMessage(error));
  res.status(500).json({ error: 'Error interno del servidor.' });
};

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Envuelve rutas asíncronas para que sus rechazos lleguen al middleware de
 * errores (Express 4 no captura promesas rechazadas automáticamente).
 */
export const asyncHandler =
  (handler: AsyncRoute): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
