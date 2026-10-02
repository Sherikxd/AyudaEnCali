import React, { useEffect } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, Cookie, MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ALL_FAQ_ITEMS } from '../data/faq';
import type { CookieConsent } from '../utils/consent';
import { FaqAnswer } from './FaqAnswer';

const CONSENT_LABEL: Record<CookieConsent, string> = {
  all: 'Aceptaste las opcionales (recursos de terceros activados).',
  essential: 'Solo esenciales (no se pide nada a terceros).',
};

export const FaqPage: React.FC = () => {
  const { cookieConsent, setCookieConsent } = useApp();
  const linkedSection = window.location.hash.slice(1);

  useEffect(() => {
    if (!linkedSection) return;
    document.getElementById(linkedSection)?.scrollIntoView({ block: 'start' });
  }, [linkedSection]);

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-xl text-sm font-bold text-slate-700 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver a AyudaEnCali
          </a>
          <a href="/" className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-600 text-white">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </span>
            AyudaEn<span className="-ml-2 text-orange-600">Cali</span>
          </a>
        </header>

        <main>
          <div className="mb-7">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
              Centro de ayuda
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
              Preguntas frecuentes
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Respuestas sobre cuentas, reportes, apoyos, privacidad y ayuda comunitaria en Cali.
              En una emergencia real, llama primero al{' '}
              <a href="tel:123" className="font-extrabold text-rose-700 hover:underline">
                123
              </a>
              .
            </p>
          </div>

          <div className="space-y-3">
            {ALL_FAQ_ITEMS.map((item, index) => (
              <details
                key={item.id}
                id={item.id}
                open={index === 0 || item.id === linkedSection}
                className="group scroll-mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 hover:bg-slate-50 [&::-webkit-details-marker]:hidden sm:px-5">
                  <h2 className="text-sm font-bold leading-snug text-slate-900 sm:text-base">
                    {item.question}
                  </h2>
                  <ChevronDown
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180 group-open:text-orange-600"
                  />
                </summary>
                <div className="border-t border-slate-100 px-4 pb-5 pt-4 text-sm leading-relaxed text-slate-600 sm:px-5">
                  <FaqAnswer item={item} />
                  {item.id === 'cookies' && (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start gap-2 text-xs text-slate-700">
                        <Cookie
                          className="mt-0.5 h-4 w-4 shrink-0 text-orange-600"
                          aria-hidden="true"
                        />
                        <p>
                          <span className="font-bold">Tu elección actual: </span>
                          {cookieConsent ? CONSENT_LABEL[cookieConsent] : 'sin responder todavía'}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setCookieConsent('all')}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                        >
                          {cookieConsent === 'all' && (
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Aceptar todas
                        </button>
                        <button
                          type="button"
                          onClick={() => setCookieConsent('essential')}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                        >
                          {cookieConsent === 'essential' && (
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Solo esenciales
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </main>

        <footer className="mt-8 border-t border-slate-200 pt-5 text-xs text-slate-500">
          <a href="/" className="font-bold text-orange-700 hover:underline">
            Explorar el mapa de ayuda de Cali
          </a>
          <span className="px-2" aria-hidden="true">·</span>
          <a href="tel:123" className="font-bold text-rose-700 hover:underline">
            Emergencias 123
          </a>
        </footer>
      </div>
    </div>
  );
};
