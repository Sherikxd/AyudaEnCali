import type { IncomingHttpHeaders } from 'node:http';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { errorMessage, logger } from './logger.js';
import type { JsonResponder } from './http.js';

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
export function bearerToken(req: AuthRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export interface AuthUser {
  /** ID estable de Clerk (`user_…`). */
  userId: string;
  /**
   * Nombre visible **si el propio JWT lo trae** (`name`, `username`,
   * `first_name`/`last_name`). No hace falta consultar a Clerk en ese caso.
   * Si no viene, se resuelve con `resolveDisplayName`.
   */
  name?: string;
}

/**
 * Petición con lo mínimo para autenticar: las cabeceras. Cumplen tanto
 * `express.Request` como la `ApiRequest` de los núcleos de ruta.
 */
export interface AuthRequest {
  headers: IncomingHttpHeaders;
}

/**
 * Valida la sesión de la petición y devuelve el usuario autenticado, o
 * `null` si no hay sesión (sin cabecera, token expirado, instancia ajena…).
 * Los detalles del error solo van a logs: al cliente responde 401 genérico.
 */
export async function getAuthenticatedUser(req: AuthRequest): Promise<AuthUser | null> {
  const secretKey = getSecretKey();
  const token = bearerToken(req);
  if (!secretKey || !token) return null;

  try {
    const payload = await verifyToken(token, { secretKey, clockSkewInMs: CLOCK_SKEW_MS });
    const userId = payload?.sub;
    if (typeof userId !== 'string' || !userId) return null;
    const name = nameFromClaims(payload);
    return name ? { userId, name } : { userId };
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

/* -------------------------------------------------------------------------- */
/* Nombre mostrado en comentarios (T1 · FAL-03)                                */
/* -------------------------------------------------------------------------- */

/** Nombre con el que se firma un comentario cuando el JWT no trae nombre. */
const FALLBACK_NAME = 'Ciudadano Solidario';
/** Vigencia de un nombre resuelto desde el perfil de Clerk. */
const NAME_CACHE_TTL_MS = 5 * 60_000;
/** Vigencia de un fallo: no se vuelve a consultar Clerk en ese minuto. */
const NAME_MISS_TTL_MS = 60_000;
/** Tope de la consulta de perfil: un comentario nunca espera a Clerk. */
const NAME_FETCH_TIMEOUT_MS = 2_500;

const nameCache = new Map<string, { name: string | null; at: number }>();
let clerkClient: ReturnType<typeof createClerkClient> | null = null;

function cleanName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean.length > 0 ? clean : undefined;
}

/** Nombre que trae el propio token de sesión, si lo trae. */
function nameFromClaims(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const claims = payload as {
    name?: unknown;
    username?: unknown;
    first_name?: unknown;
    last_name?: unknown;
  };
  const direct = cleanName(claims.name) ?? cleanName(claims.username);
  if (direct) return direct;
  const first = cleanName(claims.first_name);
  const last = cleanName(claims.last_name);
  if (first && last) return `${first} ${last}`;
  return first ?? last;
}

/** Envuelve una promesa con tope de duración (sin dejar timers colgados). */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: superó ${ms} ms`)), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Consulta el perfil de Clerk. `null` si no hay clave o la consulta falla. */
async function fetchClerkName(userId: string, secretKey: string): Promise<string | null> {
  try {
    clerkClient ??= createClerkClient({ secretKey });
    const profile = await withTimeout(
      clerkClient.users.getUser(userId),
      NAME_FETCH_TIMEOUT_MS,
      'Clerk getUser',
    );
    const first = cleanName(profile.firstName);
    const last = cleanName(profile.lastName);
    const joined = first && last ? `${first} ${last}` : (first ?? last);
    return joined ?? cleanName(profile.username) ?? null;
  } catch (error) {
    logger.debug('No se pudo consultar el perfil de Clerk para el nombre mostrado:', errorMessage(error));
    return null;
  }
}

/**
 * Nombre con el que se firma un comentario: **nunca** sale del cuerpo de la
 * petición (decisión 2026-09-28).
 *
 * Cadena de decisión:
 *
 *  1. Claims del JWT verificado (`name`, `username`, `first_name`…).
 *  2. Perfil de Clerk (`users.getUser`) con tope de 2,5 s y **caché** por
 *     usuario: 5 minutos si resolvió, 1 minuto si falló.
 *  3. `Ciudadano Solidario`: el comentario se publica aunque Clerk no responda.
 */
export async function resolveDisplayName(user: AuthUser): Promise<string> {
  if (user.name) return user.name;

  const cached = nameCache.get(user.userId);
  if (cached && Date.now() - cached.at < (cached.name ? NAME_CACHE_TTL_MS : NAME_MISS_TTL_MS)) {
    return cached.name ?? FALLBACK_NAME;
  }

  const secretKey = getSecretKey();
  const name = secretKey ? await fetchClerkName(user.userId, secretKey) : null;
  nameCache.set(user.userId, { name, at: Date.now() });
  return name ?? FALLBACK_NAME;
}

/** Responde el 401 estándar de las rutas que exigen sesión. */
export function respondUnauthorized(res: JsonResponder, message?: string): void {
  res.status(401).json({
    error: message ?? 'Debes iniciar sesión para realizar esta acción.',
  });
}
