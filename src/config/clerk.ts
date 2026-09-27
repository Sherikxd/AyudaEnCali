import { logger } from '../utils/logger';

/**
 * Clave pública de Clerk.
 *
 * Se inyecta en tiempo de compilación desde `.env` (prefijo `VITE_`).
 * Nunca debe escribirse a mano en el código: las claves que viajan en el
 * bundle son visibles para cualquier usuario, por lo que solo se usa la
 * clave pública y la secreta vive exclusivamente en el servidor.
 */
const publishableKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '') as string;

export const CLERK_PUBLISHABLE_KEY: string = publishableKey;

export const isClerkConfigured: boolean = publishableKey.startsWith('pk_');

if (publishableKey && !isClerkConfigured) {
  logger.warn('VITE_CLERK_PUBLISHABLE_KEY no parece una clave pública válida (debe iniciar con "pk_").');
}
