import React, { useState, useRef, useEffect } from 'react';
import { useApp, useMapUI } from '../context/AppContext';
import { ChatMessage, HelpPoint } from '../types';
import { sendChatMessage } from '../services/geminiService';
import { logger } from '../utils/logger';
import { 
  Send, 
  Bot, 
  User, 
  PlusCircle, 
  Phone,
  Database,
  ArrowRight,
  Compass
} from 'lucide-react';

const SUGGESTED_QUERIES = [
  '🐾 ¿Dónde hay veterinarias y refugios de animales activos?',
  '🚚 ¿Qué centros de acopio reciben comida y agua hoy?',
  '🏠 Albergues comunitarios disponibles en Cali',
  '📝 Quiero registrar una nueva zona o centro de ayuda',
  '🏥 Hospitales con urgencias 24h y bancos de sangre',
  '🚨 Teléfonos de emergencia oficiales de Cali',
];

export const ChatView: React.FC = () => {
  const { 
    helpPoints, 
    helpNeeds, 
    userLocation, 
    setIsLocationModalOpen,
    setIsReportModalOpen,
    setReportModalType,
    userProfile,
    openAuthModal,
    notify,
  } = useApp();
  // «Ver en el mapa»: acción del contexto de mapa (T12).
  const { focusPointOnMap } = useMapUI();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'assistant',
      text: `¡Hola! Soy **CaliSolidaria IA**, tu asistente comunitario en tiempo real.\n\nLeo directamente la base de datos de **AyudaEnCali** (${helpPoints.length} puntos activos y ${helpNeeds.length} necesidades urgentes registradas).\n\nPuedes preguntarme por recursos cercanos a tu ubicación (acopio, veterinarias, albergues y centros médicos), o te puedo guiar para **registrar una nueva zona o punto de ayuda**.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const reply = await sendChatMessage({
        message: text,
        userLocation,
        conversationHistory: [...messages, userMsg],
      });

      // Find any mentioned points to attach as quick action cards
      const matchedPoints: HelpPoint[] = [];
      const lowerReply = reply.toLowerCase();
      helpPoints.forEach((p) => {
        if (lowerReply.includes(p.name.toLowerCase()) || lowerReply.includes(p.barrio.toLowerCase())) {
          if (matchedPoints.length < 3 && !matchedPoints.some((m) => m.id === p.id)) {
            matchedPoints.push(p);
          }
        }
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        relatedPoints: matchedPoints.length > 0 ? matchedPoints : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      logger.error('No se pudo consultar al asistente:', error);
      // Sin respuesta del servidor NO se inventa texto (T14): se avisa y se
      // sugiere mirar el mapa, que sí tiene los datos locales.
      notify('El asistente no está disponible en este momento. Puedes consultar los puntos directamente en el mapa.', 'error');
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: 'assistant',
          text: 'Disculpa, tuve un problema al consultar la base de datos en este instante. Por favor revisa los puntos directamente en el mapa.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenRegisterZone = () => {
    if (!userProfile.isRegistered) {
      openAuthModal('Para registrar una nueva zona o centro de ayuda en Cali debes crear una cuenta.', () => {
        setReportModalType('point');
        setIsReportModalOpen(true);
      });
      return;
    }
    setReportModalType('point');
    setIsReportModalOpen(true);
  };

  // Helper to format text with bold and list items
  const renderFormattedText = (rawText: string) => {
    const lines = rawText.split('\n');
    return (
      <div className="space-y-1.5 text-xs md:text-sm leading-relaxed">
        {lines.map((line, idx) => {
          if (!line.trim()) return <div key={idx} className="h-1" />;

          // Check if bullet point
          const isBullet = line.startsWith('•') || line.startsWith('-') || line.startsWith('* ');
          const content = isBullet ? line.replace(/^[•\-\*]\s*/, '') : line;

          // Parse **bold** parts
          const parts = content.split(/(\*\*.*?\*\*)/g);

          const renderedLine = parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={pIdx} className="font-bold text-slate-900">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return <span key={pIdx}>{part}</span>;
          });

          if (isBullet) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-orange-600 font-bold shrink-0 mt-0.5">•</span>
                <div className="flex-1">{renderedLine}</div>
              </div>
            );
          }

          return <p key={idx}>{renderedLine}</p>;
        })}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-61px-56px)] md:h-[calc(100vh-61px)] flex flex-col bg-slate-50 md:py-4 md:px-6">
      <div className="flex-1 flex flex-col bg-white md:rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Chat Header Status Bar */}
        <div className="px-4 py-3.5 bg-white border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">CaliSolidaria IA</h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  En línea
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Database className="w-3 h-3 text-slate-400" />
                <span>Base de datos en tiempo real · {helpPoints.length} puntos en Cali</span>
              </div>
            </div>
          </div>

          {/* Quick Zone Registration Trigger */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLocationModalOpen(true)}
              title="Ajustar o cambiar mi ubicación"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              <Compass className="w-3.5 h-3.5 text-orange-600" />
              <span>{userLocation?.barrio || 'Configurar GPS'}</span>
            </button>

            <button
              onClick={handleOpenRegisterZone}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200/60 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Registrar</span> Zona
            </button>
          </div>
        </div>

        {/* Conversation Stream */}
        <div
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="Conversación con el asistente CaliSolidaria"
        >
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[90%] md:max-w-[80%] ${
                  isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isUser
                      ? 'bg-slate-900 text-white'
                      : 'bg-orange-600 text-white shadow-sm shadow-orange-600/20'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Bubble */}
                <div className="flex flex-col">
                  <div
                    className={`rounded-3xl p-4 ${
                      isUser
                        ? 'bg-orange-600 text-white rounded-tr-none'
                        : 'bg-slate-50 text-slate-800 rounded-tl-none border border-slate-100'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-xs md:text-sm whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      renderFormattedText(msg.text)
                    )}

                    {/* Related Points Action Cards attached to Assistant reply */}
                    {msg.relatedPoints && msg.relatedPoints.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200/60 space-y-2">
                        <p className="text-[11px] font-bold text-slate-600">
                          📍 Puntos encontrados en la base de datos:
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.relatedPoints.map((point) => (
                            <div
                              key={point.id}
                              className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase">
                                  <span>
                                    {point.category === 'acopio' && '🚚 Acopio'}
                                    {point.category === 'veterinaria' && '🐾 Veterinaria'}
                                    {point.category === 'albergue' && '🏠 Albergue'}
                                    {point.category === 'salud' && '🏥 Salud'}
                                  </span>
                                  <span>·</span>
                                  <span>{point.barrio}</span>
                                </div>
                                <h4 className="text-xs font-bold text-slate-900 mt-0.5 line-clamp-1">
                                  {point.name}
                                </h4>
                                <p className="text-[11px] text-slate-500 line-clamp-1">{point.address}</p>
                              </div>

                              <div className="mt-2.5 flex items-center gap-1.5 pt-2 border-t border-slate-100">
                                <button
                                  onClick={() => focusPointOnMap(point)}
                                  className="flex-1 py-1 px-2 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 text-[11px] font-bold flex items-center justify-center gap-1"
                                >
                                  <span>Ver en Mapa</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                                <a
                                  href={`tel:${point.phone}`}
                                  className="p-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold"
                                  title="Llamar"
                                >
                                  <Phone className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <span
                    className={`text-[10px] text-slate-400 mt-1 px-1 ${
                      isUser ? 'text-right' : 'text-left'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isLoading && (
            <div className="flex gap-3 max-w-[80%] mr-auto">
              <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-50 rounded-3xl rounded-tl-none p-4 border border-slate-100 flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">
                  Consultando la base de datos de Cali...
                </span>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-bounce" />
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Queries */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 overflow-x-auto no-scrollbar flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 shrink-0">Preguntas rápidas:</span>
          {SUGGESTED_QUERIES.map((query, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(query)}
              disabled={isLoading}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200/80 px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors shrink-0 shadow-xs"
            >
              {query}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 md:p-4 bg-white border-t border-slate-100">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Pregunta sobre albergues, veterinarias o acopio según tu ubicación..."
              aria-label="Escribe tu pregunta para el asistente"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isLoading}
              className="flex-1 py-3 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              aria-label="Enviar mensaje al asistente"
              title="Enviar mensaje"
              className="p-3 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 text-white rounded-2xl transition-all shadow-md shadow-orange-600/20 disabled:shadow-none flex items-center justify-center shrink-0 active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
