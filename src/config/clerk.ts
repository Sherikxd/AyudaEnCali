import { logger } from '../utils/logger';

/**
 * Clave pública de Clerk.
 *
 * Hay dos fuentes, en este orden:
 *
 *  1. **Compilación**: `VITE_CLERK_PUBLISHABLE_KEY` horneada en el bundle
 *     (`.env` en local, `--build-arg` en el Dockerfile). Es la más rápida:
 *     no hay que esperar a la API.
 *  2. **Ejecución**: `/api/config`, que la lee de las variables de entorno del
 *     servidor (`VITE_CLERK_PUBLISHABLE_KEY` o `CLERK_PUBLISHABLE_KEY`).
 *     Así, en Cloud Run/Vercel basta con definir la variable y desplegar:
 *     **no hace falta recompilar**.
 *
 * Solo se usa la clave **pública** (`pk_…`): viaja al navegador por diseño.
 * La secreta vive exclusivamente en el servidor.
 */

const BUILD_TIME_KEY = ((import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '') as string).trim();

const CONFIG_TIMEOUT_MS = 10_000;

interface ConfigPayload {
  clerkPublishableKey?: string | null;
}

/** Valida una clave pública: tiene que existir y empezar por `pk_`. */
function asPublicKey(value: string | null | undefined): string {
  const key = (value ?? '').trim();
  if (!key) return '';
  if (!key.startsWith('pk_')) {
    logger.warn('La clave pública de Clerk no parece válida (debe iniciar con "pk_").');
    return '';
  }
  return key;
}

/**
 * Resuelve la clave pública de Clerk (bundle o servidor). Devuelve cadena
 * vacía si no hay ninguna: quien llama decide qué mostrar en ese caso.
 */
export async function resolveClerkPublishableKey(): Promise<string> {
  const fromBundle = asPublicKey(BUILD_TIME_KEY);
  if (fromBundle) return fromBundle;

  try {
    const response = await fetch('/api/config', { signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS) });
    if (!response.ok) {
      logger.warn(`/api/config respondió ${response.status}; no se pudo leer la clave pública de Clerk.`);
      return '';
    }
    const config = (await response.json()) as ConfigPayload;
    return asPublicKey(config.clerkPublishableKey);
  } catch (error) {
    // Sin conexión o timeout: se informa en la pantalla de configuración.
    logger.warn('No se pudo consultar /api/config para la clave pública de Clerk.', error);
    return '';
  }
}
