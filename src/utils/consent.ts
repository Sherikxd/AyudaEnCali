import { removeKey, loadJSON, saveJSON } from './storage';

/**
 * Consentimiento de cookies y recursos de terceros.
 *
 * - `essential` (o sin respuesta): solo lo imprescindible (sesión de acceso,
 *   seguridad y este propio consentimiento). No se pide nada a terceros.
 * - `all`: además se cargan los recursos de terceros (tipografías de Google),
 *   que pueden registrar la IP conforme a la política de dicho proveedor.
 *
 * La elección queda guardada en `localStorage` y se puede cambiar desde el
 * modal de preguntas frecuentes (sección «Cookies y privacidad»).
 */

export type CookieConsent = 'all' | 'essential';

const STORAGE_KEY = 'ayudaencali_cookie_consent_v1';
const FONTS_ELEMENT_ID = 'third-party-fonts';

// Solo la familia que la app referencia en `index.css` (la pila `mono` usa las
// fuentes del sistema): un `<link>` bloqueante menos y dos descargas menos.
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';

/** Lee la elección guardada; `null` significa «todavía no ha respondido». */
export function readConsent(): CookieConsent | null {
  return loadJSON<CookieConsent | null>(STORAGE_KEY, null);
}

/** Persiste la elección para no volver a preguntar en cada visita. */
export function saveConsent(value: CookieConsent): void {
  saveJSON(STORAGE_KEY, value);
}

/** Borra la elección (útil para pruebas y para «olvidar mis datos»). */
export function clearConsent(): void {
  removeKey(STORAGE_KEY);
}

/**
 * Aplica la elección al documento: inyecta (o retira) la hoja de estilos de
 * terceros. Se ejecuta al arrancar y cada vez que la persona cambia de opción.
 *
 * Al retirarla no se reescribe el `localStorage` de la app: los datos propios
 * (perfil, puntos guardados, ubicación) siguen siendo de la persona.
 */
export function applyConsent(value: CookieConsent | null): void {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById(FONTS_ELEMENT_ID);

  if (value !== 'all') {
    existing?.remove();
    return;
  }

  if (existing) return;

  const link = document.createElement('link');
  link.id = FONTS_ELEMENT_ID;
  link.rel = 'stylesheet';
  link.href = FONTS_URL;
  // Se inyecta desde JS fuera del `<head>` crítico: el HTML shell no espera a
  // la petición a terceros (y si la persona no acepta, nunca se hace).
  link.setAttribute('media', 'all');
  document.head.appendChild(link);
}
