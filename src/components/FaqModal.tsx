import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, HelpCircle, ChevronDown, Cookie, CheckCircle2 } from 'lucide-react';
import type { CookieConsent } from '../utils/consent';

interface FaqModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Sección que debe abrirse desplegada (p. ej. «cookies» desde el banner). */
  initialSection?: string | null;
}

interface FaqItem {
  id: string;
  question: string;
  /** Respuesta en elementos planos para mantener el marcado legible. */
  answer: React.ReactNode;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'que-es',
    question: '¿Qué es AyudaEnCali?',
    answer: (
      <>
        <p>
          Es una plataforma comunitaria de emergencias para Santiago de Cali: mapa interactivo con
          centros de acopio, albergues, veterinarias y servicios de salud; un tablón donde la gente
          publica necesidades solidarias; y un asistente de IA que responde con esos mismos datos.
        </p>
        <p className="mt-2">
          La mantenemos entre vecinos: cualquiera puede reportar un punto o una necesidad y así
          mantener el mapa actualizado.
        </p>
      </>
    ),
  },
  {
    id: 'cuentas',
    question: '¿Necesito una cuenta? ¿Cuál es la diferencia entre registrarme e ingresar?',
    answer: (
      <>
        <p>
          Para <strong>reportar, comentar o publicar necesidades</strong> sí. Hay dos caminos:
        </p>
        <ul className="mt-2 space-y-1.5 list-disc list-inside marker:text-orange-500">
          <li>
            <strong>Cuenta comunitaria:</strong> rellenas el formulario con tu nombre, correo,
            teléfono, barrio y rol (ciudadano, voluntario o coordinador). Sirve para identificar quién
            reporta.
          </li>
          <li>
            <strong>Ingresar con tu cuenta existente:</strong> si ya tienes cuenta, pulsa{' '}
            <em>«¿Ya tienes cuenta? Ingresa con tu cuenta»</em> en el mismo formulario. Esa sesión es
            la identidad válida para los apoyos y se sincroniza con tu perfil local.
          </li>
        </ul>
        <p className="mt-2">
          Consultar el mapa, el tablón y el asistente no requiere cuenta.
        </p>
      </>
    ),
  },
  {
    id: 'reportar',
    question: '¿Cómo publico un centro de ayuda o una necesidad?',
    answer: (
      <>
        <ul className="space-y-1.5 list-disc list-inside marker:text-orange-500">
          <li>
            <strong>Punto en el mapa:</strong> botón naranja <em>«Reportar Ayuda»</em> en la parte
            superior (o el botón <em>+</em> central en móvil). Elige la categoría —acopio,
            veterinaria, albergue o salud— y la ubicación.
          </li>
          <li>
            <strong>Necesidad en el tablón:</strong> en la pestaña <em>Tablón</em>, botón{' '}
            <em>«Publicar Necesidad»</em>. Describe insumos, barrio y contacto.
          </li>
        </ul>
        <p className="mt-2">Los dos pasos piden cuenta comunitaria antes de abrir el formulario.</p>
      </>
    ),
  },
  {
    id: 'apoyos',
    question: '¿Cómo funcionan los apoyos (el corazón)?',
    answer: (
      <>
        <p>
          Cada persona con sesión iniciada puede dar <strong>un solo apoyo por necesidad</strong>:
          pulsas el corazón y se suma; si lo vuelves a pulsar, se retira. El contador nunca baja de
          cero.
        </p>
        <p className="mt-2">
          Sin sesión, al pulsar se abre el inicio de sesión de la app; no se registra ningún apoyo
          anónimo.
        </p>
      </>
    ),
  },
  {
    id: 'asistente',
    question: '¿Qué hace el asistente IA y de dónde saca la información?',
    answer: (
      <>
        <p>
          El asistente responde dudas sobre centros de ayuda, teléfonos de emergencia y qué hacer
          ante una crisis en Cali. Usa los puntos y necesidades publicados en esta misma plataforma.
        </p>
        <p className="mt-2">
          Si el proveedor de IA no está disponible, responde con un directorio local: el chat nunca
          queda caído. No sustituye a los servicios de emergencia: para urgencias llama al{' '}
          <strong>123</strong>.
        </p>
      </>
    ),
  },
  {
    id: 'datos',
    question: '¿Qué pasa si la base de datos o mi conexión fallan?',
    answer: (
      <>
        <p>
          La app guarda los datos en varios niveles: Supabase (PostgreSQL) cuando hay conexión, una
          caché en memoria y <code className="font-mono text-[11px]">localStorage</code> como
          respaldo. Si un servicio cae, la interfaz sigue funcionando con lo último que cargó.
        </p>
        <p className="mt-2">
          Tampoco enviamos tu ubicación a terceros: el mapa pide el GPS solo cuando tú lo activas.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    question: 'Cookies y privacidad: ¿qué se guarda en mi equipo?',
    answer: (
      <>
        <p>
          <strong>Siempre (esenciales):</strong> la sesión de acceso y seguridad, y este propio
          consentimiento para no volver a preguntarte.
        </p>
        <p className="mt-2">
          <strong>Solo si lo aceptas (opcionales):</strong> recursos de terceros, hoy las tipografías
          de Google, que pueden registrar tu IP conforme a la política de dicho proveedor. Si eliges
          «Solo esenciales», no se pide nada a terceros y la app usa las fuentes del sistema.
        </p>
        <p className="mt-2">
          Tu perfil comunitario (nombre, correo, teléfono, barrio) solo se guarda cuando tú creas la
          cuenta y no se publica en el mapa. Puedes cambiar esta elección aquí mismo.
        </p>
      </>
    ),
  },
  {
    id: 'contacto',
    question: '¿Qué hago en una emergencia real?',
    answer: (
      <>
        <p>
          Llama primero a los servicios de emergencia: <strong>123</strong> (Bomberos, Ambulancia y
          Policía). Esta plataforma sirve para coordinar ayuda comunitaria, no reemplaza a esos
          servicios.
        </p>
        <p className="mt-2">
          Desde el encabezado tienes el botón <em>«Línea 123»</em> que marca directo desde tu
          teléfono.
        </p>
      </>
    ),
  },
];

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

  // Escape cierra el modal (convención de accesibilidad).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
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
                    {item.answer}

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
