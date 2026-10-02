import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { errorMessage, logger } from './logger.js';
import { setApiRobotsHeaders, setSecurityHeaders } from './http.js';

/** Cabeceras básicas de seguridad aplicadas a toda la API. */
export const securityHeaders: RequestHandler = (_req: Request, res: Response, next) => {
  setSecurityHeaders(res);
  next();
};

/**
 * `X-Robots-Tag: noindex` en las respuestas de `/api` (T39 · SEO-15).
 *
 * Se monta en `/api` (NO en el `securityHeaders` global de arriba): la cabecera
 * anti-indexación no debe salir nunca en el HTML de la SPA, que sí tiene que
 * aparecer en los buscadores.
 */
export const apiRobotsHeaders: RequestHandler = (_req: Request, res: Response, next) => {
  setApiRobotsHeaders(res);
  next();
};

/** 404 consistente para rutas de API inexistentes (montado en `/api`). */
export const apiNotFound: RequestHandler = (req: Request, res: Response) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
};

/**
 * Middleware central de errores: nunca filtra stack traces al cliente y
 * responde 400 ante cuerpos JSON malformados.
 *
 * Cualquier otro fallo (incluido el `entity.too.large` de superar el límite
 * de 1 MB, que Express no trata de forma específica) responde 500: mismo
 * comportamiento que el adaptador de Vercel.
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
