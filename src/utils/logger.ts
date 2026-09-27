/**
 * Logger único para el cliente.
 *
 * - En desarrollo emite mensajes detallados en consola.
 * - En producción solo se propagan los errores (evita ruido y fugas de
 *   información sensible en la consola de los usuarios finales).
 */
type LogArgs = unknown[];

const isDev: boolean = import.meta.env.DEV;

const serialize = (args: LogArgs): string =>
  args
    .map((arg) => {
      if (arg instanceof Error) return arg.message;
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

export const logger = {
  debug: (...args: LogArgs): void => {
    if (isDev) console.debug('[ayudaencali]', ...args);
  },
  info: (...args: LogArgs): void => {
    if (isDev) console.info('[ayudaencali]', ...args);
  },
  warn: (...args: LogArgs): void => {
    if (isDev) console.warn('[ayudaencali]', serialize(args));
  },
  error: (...args: LogArgs): void => {
    console.error('[ayudaencali]', ...args);
  },
};
