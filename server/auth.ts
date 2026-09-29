import type { Request, Response } from 'express';
import { verifyToken } from '@clerk/backend';
import { errorMessage, logger } from './logger';

/**
 * Verificación de sesiones de Clerk en el servidor.
 *
 * Las acciones que exigen "tener usuario" (por ejemplo dar o retirar un
 * apoyo) envían el token de sesión en `Authorization: Bearer <token>`. Aquí
 * se valida **criptográficamente** contra las claves JWKS de Clerk: nunca se
 * confía en un ID que mande el cliente.
 *
 * Requisitos:
 *  - `CLERK_SECRET_KEY` en el entorno del servidor (la clave pública no sirve
 *    para esto).
 *  - El cliente usa `useAuth().getToken()` de `@clerk/clerk-react`.
 *
 * Si falta la clave o el token es inválido devolvemos `null`: la ruta
 * protegida responde 401 y la UI invita a iniciar sesión.
 */

let warnedMissingKey = false;

/**
 * Margen de reloj al comparar `nbf`/`exp` (opción `clockSkewInMs` de Clerk).
 *
 * Si el reloj del servidor va por detrás (común en máquinas de desarrollo
 * sin NTP), Clerk rechaza tokens recién emitidos con "not before date en el
 * futuro" y el usuario ve un 401 pese a tener sesión. Un minuto de margen es
 * conservador: como mucho, un token de sesión de 60 s sigue aceptándose dos
 * minutos. En despliegues con NTP el margen no aporta ni resta nada.
 */
const CLOCK_SKEW_MS = 60_000;

/** Evita inundar el log si llegan seguidos tokens rechazados. */
let lastTokenWarnAt = 0;

function getSecretKey(): string | null {
  const key = process.env.CLERK_SECRET_KEY?.trim();
  if (!key) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      logger.warn(
        'CLERK_SECRET_KEY no está definida: las acciones autenticadas (p. ej. apoyos) responderán 401.',
      );
    }
    return null;
  }
  return key;
}

/** Extrae el token de la cabecera `Authorization: Bearer <token>`. */
function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export interface AuthUser {
  /** ID estable de Clerk (`user_…`). */
  userId: string;
}

/**
 * Valida la sesión de la petición y devuelve el usuario autenticado, o
 * `null` si no hay sesión (sin cabecera, token expirado, instancia ajena…).
 * Los detalles del error solo van a logs: al cliente responde 401 genérico.
 */
export async function getAuthenticatedUser(req: Request): Promise<AuthUser | null> {
  const secretKey = getSecretKey();
  const token = bearerToken(req);
  if (!secretKey || !token) return null;

  try {
    const payload = await verifyToken(token, { secretKey, clockSkewInMs: CLOCK_SKEW_MS });
    const userId = payload?.sub;
    return typeof userId === 'string' && userId ? { userId } : null;
  } catch (error) {
    // El detalle (p. ej. "nbf en el futuro", firma inválida) ayuda a
    // diagnosticar 401 en despliegues, pero no debe inundar el log.
    const detail = errorMessage(error);
    if (Date.now() - lastTokenWarnAt > 60_000) {
      lastTokenWarnAt = Date.now();
      logger.warn('Token de Clerk rechazado:', detail);
    } else {
      logger.debug('Token de Clerk rechazado:', detail);
    }
    return null;
  }
}

/** Responde el 401 estándar de las rutas que exigen sesión. */
export function respondUnauthorized(res: Response, message?: string): void {
  res.status(401).json({
    error: message ?? 'Debes iniciar sesión para realizar esta acción.',
  });
}
