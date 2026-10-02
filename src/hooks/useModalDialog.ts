import { useEffect, useRef, type RefObject } from 'react';

/**
 * Patrón compartido de diálogo accesible (T13 · FAL-11):
 * `role="dialog"` + `aria-modal`, Escape, foco atrapado y devuelto al cerrar.
 * Se usa en `ReportModal` y `LocationModal`:
 *
 *  - **Escape cierra** el diálogo (se escucha a nivel de `document` para que
 *    funcione aunque el foco esté en un campo del formulario).
 *  - **Foco atrapado**: con Tab/Shift+Tab el foco no escapa del diálogo.
 *  - **Foco devuelto** al elemento que lo abrió al cerrarlo.
 *
 * Uso:
 *
 * ```tsx
 * const dialogRef = useModalDialog<HTMLDivElement>(isOpen, onClose);
 * // …antes del `return null` (reglas de los hooks)
 * return <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="…" tabIndex={-1}>…</div>;
 * ```
 *
 * El `onClose` se guarda en un ref: los componentes recrean esa función en
 * cada render y el efecto **no** debe reejecutarse por eso (movería el foco
 * de golpe en medio de la navegación con teclado).
 */

/** Elementos navegables con teclado dentro del diálogo. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useModalDialog<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void,
): RefObject<T | null> {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);

  // Sincroniza el callback en cada render (se declara ANTES del efecto del
  // diálogo para que, al abrirse, el ref ya lleve el `onClose` vigente).
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // El contenedor necesita `tabIndex={-1}` para poder recibir el foco.
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const container = dialogRef.current;
      if (!container) return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const focusInside = active instanceof HTMLElement && container.contains(active);

      if (event.shiftKey) {
        if (!focusInside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!focusInside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Se escucha en `window`: en el navegador el evento burbujea desde el
    // elemento con foco hasta `window`, y así también responde cuando el
    // evento se dispara directamente sobre la ventana.
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [isOpen]);

  return dialogRef;
}
