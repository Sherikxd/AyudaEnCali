import React from 'react';
import { useApp } from '../context/AppContext';
import { Cookie, ExternalLink } from 'lucide-react';

/**
 * Banner de consentimiento de cookies. Se muestra una sola vez (hasta que la
 * persona elija) y la decisión queda guardada; se puede cambiar después desde
 * Preguntas frecuentes → «Cookies y privacidad».
 *
 * `z-[45]` lo deja por encima del navegador inferior (z-40) y por debajo de los
 * modales (z-50), para que nunca tape un diálogo abierto.
 */
export const CookieConsent: React.FC = () => {
  const { cookieConsent, setCookieConsent, openFaq } = useApp();

  if (cookieConsent !== null) return null;

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-16 md:bottom-4 z-[45] px-3 sm:px-4 pointer-events-none"
    >
      <div className="pointer-events-auto max-w-3xl mx-auto bg-white rounded-2xl shadow-2xl shadow-slate-900/15 border border-slate-200 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
          <Cookie className="w-4.5 h-4.5" />
        </div>

        <div className="flex-1 text-xs leading-relaxed text-slate-600">
          <p className="font-extrabold text-slate-900 text-[13px] mb-0.5">Usamos cookies</p>
          <p>
            Las esenciales (sesión de acceso y seguridad) están siempre activas. Con tu permiso
            cargamos además recursos de terceros, hoy las tipografías de Google.{' '}
            <button
              type="button"
              onClick={() => openFaq('cookies')}
              className="inline-flex items-center gap-1 font-bold text-orange-700 hover:text-orange-800 underline underline-offset-2"
            >
              Ver detalles
              <ExternalLink className="w-3 h-3" />
            </button>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCookieConsent('essential')}
            className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Solo esenciales
          </button>
          <button
            type="button"
            onClick={() => setCookieConsent('all')}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-md shadow-orange-600/25 transition-colors"
          >
            Aceptar todas
          </button>
        </div>
      </div>
    </div>
  );
};
