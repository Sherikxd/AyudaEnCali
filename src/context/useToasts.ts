import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastAction, ToastItem, ToastKind } from '../types';
import { MAX_TOASTS, TOAST_DURATION_MS } from './appConstants';
import type { NotifyFn } from './appTypes';

export interface ToastsApi {
  toasts: ToastItem[];
  notify: NotifyFn;
  dismissToast: (id: number) => void;
}

/**
 * Avisos visibles (T7): éxitos, errores y reintentos que antes solo
 * llegaban a `logger.warn`. El componente `Toast` (región `aria-live`)
 * vive en `App.tsx`.
 */
export function useToasts(): ToastsApi {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeqRef = useRef(0);

  /**
   * Aviso visible. `actions` añade botones (BUG-02): en ese caso el aviso
   * **no** se cierra solo, porque exige una decisión (reintentar / descartar)
   * y cerrarlo en silencio dejaría datos sin resolver.
   */
  const notify = useCallback<NotifyFn>(
    (message: string, kind: ToastKind = 'info', actions?: ToastAction[]): number => {
      toastSeqRef.current += 1;
      const id = toastSeqRef.current;
      setToasts((prev) =>
        // Sin duplicados: los reintentos suelen repetir el mismo mensaje.
        [
          ...prev.filter((toast) => toast.message !== message),
          actions && actions.length > 0 ? { id, kind, message, actions } : { id, kind, message },
        ].slice(-MAX_TOASTS),
      );
      return id;
    },
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Auto-cierre: retira el aviso más antiguo que no requiera decisión
  // (los avisos con `actions` se quedan hasta que se actúe sobre ellos).
  useEffect(() => {
    const needsDecision = (toast: ToastItem): boolean =>
      toast.actions !== undefined && toast.actions.length > 0;
    if (toasts.every(needsDecision)) return undefined;
    const timer = window.setTimeout(() => {
      setToasts((prev) => {
        const index = prev.findIndex((toast) => !needsDecision(toast));
        return index === -1 ? prev : [...prev.slice(0, index), ...prev.slice(index + 1)];
      });
    }, TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  return { toasts, notify, dismissToast };
}
