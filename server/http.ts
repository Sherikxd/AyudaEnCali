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
  /** `req.ip` de Express (con `trust proxy` resuelve la cadena de proxys). */
  ip?: string;
  socket?: { remoteAddress?: string | null };
}

/* -------------------------------------------------------------------------- */
/* Validación y normalización de IPs (FAL-06)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Devuelve la forma canónica de una dirección IP, o `null` si no lo es.
 *
 * Solo se aceptan formatos estrictos (IPv4 con octetos 0-255 sin ceros a la
 * izquierda; IPv6 con grupos de 1-4 dígitos hexadecimales y como mucho un
 * `::`; incluida la forma IPv4-mapeada `::ffff:1.2.3.4`). El resultado es la
 * **clave** del limitador de tasa, así que nunca puede ser una cadena
 * arbitraria mandada por el cliente:
 *
 *  - `::ffff:1.2.3.4` → `1.2.3.4` (misma cuenta que su IPv4);
 *  - `2001:0DB8::0001` → `2001:db8::1` (misma cuenta que su forma corta);
 *  - `%eth0` (zone id) y corchetes (`[::1]`) se ignoran.
 */
export function normalizeIp(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1).trim();
  if (value === '') return null;
  if (value.includes(':')) return canonicalIpv6(value);
  return canonicalIpv4(value);
}

function canonicalIpv4(value: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    // Sin ceros a la izquierda: `010` sería ambiguo (¿octal?) y se rechaza.
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets.join('.');
}

/** Longitud máxima de una IPv4-mapeada escrita en notación hexadecimal. */
function ipv4TailToHex(value: string): string | null {
  const octets = canonicalIpv4(value);
  if (!octets) return null;
  const [a, b, c, d] = octets.split('.').map(Number);
  const high = (((a << 8) | b) >>> 0).toString(16);
  const low = (((c << 8) | d) >>> 0).toString(16);
  return `${high}:${low}`;
}

/** Colapsa la tira de ceros más larga (≥ 2 grupos) a la forma `::`. */
function formatIpv6Groups(groups: string[]): string {
  const parts = groups.map((group) => Number.parseInt(group, 16).toString(16));
  let runStart = -1;
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i <= parts.length; i += 1) {
    if (i < parts.length && parts[i] === '0') {
      if (runStart === -1) runStart = i;
      continue;
    }
    const len = runStart === -1 ? 0 : i - runStart;
    if (len > bestLen) {
      bestLen = len;
      bestStart = runStart;
    }
    runStart = -1;
  }
  if (bestLen < 2) return parts.join(':');
  const head = parts.slice(0, bestStart).join(':');
  const tail = parts.slice(bestStart + bestLen).join(':');
  return `${head}::${tail}`;
}

/**
 * `::ffff:1.2.3.4` (IPv4-mapeada) → `1.2.3.4`.
 *
 * Node reporta los sockets duales como `::ffff:203.0.113.7` y una XFF puede
 * traer `203.0.113.7`: sin este paso el mismo cliente tendría dos cuentas
 * distintas en el limitador (FAL-06 pide «misma IP en IPv4 y `::ffff:` →
 * misma cuenta»).
 */
function ipv4FromMapped(groups: string[]): string | null {
  if (groups.length !== 8) return null;
  for (let i = 0; i < 5; i += 1) {
    if (Number.parseInt(groups[i], 16) !== 0) return null;
  }
  if (Number.parseInt(groups[5], 16) !== 0xffff) return null;
  const high = Number.parseInt(groups[6], 16);
  const low = Number.parseInt(groups[7], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/** Forma canónica final: IPv4 si es IPv4-mapeada, si no, IPv6 comprimida. */
function finishIpv6(groups: string[]): string {
  return ipv4FromMapped(groups) ?? formatIpv6Groups(groups);
}

function canonicalIpv6(value: string): string | null {
  const zone = value.indexOf('%');
  let addr = zone === -1 ? value : value.slice(0, zone);
  if (addr === '' || addr.length > 45) return null;

  // Último componente en IPv4 (`::ffff:1.2.3.4`) → dos grupos hexadecimales.
  const lastColon = addr.lastIndexOf(':');
  if (lastColon !== -1 && addr.slice(lastColon + 1).includes('.')) {
    const hex = ipv4TailToHex(addr.slice(lastColon + 1));
    if (!hex) return null;
    addr = `${addr.slice(0, lastColon + 1)}${hex}`;
  }

  const halves = addr.split('::');
  if (halves.length > 2) return null; // más de un `::` no es una IPv6 válida

  const toGroups = (part: string): string[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    for (const group of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    }
    return groups;
  };

  const head = toGroups(halves[0]);
  if (!head) return null;

  if (halves.length === 1) {
    if (head.length !== 8) return null;
    return finishIpv6(head);
  }

  const tail = toGroups(halves[1]);
  if (!tail) return null;
  // `::` representa al menos un grupo: 8 en total con las dos mitades.
  if (head.length + tail.length > 7) return null;
  const fill = new Array<string>(8 - head.length - tail.length).fill('0');
  return finishIpv6([...head, ...fill, ...tail]);
}

/**
 * IP del cliente usada como clave del limitador de tasa.
 *
 * Cadena de decisión (FAL-06, ver `docs/agentes/memoria/19-backend-p1.md`):
 *
 *  1. **`req.ip` de Express si es una IP válida.** Con `trust proxy = 1`
 *     (solo `NODE_ENV=production`, `server/app.ts`) Express devuelve la
 *     dirección del **primer salto no confiable** contando desde el socket:
 *     la que añadió el proxy más próximo, inalterable por el cliente. Sin
 *     proxy (desarrollo) devuelve el socket, de modo que una
 *     `X-Forwarded-For` mandada a mano **no** cambia la clave.
 *  2. **Sin `req.ip`** (adaptador de Vercel: `IncomingMessage` puro) se lee
 *     `X-Forwarded-For` y se toma el **último** salto con formato de IP
 *     válido —el primero hacia el cliente, el que añadió el salto más
 *     próximo— emulando `trust proxy = 1` para que ambos adaptadores
 *     calculen la misma clave. Cada proxy añade su entrada al final, así que
 *     una entrada falsa escrita por el cliente queda a la izquierda y no se
 *     usa. Una entrada corrupta se salta en lugar de romper la clave.
 *  3. **Respaldo:** la IP del socket normalizada y, en último término,
 *     `'unknown'`.
 */
export function clientIp(req: IpCarrier): string {
  const fromExpress = req.ip ? normalizeIp(req.ip) : null;
  if (fromExpress) return fromExpress;

  const forwarded = req.headers['x-forwarded-for'];
  const lines = Array.isArray(forwarded) ? forwarded : [forwarded];
  for (let line = lines.length - 1; line >= 0; line -= 1) {
    const raw = lines[line];
    if (typeof raw !== 'string') continue;
    const hops = raw.split(',');
    for (let i = hops.length - 1; i >= 0; i -= 1) {
      const normalized = normalizeIp(hops[i]);
      if (normalized) return normalized;
    }
  }

  const socketAddress = req.socket?.remoteAddress;
  return (socketAddress ? normalizeIp(socketAddress) : null) ?? 'unknown';
}
