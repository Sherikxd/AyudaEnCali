import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useModalDialog } from '../hooks/useModalDialog';
import { X, HelpCircle, ChevronDown, Cookie, CheckCircle2 } from 'lucide-react';
import type { CookieConsent } from '../utils/consent';
import { FAQ_ITEMS } from '../data/faq';
import { FaqAnswer } from './FaqAnswer';

interface FaqModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Sección que debe abrirse desplegada (p. ej. «cookies» desde el banner). */
  initialSection?: string | null;
}

const CONSENT_LABEL: Record<CookieConsent, string> = {
  all: 'Aceptaste las opcionales (recursos de terceros activados).',
  essential: 'Solo esenciales (no se pide nada a terceros).',
};

export const FaqModal: React.FC<FaqModalProps> = ({ isOpen, onClose, initialSection }) => {
  const { cookieConsent, setCookieConsent } = useApp();
  const [openId, setOpenId] = useState<string>(FAQ_ITEMS[0].id);

  // Al abrir, se despliega la sección pedida (o la primera por defecto).
  useEffect(() => {
    if (isOpen) setOpenId(initialSection ?? FAQ_ITEMS[0].id);
  }, [isOpen, initialSection]);

  // Patrón de diálogo compartido (T13): Escape cierra + foco atrapado y
  // devuelto al disparador (antes solo cerraba con Escape).
  const dialogRef = useModalDialog<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-modal-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto focus:outline-none"
    >
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto">
        {/* Cabecera */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/20 shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="faq-modal-title" className="text-base font-extrabold text-slate-900 leading-tight">
                Preguntas frecuentes
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Respuestas rápidas sobre cuentas, reportes, apoyos y privacidad
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Acordeón */}
        <div className="p-4 sm:p-5 space-y-2 max-h-[70vh] overflow-y-auto">
          {FAQ_ITEMS.map((item) => {
            const expanded = openId === item.id;
            return (
              <div key={item.id} className="border border-slate-100 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? '' : item.id)}
                  aria-expanded={expanded}
                  aria-controls={`faq-panel-${item.id}`}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-xs sm:text-sm font-bold transition-colors ${
                    expanded ? 'bg-orange-50 text-orange-800' : 'bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span>{item.question}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform ${expanded ? 'rotate-180 text-orange-600' : 'text-slate-400'}`}
                  />
                </button>
                {expanded && (
                  <div
                    id={`faq-panel-${item.id}`}
                    className="px-4 py-3 text-xs sm:text-[13px] leading-relaxed text-slate-600 bg-white border-t border-slate-100"
                  >
                    <FaqAnswer item={item} />

                    {/* Control de cookies embebido en su propia sección */}
                    {item.id === 'cookies' && (
                      <div className="mt-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                          <Cookie className="w-3.5 h-3.5 text-orange-600" />
                          <span>Tu elección actual:</span>
                          <span className="text-slate-500 font-medium">
                            {cookieConsent ? CONSENT_LABEL[cookieConsent] : 'sin responder todavía'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2.5">
                          <button
                            type="button"
                            onClick={() => setCookieConsent('all')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 ${
                              cookieConsent === 'all'
                                ? 'bg-orange-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {cookieConsent === 'all' && <CheckCircle2 className="w-3 h-3" />}
                            Aceptar todas
                          </button>
                          <button
                            type="button"
                            onClick={() => setCookieConsent('essential')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 ${
                              cookieConsent === 'essential'
                                ? 'bg-slate-900 text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {cookieConsent === 'essential' && <CheckCircle2 className="w-3 h-3" />}
                            Solo esenciales
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pie */}
        <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-end bg-slate-50/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
