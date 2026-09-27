/**
 * Logger del servidor.
 *
 * Centraliza la salida de logs para que sea fácil de cambiar (por ejemplo a
 * JSON estructurado o a un servicio de observabilidad) y para no filtrar
 * información sensible fuera de desarrollo.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const isProduction = process.env.NODE_ENV === 'production';

const LEVEL_PRIORITY: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: Level = isProduction ? 'info' : 'debug';

function format(level: Level, message: string): string {
  return `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
}

function write(level: Level, message: string, meta?: unknown): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

  const line = format(level, message);
  if (level === 'error') {
    meta === undefined ? console.error(line) : console.error(line, meta);
  } else if (level === 'warn') {
    meta === undefined ? console.warn(line) : console.warn(line, meta);
  } else {
    meta === undefined ? console.log(line) : console.log(line, meta);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown): void => write('debug', message, meta),
  info: (message: string, meta?: unknown): void => write('info', message, meta),
  warn: (message: string, meta?: unknown): void => write('warn', message, meta),
  error: (message: string, meta?: unknown): void => write('error', message, meta),
};

/** Extrae un mensaje legible de cualquier error lanzado. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Error desconocido';
  }
}
