import React from 'react';
import { ChevronDown } from 'lucide-react';
import { ALL_FAQ_ITEMS } from '../data/faq';
import { FaqAnswer } from './FaqAnswer';

/**
 * Sección de preguntas frecuentes **siempre presente en la app**: aquí no
 * hay `return null`, así que las preguntas permanecen visibles en todas las
 * pestañas. `index.html` también conserva una versión estática para lecturas
 * que no ejecutan JavaScript.
 *
 * - Ancla canónica: `/#preguntas-frecuentes` (la usan la 404, el enlace del
 *   header, el pie y `llms.txt`).
 * - Convive con `FaqModal` (ayuda contextual y sección «cookies» desde el
 *   banner): el modal abre encima, esta sección vive en el flujo normal.
 * - El contenido sale de `src/data/faq.ts`, la misma fuente del `FAQPage` de
 *   JSON-LD de `index.html`.
 */
export const FaqSection: React.FC = () => (
  <section
    id="preguntas-frecuentes"
    aria-labelledby="faq-section-title"
    className="scroll-mt-20 bg-slate-50 border-t border-slate-100 px-4 lg:px-8 py-10 md:py-12"
  >
    <div className="max-w-3xl mx-auto">
      <h2 id="faq-section-title" className="text-xl md:text-2xl font-extrabold text-slate-900">
        Preguntas frecuentes de AyudaEnCali
      </h2>
      <p className="text-sm text-slate-600 mt-2 leading-relaxed">
        Cuentas, reportes, apoyos, privacidad y qué hacer en una emergencia en Santiago de Cali.
        Si es una urgencia real, llama primero al{' '}
        <a href="tel:123" className="font-bold text-rose-700 hover:text-rose-800">
          123
        </a>
        .
      </p>

      <div className="mt-6 space-y-3">
        {ALL_FAQ_ITEMS.map((item, index) => (
          <details
            key={item.id}
            open={index === 0}
            className="group bg-white border border-slate-200/80 rounded-2xl overflow-hidden"
          >
            <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-slate-50 transition-colors">
              <h3 className="text-sm font-bold text-slate-900 leading-snug">{item.question}</h3>
              <ChevronDown
                aria-hidden="true"
                className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180 group-open:text-orange-600"
              />
            </summary>
            <div className="px-4 pb-4 pt-1 text-xs sm:text-[13px] leading-relaxed text-slate-600 border-t border-slate-100">
              <FaqAnswer item={item} />
            </div>
          </details>
        ))}
      </div>
    </div>
  </section>
);
