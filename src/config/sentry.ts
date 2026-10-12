import * as Sentry from '@sentry/browser';
import { logger } from '../utils/logger';

/**
 * Monitorización de errores con Sentry (servicio **esencial**).
 *
 * Se inicializa siempre, con o sin consentimiento de cookies opcionales: solo
 * envía avisos de error y métricas de rendimiento. No usa cookies, no graba
 * la sesión (Session Replay) y no añade identificadores de usuario propios
 * (hay que fijar `setUser` a mano para que aparezca alguno).
 *
 * La DSN sale de dos sitios, en este orden:
 *
 *  1. **Compilación**: `VITE_SENTRY_DSN`. Permite redirigir los avisos a
 *     otro proyecto o apagarlos (`""`) sin tocar código. Como toda variable
 *     `VITE_*`, se horneada en el bundle: cambiarla exige recompilar.
 *  2. **Proyecto**: si la variable no está definida, se usa la DSN incluida
 *     aquí (es pública por diseño: viaja al navegador en cualquier caso) y
 *     cualquier build funciona sin configurar nada.
 *
 * En desarrollo solo se envía si `VITE_SENTRY_DSN` está definida: los eventos
 * de un `npm run dev` no deben ensuciar el proyecto real.
 */

const PROJECT_DSN =
  'https://b089b4b9ef1a49688418321130fe6bd5@o1329562.ingest.us.sentry.io/6591687';

/** Fallos del navegador que no dicen nada de la app (no merecen un issue). */
const IGNORED_ERRORS: string[] = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications.',
  // Error genérico de un script de otro origen: sin stack ni mensaje útil.
  'Script error.',
];

/** true cuando hay un cliente de Sentry activo y los avisos salen. */
let active = false;

/** DSN efectiva: la del entorno si está definida, si no la del proyecto. */
function resolveDsn(): string {
  const fromEnv = (import.meta.env.VITE_SENTRY_DSN ?? undefined) as string | undefined;
  if (fromEnv !== undefined) return fromEnv.trim();
  return import.meta.env.PROD ? PROJECT_DSN : '';
}

/**
 * Arranca Sentry. Es idempotente: puede llamarse más de una vez (React
 * `StrictMode` renderiza dos veces) sin duplicar el cliente.
 */
export function initSentry(): void {
  if (active) return;

  const dsn = resolveDsn();
  if (!dsn) {
    logger.debug('Sentry desactivado (sin DSN).');
    return;
  }

  active = true;

  Sentry.init({
    dsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    // Instrumenta cargas y navegaciones (peticiones a nuestra propia API se
    // propagan el `sentry-trace`; a terceros no: solo misma origen).
    integrations: [Sentry.browserTracingIntegration()],
    // 10 % de las cargas/navegaciones en producción; en local, todas.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
    ignoreErrors: IGNORED_ERRORS,
  });

  logger.debug('Sentry inicializado.');
}

/**
 * Envía una excepción a Sentry (no-op si no hay cliente activo). `context`
 * acepta lo mismo que `Sentry.captureException`: `contexts`, `tags`,
 * `extra`… (p. ej. el `componentStack` de un límite de errores de React).
 */
export function captureError(error: unknown, context?: Sentry.CaptureContext): void {
  if (!active) return;
  Sentry.captureException(error, context);
}
