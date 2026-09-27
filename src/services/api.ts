import { ApiErrorResponse } from '../types';
import { logger } from '../utils/logger';

/** Tiempo máximo de espera por defecto antes de abortar una petición. */
const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly status: number;
  readonly details?: string[];

  constructor(message: string, status: number, details?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Cliente HTTP tipado para la API interna (`/api/*`).
 *
 * - Serializa/deserializa JSON automáticamente.
 * - Aplica timeout con `AbortController` para no dejar peticiones colgadas.
 * - Normaliza los errores en una única excepción (`ApiError`).
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
      throw new ApiError(
        payload?.error ?? `Error ${response.status} al consultar ${path}`,
        response.status,
        payload?.details,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(`Tiempo de espera agotado al consultar ${path}`, 408);
    }

    logger.warn(`Fallo de red en ${path}:`, error);
    throw new ApiError('No se pudo conectar con el servidor. Inténtalo de nuevo.', 0);
  } finally {
    clearTimeout(timer);
  }
}
