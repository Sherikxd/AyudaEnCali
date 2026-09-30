/**
 * Adaptador de Vercel para las funciones de `api/*.ts`.
 *
 * Reproduce el pipeline de Express en el mismo orden que la app montada en
 * `/api`:
 *
 *   cabeceras de seguridad → parseo del cuerpo (máx 1 MB) → núcleo de ruta
 *   (que aplica su límite de tasa y su auth) → respuesta.
 *
 * Cada fichero de `api/` hace `export default createApiRoute(núcleo)`. El
 * núcleo decide status y cuerpo; si devuelve `null` ya respondió él mismo y
 * aquí no se toca la respuesta.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  clientIp,
  readJsonBody,
  setSecurityHeaders,
  type ApiHandler,
  type ApiRequest,
} from './http.js';
import { errorMessage, logger } from './logger.js';

/** Petición de Vercel: `IncomingMessage` con el cuerpo pre-parseado. */
export interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

/** Respuesta de Vercel: `ServerResponse` + helpers `status`/`json`. */
export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(body: unknown): unknown;
}

/**
 * Quita el prefijo `/api` para que `path` coincida con el que ve Express en
 * sus handlers montados (`/points`, `/needs/1/support`, `/` para `/api`).
 */
function stripApiPrefix(pathname: string): string {
  if (pathname === '/api') return '/';
  if (pathname.startsWith('/api/')) return pathname.slice(4);
  return pathname;
}

/** El `_orig` del rewrite solo es fiable si el rewrite lo expandió. */
function originalPath(query: Record<string, unknown>): string | null {
  const raw = query._orig;
  // `''` = el catch-all reescribió `/api` exacto: la ruta canónica es `/`.
  if (raw === '') return '/';
  if (typeof raw !== 'string' || /[:*]/.test(raw)) return null;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * Construye la entrada normalizada del núcleo.
 *
 * El `path` sale del `_orig` que añade cada rewrite de `vercel.json` (la
 * ruta canónica original); si no llega (rewrite no aplicado o petición al
 * espejo `/api/<función>`), se deriva de la URL de la petición. Así el
 * mensaje `Ruta no encontrada: …` es idéntico al de Express.
 */
function toApiRequest(req: VercelRequest, body: unknown): ApiRequest {
  const parsed = new URL(req.url ?? '/', 'http://vercel.local');

  const query: Record<string, unknown> = {};
  for (const [key, value] of parsed.searchParams) {
    const existing = query[key];
    if (existing === undefined) query[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else query[key] = [String(existing), value];
  }

  // Llegó `_orig` → la petición pasa por un rewrite de `vercel.json`, no es
  // el espejo filesystem (`/api/<fichero>`) que en Express responde 404.
  const rewritten = '_orig' in query;
  const canonical = originalPath(query);
  delete query._orig;

  return {
    method: req.method ?? 'GET',
    path: canonical ?? stripApiPrefix(parsed.pathname),
    headers: req.headers,
    query,
    rewritten,
    body,
    clientIp: clientIp(req),
  };
}

/**
 * Envuelve un núcleo de ruta como manejador de función de Vercel.
 *
 * Todo el pipeline va dentro del `try/catch` (incluida la lectura del cuerpo:
 * en Vercel `request.body` **lanza** ante JSON malformado, y eso se traduce a
 * `400` dentro de `readJsonBody`). Lo que escape de ahí responde 500 genérico
 * (el `errorHandler` de Express), dejando el detalle solo en el log.
 */
export function createApiRoute(core: ApiHandler) {
  return async function route(req: VercelRequest, res: VercelResponse): Promise<void> {
    setSecurityHeaders(res);

    try {
      const body = await readJsonBody(req, res);
      if (!body.ok) return; // 400/500 ya escritos (paridad con body-parser)

      const result = await core(toApiRequest(req, body.value), res);
      if (result && !res.headersSent) res.status(result.status).json(result.body);
    } catch (error) {
      logger.error('Error no controlado en la API:', errorMessage(error));
      if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor.' });
    }
  };
}
