/**
 * Sube las imágenes de `public/images/` a Cloudinary y (opcionalmente)
 * reescribe las URLs ya guardadas en Supabase.
 *
 * Uso:
 *   npm run cdn:upload              # sube + actualiza la base si hay credenciales
 *   npm run cdn:upload -- --dry-run # solo imprime lo que haría
 *   npm run cdn:upload -- --skip-db # sube pero no toca la base
 *
 * Requiere `CLOUDINARY_URL` en `.env` (ver `.env.example`). Esa URL contiene
 * la API key y el secreto: por eso vive en `.env` (gitignored) y nunca en el
 * bundle ni en `/api/config`.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { CDN_IMAGES, LOCAL_TO_CDN } from '../src/config/images';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipDb = args.includes('--skip-db');

interface CloudinaryCredentials {
  cloud: string;
  apiKey: string;
  apiSecret: string;
}

/** Parsea `cloudinary://API_KEY:API_SECRET@CLOUD_NAME` (la forma canónica). */
function parseCloudinaryUrl(raw: string): CloudinaryCredentials {
  const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(raw.trim());
  if (!match) {
    throw new Error('CLOUDINARY_URL no tiene el formato cloudinary://clave:secreto@cloud');
  }
  const [, apiKey, apiSecret, cloud] = match;
  if (!apiKey || !apiSecret || !cloud) throw new Error('CLOUDINARY_URL incompleta');
  return { cloud, apiKey, apiSecret };
}

/** Firma de la API de subida: sha1 de los parámetros ordenados + secreto. */
function signature(params: Record<string, string | number>, apiSecret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join('&');
  return createHash('sha1').update(sorted + apiSecret).digest('hex');
}

/** Sube un archivo como data URI (multipart simplificado y a prueba de rutas). */
async function uploadImage(
  creds: CloudinaryCredentials,
  relativePath: string,
  publicId: string,
): Promise<void> {
  const absolute = path.join(root, 'public', 'images', relativePath);
  const bytes = readFileSync(absolute);
  const mime = relativePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const file = `data:${mime};base64,${bytes.toString('base64')}`;

  const timestamp = Math.floor(Date.now() / 1000);
  // Se firman exactamente estos tres parámetros: cualquier otro que no esté
  // en la firma hace que Cloudinary responda «Invalid Signature».
  const signedParams = { public_id: publicId, overwrite: 'true', timestamp };
  const form = new FormData();
  form.set('file', file);
  form.set('api_key', creds.apiKey);
  form.set('timestamp', String(timestamp));
  form.set('signature', signature(signedParams, creds.apiSecret));
  form.set('public_id', publicId);
  form.set('overwrite', 'true');

  const endpoint = `https://api.cloudinary.com/v1_1/${creds.cloud}/image/upload`;
  const response = await fetch(endpoint, { method: 'POST', body: form });
  const payload = (await response.json().catch(() => ({}))) as {
    secure_url?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(`${relativePath}: ${payload.error?.message ?? `HTTP ${response.status}`}`);
  }
  console.log(`[OK] ${relativePath} → ${payload.secure_url ?? publicId}`);
}

/** Reescribe `image_url` en Supabase donde apunte a un archivo local. */
async function updateDatabase(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('[SKIP] Sin SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: no se toca la base.');
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  for (const asset of LOCAL_TO_CDN) {
    const oldPath = `/images/${asset.file}`;
    const cdnUrl = (CDN_IMAGES as Record<string, string>)[asset.source];
    if (!cdnUrl) throw new Error(`Falta la URL de CDN para «${asset.source}»`);

    const { data, error } = await supabase
      .from('help_needs')
      .update({ image_url: cdnUrl })
      .eq('image_url', oldPath)
      .select('id');

    if (error) throw new Error(`help_needs (${oldPath}): ${error.message}`);
    if (data?.length) console.log(`[BD] ${data.length} necesidades → ${cdnUrl}`);
  }
}

const rawUrl = process.env.CLOUDINARY_URL;
if (!rawUrl) {
  console.error('Falta CLOUDINARY_URL en .env (ver .env.example).');
  process.exit(1);
}

const creds = parseCloudinaryUrl(rawUrl);
console.log(`Cloud: ${creds.cloud} · ${LOCAL_TO_CDN.length} imágenes`);

if (dryRun) {
  for (const asset of LOCAL_TO_CDN) console.log(`[DRY] ${asset.file} → ${asset.publicId}`);
  console.log('[DRY] no se subió ni se tocó la base.');
  process.exit(0);
}

try {
  for (const asset of LOCAL_TO_CDN) {
    await uploadImage(creds, asset.file, asset.publicId);
  }
  if (skipDb) {
    console.log('[SKIP] base de datos no tocada (--skip-db).');
  } else {
    await updateDatabase();
  }
  console.log('Listo. URL de la vista previa social:');
  console.log(`  ${CDN_IMAGES.og}`);
} catch (error) {
  console.error('[ERROR]', error instanceof Error ? error.message : error);
  process.exit(1);
}
