/**
 * Primitivas HTTP framework-agnósticas compartidas por los dos adaptadores:
 *
 *  - `server/app.ts` → Express (local, Docker, Cloud Run).
 *  - `server/vercel.ts` → una función por ruta en Vercel (`api/*.ts`).
 *
 * Los núcleos de ruta (`server/handlers/*.ts`) solo conocen estos tipos: ni
 * `Request` de Express ni `VercelRequest`. Las respuestas pasan por
 * `JsonResponder`, que cumplen `express.Response` (tiene `setHeader`,
 * `status` y `json`) y la `VercelResponse` de `@vercel/node` (añade esos
 * mismos helpers a `ServerResponse`).
 */
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { errorMessage, logger } from './logger.js';

/** Respuesta JSON mínima que comparten Express y Vercel. */
export interface JsonResponder {
  setHeader(name: string, value: number | string | readonly string[]): unknown;
  status(code: number): JsonResponder;
  json(body: unknown): unknown;
}

/** Petición normalizada que reciben los núcleos de ruta. */
export interface ApiRequest {
  /** Método HTTP original: `HEAD` llega tal cual (se gestiona como `GET`). */
  method: string;
  /**
   * Ruta **sin** el prefijo `/api`, igual que la ve Express en los handlers
   * montados bajo `/api` (p. ej. `/points`, `/needs/1/support`). Es también
   * el path que aparece en los mensajes `Ruta no encontrada: …`.
   */
  path: string;
  /** Cabeceras de la petición (claves en minúscula, como en Node). */
  headers: IncomingHttpHeaders;
  /** Query string ya parseado, con la misma forma que `req.query` de Express. */
  query: Record<string, unknown>;
  /**
   * `true` cuando la petición llegó **por un rewrite de `vercel.json`**: el
   * adapter de Vercel lo detecta por el parámetro `_orig` que añade el
   * rewrite a la URL de destino. Express lo deja sin definir (`undefined`),
   * porque sus rutas canónicas ya llevan el id en la ruta.
   *
   * Úsalo para distinguir la ruta canónica reescrita del **espejo
   * filesystem** (`/api/<nombre-de-fichero>`), que en Express responde 404.
   */
  rewritten?: boolean;
  /**
   * Cuerpo ya parseado. Como `express.json()`: `{}` cuando no había cuerpo
   * o el `content-type` no era JSON (nunca `undefined`).
   */
  body: unknown;
  /** IP del cliente: clave del limitador de tasa. */
  clientIp: string;
}

/**
 * Resultado de un núcleo de ruta:
 *  - `{ status, body }` → el adaptador lo envía tal cual.
 *  - `null` → el núcleo ya respondió directamente en `res` (401, 400 de
 *    validación, 429 del limitador, errores de escritura…).
 */
export type ApiResult = { status: number; body: unknown } | null;

/** Núcleo de ruta: entrada validada, salida con status. */
export type ApiHandler = (
  input: ApiRequest,
  res: JsonResponder,
) => ApiResult | Promise<ApiResult>;

/** Cabeceras de seguridad aplicadas a cada respuesta de API. */
export function setSecurityHeaders(res: JsonResponder): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

/**
 * 404 consistente: mismo texto que emite `apiNotFound` de Express
 * (`Ruta no encontrada: <MÉTODO> <ruta sin /api>`).
 */
export function notFoundResult(input: ApiRequest): ApiResult {
  return { status: 404, body: { error: `Ruta no encontrada: ${input.method} ${input.path}` } };
}

/**
 * Método efectivo para el dispatch: `HEAD` se trata como `GET` (Node
 * suprime el cuerpo de la respuesta, así que reutilizar el handler GET es
 * exactamente lo que hace Express con `app.get`).
 */
export function effectiveMethod(method: string): string {
  return method === 'HEAD' ? 'GET' : method;
}

/** Escribe un JSON con status (sin pasar por el tipo `ApiResult`). */
export function respondJson(res: JsonResponder, status: number, body: unknown): void {
  res.status(status).json(body);
}

/** Transporte mínimo para leer el cuerpo de una petición entrante. */
export type BodyCarrier = Pick<IncomingMessage, 'headers'> & {
  /** El runtime ya parseó el cuerpo (Vercel lo hace con `content-type: json`). */
  body?: unknown;
  /** Stream del cuerpo (la misma `IncomingMessage` de Node). */
  on?: IncomingMessage['on'];
  read?: IncomingMessage['read'];
};

export type ReadBodyResult = { ok: true; value?: unknown } | { ok: false };

/** Tope de cuerpo: 1 MB, el mismo `limit` de `express.json({ limit: '1mb' })`. */
const MAX_BODY_BYTES = 1_048_576;

/** Lee el stream del cuerpo con tope de tamaño. `null` = superó el tope. */
function readLimited(body: BodyCarrier, maxBytes: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let text = '';
    let overflow = false;

    body.on?.('data', (chunk: Buffer | string) => {
      if (overflow) return;
      text += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (text.length > maxBytes) {
        overflow = true;
        resolve(null);
      }
    });
    body.on?.('end', () => {
      if (!overflow) resolve(text);
    });
    body.on?.('error', (error: unknown) => reject(error));
  });
}

/**
 * ¿El error al acceder al cuerpo es un JSON malformado?
 *
 * El `errorHandler` de Express solo traduce `entity.parse.failed` (body-parser)
 * a 400; en Vercel el runtime lanza un `SyntaxError` de JavaScript, así que se
 * reconoce por el tipo o por el mensaje típico de un parseo roto. Cualquier
 * otra excepción sigue siendo 500, como en Express.
 */
function isMalformedJsonError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  if (error instanceof Error) {
    return /unexpected (token|end|character|identifier)|invalid json|json parse/i.test(error.message);
  }
  return false;
}

/**
 * Parseo del cuerpo para el adaptador de Vercel, espejo de
 * `express.json({ limit: '1mb' })`:
 *
 *  - Sin `content-type: json` → `{}` (body-parser deja `req.body = {}` aunque
 *    no parsea nada: así los `details` de validación son idénticos).
 *  - Runtime ya parseado (`req.body` definido) → se usa tal cual.
 *  - `req.body` **lanza** (en Vercel es un getter que parsea al acceder y
 *    lanza con JSON malformado) → `400` con el mismo cuerpo que el
 *    `errorHandler` de Express para `entity.parse.failed`.
 *  - JSON vacío → `{}`; JSON malformado → `400` (lo escribe en `res`).
 *  - Más de 1 MB → `500` (mismo resultado que el `errorHandler` de Express,
 *    que no traduce `entity.too.large` a 413).
 */
export async function readJsonBody(req: BodyCarrier, res: JsonResponder): Promise<ReadBodyResult> {
  const rawType = req.headers['content-type'];
  const contentType = Array.isArray(rawType) ? rawType[0] : rawType;
  const isJson = typeof contentType === 'string' && contentType.toLowerCase().includes('json');
  if (!isJson) return { ok: true, value: {} };

  // Cuerpo declarado por encima del tope: responde 500 aunque el runtime lo
  // haya pre-parseado, idéntico a Express (cuyo `errorHandler` no traduce
  // `entity.too.large` a 413).
  const rawLength = req.headers['content-length'];
  const declared = Number(Array.isArray(rawLength) ? rawLength[0] : rawLength);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    respondJson(res, 500, { error: 'Error interno del servidor.' });
    return { ok: false };
  }

  // `req.body` de Vercel es un getter que parsea al acceder: con JSON
  // malformado LANZA (docs oficiales de @vercel/node → «Request body») en
  // lugar de devolver `undefined`. Sin este try/catch la excepción escaparía
  // del handler y el cliente recibiría un 500 (o ni respuesta) en vez del
  // 400 de Express.
  let runtimeBody: unknown;
  try {
    runtimeBody = req.body;
  } catch (error) {
    if (isMalformedJsonError(error)) {
      respondJson(res, 400, { error: 'JSON inválido en el cuerpo de la petición.' });
    } else {
      logger.warn('No se pudo leer el cuerpo pre-parseado:', errorMessage(error));
      respondJson(res, 500, { error: 'Error interno del servidor.' });
    }
    return { ok: false };
  }

  if (runtimeBody !== undefined) {
    // Cuerpo vacío con `content-type: json` → `{}`, igual que body-parser.
    return { ok: true, value: runtimeBody === '' ? {} : runtimeBody };
  }

  let text: string | null;
  try {
    text = await readLimited(req, MAX_BODY_BYTES);
  } catch {
    respondJson(res, 500, { error: 'Error interno del servidor.' });
    return { ok: false };
  }

  if (text === null) {
    respondJson(res, 500, { error: 'Error interno del servidor.' });
    return { ok: false };
  }
  if (text.trim() === '') return { ok: true, value: {} };

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    respondJson(res, 400, { error: 'JSON inválido en el cuerpo de la petición.' });
    return { ok: false };
  }
}

/** Petición con lo mínimo para extraer la IP del cliente. */
export interface IpCarrier {
  headers: IncomingHttpHeaders;
  /** `req.ip` de Express (con `trust proxy` ya resuelve el `X-Forwarded-For`). */
  ip?: string;
  socket?: { remoteAddress?: string | null };
}

/**
 * IP del cliente usada como clave del limitador de tasa.
 *
 * En Vercel (y en Cloud Run / Nginx) la IP real viene en la primera posición
 * de `X-Forwarded-For`; fuera de un proxy se cae a `req.ip` y, en último
 * término, al socket local.
 */
export function clientIp(req: IpCarrier): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string') {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
