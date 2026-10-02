/**
 * Exporta las 4 tablas de Supabase a **CSV + JSON** y (opcionalmente) las
 * sube a un **bucket S3-compatible** con firma AWS Signature V4 implementada
 * a mano (`node:crypto` + `fetch` global; sin SDK de AWS ni deps nuevas).
 *
 * Uso:
 *   npm run export:s3                       # exporta todo y lo sube
 *   npm run export:s3 -- --dry-run          # escribe en ./exports-local/ y NO sube
 *   npm run export:s3 -- --tables=help_points,help_needs --format=csv
 *   npm run export:s3 -- --date=2026-09-30  # carpeta fechada a mano
 *   npm run export:s3 -- --self-test        # solo comprueba la firma SigV4
 *
 * Variables de entorno (siempre en `.env`, gitignored; ver `.env.example`):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY    → lectura (obligatorias;
 *     `need_supporters` y `point_comments` están sin políticas RLS: solo el
 *     SERVICE_ROLE puede leerlas).
 *   S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 *   S3_PREFIX, S3_FORCE_PATH_STYLE             → subida (obligatorias salvo
 *     con `--dry-run`, que solo necesita las de Supabase).
 *
 * Estructura remota (fechada para versionar el histórico del dashboard):
 *   <S3_PREFIX>/YYYY-MM-DD/<tabla>.csv
 *   <S3_PREFIX>/YYYY-MM-DD/<tabla>.json
 *   <S3_PREFIX>/YYYY-MM-DD/manifest.json   (se sube el último)
 *
 * Códigos de salida: 0 = OK · 1 = fallo · 2 = error de uso.
 */
import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const TOOL = 'scripts/export-s3.ts';
const PAGE_SIZE = 1000;
const READ_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

/* -------------------------------------------------------------------------- */
/* Logger propio (AGENTS.md: sin `console.*` sueltos)                          */
/* -------------------------------------------------------------------------- */

const writeOut = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const writeErr = (line: string): void => {
  process.stderr.write(`${line}\n`);
};
const log = {
  info: (msg: string): void => writeOut(`[INFO] ${msg}`),
  ok: (msg: string): void => writeOut(`[OK] ${msg}`),
  warn: (msg: string): void => writeErr(`[AVISO] ${msg}`),
  error: (msg: string): void => writeErr(`[ERROR] ${msg}`),
  dry: (msg: string): void => writeOut(`[DRY] ${msg}`),
  check: (msg: string): void => writeOut(`[TEST] ${msg}`),
};

const USAGE = `Uso: npm run export:s3 -- [opciones]

Opciones:
  --dry-run               No sube nada: escribe los ficheros en ./exports-local/
                          (y muestra lo que se habría subido)
  --tables=a,b            Solo estas tablas (por defecto: las 4)
  --format=csv|json|both  Formato de salida (por defecto: both)
  --date=YYYY-MM-DD       Sobrescribe la carpeta fechada (por defecto: hoy)
  --self-test             Solo comprueba la firma SigV4 y sale
  -h, --help              Esta ayuda

Variables (en .env, ver .env.example): SUPABASE_URL y
SUPABASE_SERVICE_ROLE_KEY siempre; S3_ENDPOINT, S3_REGION, S3_BUCKET,
S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (y opcionales S3_PREFIX,
S3_FORCE_PATH_STYLE) salvo en --dry-run.

Códigos de salida: 0 = OK · 1 = fallo · 2 = error de uso.`;

/** Error de uso CLI → se imprime la ayuda y sale con código 2. */
class UsageError extends Error {}

/* -------------------------------------------------------------------------- */
/* Utilidades criptográficas y de texto                                        */
/* -------------------------------------------------------------------------- */

const sha256Hex = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

const hmacSha256 = (key: Buffer | string, data: string): Buffer =>
  createHmac('sha256', key).update(data, 'utf8').digest();

const SHA256_EMPTY = sha256Hex('');

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Codificación URI según las reglas de SigV4 (mayúsculas en el hex). */
function uriEncode(value: string): string {
  let encoded = '';
  for (const byte of Buffer.from(value, 'utf8')) {
    const char = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(char)) {
      encoded += char;
    } else {
      encoded += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return encoded;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* -------------------------------------------------------------------------- */
/* AWS Signature V4 (a mano)                                                   */
/* -------------------------------------------------------------------------- */

interface SignInput {
  method: string;
  /** Ruta ya codificada, empezando por `/` (p. ej. `/bucket/clave.csv`). */
  canonicalUri: string;
  /** Query ya codificada y ordenada; '' si no hay query. */
  canonicalQuery: string;
  /** Cabeceras EXACTAMENTE las que se firman (claves en minúsculas). */
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Momento UTC en formato `YYYYMMDDTHHMMSSZ`. */
  amzDate: string;
}

interface SignResult {
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
  authorization: string;
}

/** Normaliza el valor de una cabecera para el canonical request. */
const normalizeHeaderValue = (value: string): string => value.trim().replace(/\s+/g, ' ');

/** Cadena de firmado: derivación HMAC en 4 pasos (AWS4 + clave secreta). */
function deriveSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const dateKey = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmacSha256(dateKey, region);
  const dateRegionServiceKey = hmacSha256(dateRegionKey, service);
  return hmacSha256(dateRegionServiceKey, 'aws4_request');
}

/** Firma una petición con AWS Signature Version 4 (cabecera Authorization). */
function sigV4Sign(input: SignInput): SignResult {
  const lowerHeaders: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers)) lowerHeaders[name.toLowerCase()] = value;

  const headerNames = Object.keys(lowerHeaders).sort();
  const canonicalHeaders = headerNames.map((name) => `${name}:${normalizeHeaderValue(lowerHeaders[name])}\n`).join('');
  const signedHeaders = headerNames.join(';');

  const canonicalRequest = [
    input.method.toUpperCase(),
    input.canonicalUri,
    input.canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');

  const dateStamp = input.amzDate.slice(0, 8);
  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', input.amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = deriveSigningKey(input.secretAccessKey, dateStamp, input.region, input.service);
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { canonicalRequest, stringToSign, signature, authorization };
}

/**
 * Auto-test con vectores oficiales de la suite `aws4_testsuite` de AWS
 * (credenciales de ejemplo públicas de la documentación, NO son reales).
 * Verificado de forma independiente con openssl antes de incrustarlos.
 */
function runSelfTest(): boolean {
  const results: boolean[] = [];

  // 1) get-vanilla: GET / sin cuerpo ni cabeceras extra.
  const vanilla = sigV4Sign({
    method: 'GET',
    canonicalUri: '/',
    canonicalQuery: '',
    headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
    payloadHash: SHA256_EMPTY,
    region: 'us-east-1',
    service: 'service',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    amzDate: '20150830T123600Z',
  });
  const expectedVanilla =
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
    'SignedHeaders=host;x-amz-date, ' +
    'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31';
  const vanillaOk = vanilla.authorization === expectedVanilla;
  results.push(vanillaOk);
  log.check(
    vanillaOk
      ? 'get-vanilla: Authorization idéntica al vector oficial de AWS'
      : `get-vanilla: FALLA\n  esperado: ${expectedVanilla}\n  obtenido: ${vanilla.authorization}`,
  );

  // 2) post-x-www-form-urlencoded: POST con cuerpo y cabecera firmada extra.
  const post = sigV4Sign({
    method: 'POST',
    canonicalUri: '/',
    canonicalQuery: '',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      host: 'example.amazonaws.com',
      'x-amz-date': '20150830T123600Z',
    },
    payloadHash: sha256Hex('Param1=value1'),
    region: 'us-east-1',
    service: 'service',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    amzDate: '20150830T123600Z',
  });
  const expectedPostSignature = 'ff11897932ad3f4e8b18135d722051e5ac45fc38421b1da7b9d196a0fe09473a';
  const postOk = post.signature === expectedPostSignature;
  results.push(postOk);
  log.check(
    postOk
      ? 'post-x-www-form-urlencoded: firma idéntica al vector oficial'
      : `post-x-www-form-urlencoded: FALLA\n  esperado: ${expectedPostSignature}\n  obtenido: ${post.signature}`,
  );

  // 3) Formato de la cabecera Authorization en un PUT de S3 real.
  const put = sigV4Sign({
    method: 'PUT',
    canonicalUri: '/mi-bucket/ayudaencali/2026-10-01/help_points.csv',
    canonicalQuery: '',
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      host: 'storage.ejemplo.com',
      'x-amz-content-sha256': SHA256_EMPTY,
      'x-amz-date': '20261001T000000Z',
    },
    payloadHash: SHA256_EMPTY,
    region: 'auto',
    service: 's3',
    accessKeyId: 'TESTACCESSKEY1234',
    secretAccessKey: 'clave-de-prueba-no-real',
    amzDate: '20261001T000000Z',
  });
  const formatOk =
    /^AWS4-HMAC-SHA256 Credential=TESTACCESSKEY1234\/20261001\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/.test(
      put.authorization,
    ) && put.canonicalRequest.startsWith('PUT\n/mi-bucket/ayudaencali/2026-10-01/help_points.csv\n');
  results.push(formatOk);
  log.check(formatOk ? 'PUT S3: formato de Authorization correcto' : `PUT S3: formato raro → ${put.authorization}`);

  return results.every(Boolean);
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                         */
/* -------------------------------------------------------------------------- */

type ExportFormat = 'csv' | 'json' | 'both';

interface CliArgs {
  dryRun: boolean;
  tables: string[] | null;
  format: ExportFormat;
  date: string | null;
  selfTestOnly: boolean;
  help: boolean;
}

const valueOfFlag = (args: string[], name: string): string | null => {
  for (const arg of args) {
    if (arg === name || arg.startsWith(`${name}=`)) {
      const eq = arg.indexOf('=');
      return eq === -1 ? '' : arg.slice(eq + 1);
    }
  }
  return null;
};

function todayFolder(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseCli(argv: string[]): CliArgs {
  const known = new Set(['--dry-run', '--tables', '--format', '--date', '--self-test', '-h', '--help']);
  for (const arg of argv) {
    const name = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    if (!known.has(name)) throw new UsageError(`Bandera desconocida: ${arg}`);
  }

  const formatRaw = valueOfFlag(argv, '--format') ?? 'both';
  if (formatRaw !== 'csv' && formatRaw !== 'json' && formatRaw !== 'both') {
    throw new UsageError(`--format inválido: «${formatRaw}» (usa csv | json | both)`);
  }

  const dateRaw = valueOfFlag(argv, '--date');
  if (dateRaw !== null && dateRaw !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw) || Number.isNaN(Date.parse(`${dateRaw}T00:00:00Z`))) {
      throw new UsageError(`--date inválido: «${dateRaw}» (usa YYYY-MM-DD)`);
    }
  }

  const tablesRaw = valueOfFlag(argv, '--tables');
  let tables: string[] | null = null;
  if (tablesRaw !== null) {
    tables = tablesRaw.split(',').map((name) => name.trim()).filter((name) => name !== '');
    if (tables.length === 0) throw new UsageError('--tables no puede estar vacío');
  }

  return {
    dryRun: argv.includes('--dry-run'),
    tables,
    format: formatRaw,
    date: dateRaw && dateRaw !== '' ? dateRaw : null,
    selfTestOnly: argv.includes('--self-test'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

/* -------------------------------------------------------------------------- */
/* Tablas (espejo de supabase/schema.sql; NO se modifica el esquema)           */
/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>;

interface TableDef {
  name: string;
  /** Orden total y estable para paginar sin duplicar ni perder filas. */
  order: string;
  /** Columnas del esquema: cabecera del CSV aunque la tabla esté vacía. */
  columns: string[];
}

const TABLES: readonly TableDef[] = [
  {
    name: 'help_points',
    order: 'id.asc',
    columns: [
      'id', 'name', 'category', 'lat', 'lng', 'address', 'barrio', 'comuna', 'phone',
      'whatsapp', 'contact_person', 'description', 'schedule', 'status', 'urgent_items',
      'capacity', 'verified', 'author_id', 'created_at', 'updated_at',
    ],
  },
  {
    name: 'help_needs',
    order: 'id.asc',
    columns: [
      'id', 'title', 'description', 'category', 'urgency', 'barrio', 'contact_name',
      'contact_phone', 'items', 'status', 'supporters_count', 'image_url', 'author_id',
      'created_at',
    ],
  },
  {
    name: 'need_supporters',
    order: 'need_id.asc,user_id.asc',
    columns: ['need_id', 'user_id', 'created_at'],
  },
  {
    name: 'point_comments',
    order: 'id.asc',
    columns: ['id', 'point_id', 'author_id', 'author_name', 'author_role', 'author_barrio', 'body', 'created_at'],
  },
];

function selectTables(requested: string[] | null): TableDef[] {
  if (requested === null) return [...TABLES];
  const byName = new Map(TABLES.map((table) => [table.name, table]));
  const chosen: TableDef[] = [];
  for (const name of requested) {
    const table = byName.get(name);
    if (!table) {
      throw new UsageError(`Tabla desconocida: «${name}» (válidas: ${TABLES.map((t) => t.name).join(', ')})`);
    }
    if (!chosen.includes(table)) chosen.push(table);
  }
  return chosen;
}

/* -------------------------------------------------------------------------- */
/* Configuración (variables de entorno)                                        */
/* -------------------------------------------------------------------------- */

interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

interface S3Config {
  origin: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  pathStyle: boolean;
}

function loadSupabaseConfig(): SupabaseConfig {
  const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env (ver .env.example). ' +
        'Sin ellas no se puede leer ninguna tabla.',
    );
  }
  if (url.includes('tu-proyecto')) {
    throw new Error('SUPABASE_URL sigue con el valor de plantilla de .env.example: copia tu URL real a .env.');
  }
  if (!/^https?:\/\//.test(url)) throw new Error('SUPABASE_URL debe empezar por http:// o https://');
  return { url, serviceRoleKey };
}

/** `null` si no hay S3 configurado (solo admisible con `--dry-run`). */
function loadS3Config(required: boolean): S3Config | null {
  const endpoint = (process.env.S3_ENDPOINT ?? '').trim();
  const region = (process.env.S3_REGION ?? '').trim();
  const bucket = (process.env.S3_BUCKET ?? '').trim();
  const accessKeyId = (process.env.S3_ACCESS_KEY_ID ?? '').trim();
  const secretAccessKey = (process.env.S3_SECRET_ACCESS_KEY ?? '').trim();

  const missing = [
    !endpoint && 'S3_ENDPOINT',
    !region && 'S3_REGION',
    !bucket && 'S3_BUCKET',
    !accessKeyId && 'S3_ACCESS_KEY_ID',
    !secretAccessKey && 'S3_SECRET_ACCESS_KEY',
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) {
    if (required) {
      throw new Error(`Faltan variables del bucket en .env: ${missing.join(', ')} (ver .env.example).`);
    }
    log.warn(`S3 sin configurar (${missing.join(', ')}): nada se subirá; solo se escribe en exports-local/.`);
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error(`S3_ENDPOINT no es una URL válida: «${endpoint}» (p. ej. https://mi-cluster.example.com)`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('S3_ENDPOINT debe ser http:// o https://');
  }

  const rawPrefix = (process.env.S3_PREFIX ?? '').trim();
  const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE ?? '').trim().toLowerCase();

  return {
    origin: endpoint.replace(/\/+$/, ''),
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    prefix: rawPrefix.replace(/^\/+|\/+$/g, ''),
    // Por defecto path-style: es lo que aceptan la mayoría de clusters
    // compatibles (MinIO, Ceph, R2 con dominio propio…). `false` usa
    // estilo virtual-hosted (https://<bucket>.<endpoint>).
    pathStyle: forcePathStyle !== 'false' && forcePathStyle !== '0' && forcePathStyle !== 'no',
  };
}

/* -------------------------------------------------------------------------- */
/* Lectura de Supabase (REST, paginación real)                                 */
/* -------------------------------------------------------------------------- */

const isTransientStatus = (status: number): boolean => status === 429 || status >= 500;

/**
 * `fetch` con timeout y reintentos limitados; solo se reintenta en fallos
 * transitorios (red, timeout, 429, 5xx). Los 4xx se devuelven tal cual para
 * que el llamador reporte el detalle.
 */
async function fetchWithRetry(build: () => { url: string; init: RequestInit }): Promise<Response> {
  let lastFailure = 'fallo desconocido';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { url, init } = build();
      const response = await fetch(url, init);
      if (response.ok || !isTransientStatus(response.status)) return response;
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt);
  }
  throw new Error(`${lastFailure} (tras ${MAX_ATTEMPTS} intentos)`);
}

/** Lee una tabla entera con paginación por `Range` + `limit/offset`. */
async function fetchTable(config: SupabaseConfig, table: TableDef): Promise<Row[]> {
  const rows: Row[] = [];
  let offset = 0;

  for (;;) {
    const query = [
      'select=*',
      `order=${encodeURIComponent(table.order)}`,
      `limit=${PAGE_SIZE}`,
      `offset=${offset}`,
    ].join('&');
    const endpoint = `${config.url}/rest/v1/${table.name}?${query}`;

    const response = await fetchWithRetry(() => ({
      url: endpoint,
      init: {
        method: 'GET',
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          Accept: 'application/json',
          Range: `${offset}-${offset + PAGE_SIZE - 1}`,
        },
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      },
    }));

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`Supabase respondió ${response.status} en ${table.name}: ${detail || 'sin cuerpo'}`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error(`${table.name}: respuesta inesperada de Supabase (no es una lista)`);
    const batch = payload as Row[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += batch.length;
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* CSV / JSON / manifest                                                       */
/* -------------------------------------------------------------------------- */

/** Celda según RFC 4180: comillas dobles escapadas; null/undefined → vacío. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    text = String(value);
  } else {
    text = JSON.stringify(value) ?? ''; // JSONB (urgent_items, items…)
  }
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Cabecera = columnas del esquema + cualquier columna extra que aparezca. */
function resolveColumns(def: TableDef, rows: Row[]): string[] {
  const columns = [...def.columns];
  const known = new Set(columns);
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!known.has(key)) {
        known.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

function toCsv(columns: string[], rows: Row[]): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','));
  return `${lines.join('\r\n')}\r\n`; // RFC 4180: fin de línea CRLF
}

function toJson(rows: Row[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}

interface ManifestFile {
  name: string;
  bytes: number;
  sha256: string;
}

interface Manifest {
  tool: string;
  generated_at: string;
  date: string;
  format: ExportFormat;
  tables: Array<{ name: string; rows: number; files: ManifestFile[] }>;
  total_rows: number;
  total_files: number;
  total_bytes: number;
  dump_sha256: string;
}

/* -------------------------------------------------------------------------- */
/* Subida a S3 (PUT firmado con Signature V4)                                  */
/* -------------------------------------------------------------------------- */

/** `20261001T120000Z` — fecha/hora UTC requerida por SigV4. */
function amzDateNow(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Clave del objeto: `<prefix>/YYYY-MM-DD/<fichero>` (prefix opcional). */
function objectKey(prefix: string, date: string, fileName: string): string {
  return `${prefix ? `${prefix}/` : ''}${date}/${fileName}`;
}

function targetUrl(config: S3Config, key: string): string {
  const encodedKey = key.split('/').map(uriEncode).join('/');
  if (config.pathStyle) return `${config.origin}/${uriEncode(config.bucket)}/${encodedKey}`;
  const origin = new URL(config.origin);
  return `${origin.protocol}//${config.bucket}.${origin.host}/${encodedKey}`;
}

/** PUT de un objeto; re-firma en cada intento (fecha fresca). */
async function putObject(config: S3Config, key: string, body: Buffer, contentType: string): Promise<void> {
  const payloadHash = sha256Hex(body);
  const target = targetUrl(config, key);
  const canonicalUri = new URL(target).pathname;

  const response = await fetchWithRetry(() => {
    const amzDate = amzDateNow();
    const headers: Record<string, string> = {
      'content-type': contentType,
      host: new URL(target).host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    const signed = sigV4Sign({
      method: 'PUT',
      canonicalUri,
      canonicalQuery: '',
      headers,
      payloadHash,
      region: config.region,
      service: 's3',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      amzDate,
    });
    return {
      url: target,
      init: {
        method: 'PUT',
        headers: { ...headers, Authorization: signed.authorization },
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      } satisfies RequestInit,
    };
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`PUT ${key} → ${response.status}: ${detail || 'sin cuerpo'}`);
  }
}

/* -------------------------------------------------------------------------- */
/* main                                                                        */
/* -------------------------------------------------------------------------- */

interface Artifact {
  fileName: string;
  key: string;
  body: Buffer;
  contentType: string;
  table: string | null;
  format: 'csv' | 'json' | 'manifest';
}

interface TableResult {
  name: string;
  rows: number;
  bytes: number;
  ok: boolean;
}

function localExportDir(date: string): string {
  return path.join(root, 'exports-local', date);
}

function writeLocal(artifact: Artifact, date: string): void {
  // Los volcados contienen datos personales (teléfonos, autores): se guardan
  // siempre bajo exports-local/, con su propio .gitignore para que no acaben
  // en el repo aunque alguien haga `git add -A`.
  mkdirSync(localExportDir(date), { recursive: true });
  writeFileSync(path.join(root, 'exports-local', '.gitignore'), '*\n');
  writeFileSync(path.join(localExportDir(date), artifact.fileName), artifact.body);
}

function buildManifest(
  date: string,
  format: ExportFormat,
  tables: Array<{ name: string; rows: number; files: Array<{ artifact: Artifact; sha256: string }> }>,
): Manifest {
  const manifestTables = tables.map((table) => ({
    name: table.name,
    rows: table.rows,
    files: table.files.map(({ artifact, sha256 }) => ({
      name: artifact.fileName,
      bytes: artifact.body.byteLength,
      sha256,
    })),
  }));

  const allFiles = tables.flatMap((table) => table.files);
  const totalBytes = allFiles.reduce((sum, file) => sum + file.artifact.body.byteLength, 0);
  const dumpHash = sha256Hex(
    allFiles
      .map(({ artifact, sha256 }) => `${artifact.fileName}:${sha256}`)
      .sort()
      .join('\n'),
  );

  return {
    tool: TOOL,
    generated_at: new Date().toISOString(),
    date,
    format,
    tables: manifestTables,
    total_rows: tables.reduce((sum, table) => sum + table.rows, 0),
    total_files: allFiles.length,
    total_bytes: totalBytes,
    dump_sha256: dumpHash,
  };
}

function printSummary(results: TableResult[], totalFiles: number, okFiles: number, dryRun: boolean): void {
  writeOut('');
  writeOut(`── Resumen${dryRun ? ' (dry-run: no se subió nada) ' : ' '}──`);
  for (const result of results) {
    const name = result.name.padEnd(18);
    const rows = String(result.rows).padStart(6);
    const bytes = formatBytes(result.bytes).padStart(9);
    writeOut(`[RES] ${name} ${rows} filas ${bytes}  ${result.ok ? 'OK' : 'FALLO'}`);
  }
  const totals = results.reduce(
    (acc, result) => ({ rows: acc.rows + result.rows, bytes: acc.bytes + result.bytes }),
    { rows: 0, bytes: 0 },
  );
  writeOut(
    `[RES] TOTAL${''.padEnd(11)}${String(totals.rows).padStart(6)} filas ${formatBytes(totals.bytes).padStart(9)}  ` +
      `ficheros ${okFiles}/${totalFiles}`,
  );
}

async function main(argv: string[]): Promise<number> {
  const cli = parseCli(argv);
  if (cli.help) {
    writeOut(USAGE);
    return EXIT_OK;
  }

  // Errores de uso primero (salen con 2 aunque falte entorno) y después el
  // auto-test de la firma: si estuviera mal, cada subida fallaría con 403 en
  // el cluster y costaría encontrarlo.
  const tables = selectTables(cli.tables);
  if (!runSelfTest()) throw new Error('el auto-test de la firma SigV4 falló: nada se exportará');
  if (cli.selfTestOnly) {
    log.ok('Firma SigV4 verificada (2 vectores oficiales + formato Authorization).');
    return EXIT_OK;
  }

  const supabase = loadSupabaseConfig();
  const s3 = loadS3Config(!cli.dryRun);
  const date = cli.date ?? todayFolder();

  log.info(
    `${tables.map((t) => t.name).join(', ')} · formato ${cli.format} · carpeta ${date} · ` +
      `${cli.dryRun ? 'dry-run (sin subir)' : 'subiendo'}`,
  );

  const artifacts: Artifact[] = [];
  const results: TableResult[] = [];
  const manifestTables: Array<{ name: string; rows: number; files: Array<{ artifact: Artifact; sha256: string }> }> = [];

  for (const table of tables) {
    try {
      const rows = await fetchTable(supabase, table);
      const columns = resolveColumns(table, rows);
      const files: Array<{ artifact: Artifact; sha256: string }> = [];

      if (cli.format === 'csv' || cli.format === 'both') {
        const body = Buffer.from(toCsv(columns, rows), 'utf8');
        files.push({
          artifact: {
            fileName: `${table.name}.csv`,
            key: objectKey(s3?.prefix ?? '', date, `${table.name}.csv`),
            body,
            contentType: 'text/csv; charset=utf-8',
            table: table.name,
            format: 'csv',
          },
          sha256: sha256Hex(body),
        });
      }
      if (cli.format === 'json' || cli.format === 'both') {
        const body = Buffer.from(toJson(rows), 'utf8');
        files.push({
          artifact: {
            fileName: `${table.name}.json`,
            key: objectKey(s3?.prefix ?? '', date, `${table.name}.json`),
            body,
            contentType: 'application/json; charset=utf-8',
            table: table.name,
            format: 'json',
          },
          sha256: sha256Hex(body),
        });
      }

      const bytes = files.reduce((sum, file) => sum + file.artifact.body.byteLength, 0);
      artifacts.push(...files.map((file) => file.artifact));
      manifestTables.push({ name: table.name, rows: rows.length, files });
      results.push({ name: table.name, rows: rows.length, bytes, ok: true });
      log.ok(`${table.name}: ${rows.length} filas → ${files.map((f) => f.artifact.fileName).join(', ')} (${formatBytes(bytes)})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`${table.name}: ${message}`);
      results.push({ name: table.name, rows: 0, bytes: 0, ok: false });
    }
  }

  // El manifest resume SOLO las tablas leídas con éxito y se sube el último:
  // un lector que encuentre el manifest sabe que el volcado está completo.
  const manifest = buildManifest(date, cli.format, manifestTables);
  const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const manifestArtifact: Artifact = {
    fileName: 'manifest.json',
    key: objectKey(s3?.prefix ?? '', date, 'manifest.json'),
    body: manifestBody,
    contentType: 'application/json; charset=utf-8',
    table: null,
    format: 'manifest',
  };
  artifacts.push(manifestArtifact);

  let okFiles = 0;
  for (const artifact of artifacts) {
    try {
      if (cli.dryRun) {
        writeLocal(artifact, date);
        const target = s3 ? `s3://${s3.bucket}/${artifact.key}` : `S3 sin configurar → ${artifact.key}`;
        log.dry(`${artifact.fileName} · ${formatBytes(artifact.body.byteLength)} → ${target} (no subido)`);
      } else {
        if (!s3) throw new Error('sin configuración S3');
        await putObject(s3, artifact.key, artifact.body, artifact.contentType);
        log.ok(`subido s3://${s3.bucket}/${artifact.key} · ${formatBytes(artifact.body.byteLength)}`);
      }
      okFiles += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`${artifact.fileName}: ${message}`);
      if (artifact.table !== null) {
        const result = results.find((r) => r.name === artifact.table);
        if (result) result.ok = false;
      }
    }
  }

  if (cli.dryRun) log.info(`Ficheros escritos en ${localExportDir(date)}`);

  printSummary(results, artifacts.length, okFiles, cli.dryRun);

  const allOk = results.every((result) => result.ok) && okFiles === artifacts.length;
  return allOk ? EXIT_OK : EXIT_FAIL;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    log.error(error.message);
    writeOut('');
    writeOut(USAGE);
    process.exitCode = EXIT_USAGE;
  } else {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = EXIT_FAIL;
  }
}
