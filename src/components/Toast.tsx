import React from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ToastItem, ToastKind } from '../types';

/**
 * Avisos visibles (toasts): éxitos, errores y reintentos que antes solo iban
 * a `logger.warn` y dejaban al usuario sin entender qué pasó.
 *
 * - Sin dependencias: estado en `AppContext` + este componente.
 * - El contenedor lleva `aria-live="polite"` para que los lectores de
 *   pantalla anuncien el aviso sin interrumpir lo que se esté haciendo.
 */

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'bg-emerald-600 text-white border-emerald-700/40',
  error: 'bg-rose-600 text-white border-rose-700/40',
  warning: 'bg-amber-500 text-amber-950 border-amber-600/40',
  info: 'bg-slate-900 text-white border-slate-700/60',
};

const KIND_LABEL: Record<ToastKind, string> = {
  success: 'Éxito',
  error: 'Error',
  warning: 'Aviso',
  info: 'Información',
};

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />,
  error: <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />,
  warning: <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />,
  info: <Info className="w-4 h-4 shrink-0" aria-hidden="true" />,
};

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}

/** Un aviso individual. Se cierra solo o con el botón «Cerrar aviso». */
export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => (
  <div
    className={`pointer-events-auto w-full rounded-2xl border px-3.5 py-3 shadow-lg shadow-slate-900/10 flex items-start gap-2.5 text-xs font-semibold leading-snug backdrop-blur-sm ${KIND_STYLES[toast.kind]}`}
  >
    {/* El rol ya está en el contenedor: aquí solo se refuerza la etiqueta. */}
    <span className="sr-only">{KIND_LABEL[toast.kind]}: </span>
    {KIND_ICON[toast.kind]}
    <div className="flex-1 min-w-0">
      <p className="pt-0.5">{toast.message}</p>
      {/* Acciones (BUG-02): reintentar/descartar lo rechazado. Con ellas el
          aviso NO se cierra solo: exige una decisión, así no se pierden
          datos en silencio. */}
      {toast.actions && toast.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {toast.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => action.run(toast.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors focus:outline-none focus:ring-2 focus:ring-white/70 ${
                action.variant === 'danger'
                  ? 'bg-white/95 text-rose-700 border-white/70 hover:bg-rose-50'
                  : 'bg-white/95 text-slate-800 border-white/70 hover:bg-white'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
    <button
      type="button"
      onClick={() => onDismiss(toast.id)}
      aria-label="Cerrar aviso"
      className="p-1 -m-0.5 rounded-lg hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-white/60 transition-colors shrink-0"
    >
      <X className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  </div>
);

/**
 * Región de avisos: un único contenedor `aria-live="polite"` anclado abajo a
 * la izquierda/centro, por encima de la navegación inferior.
 */
export const ToastRegion: React.FC = () => {
  const { toasts, dismissToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed z-[70] bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 w-[min(94vw,26rem)] flex flex-col gap-2 items-stretch"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
};
