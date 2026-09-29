import React, { useState, useMemo } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import { useApp } from '../context/AppContext';
import { HelpCategory, HelpNeed } from '../types';
import { 
  Plus, 
  Search, 
  Heart, 
  Share2, 
  Phone, 
  MessageCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Sparkles
} from 'lucide-react';

export const BlogView: React.FC = () => {
  const { 
    helpNeeds, 
    supportNeed, 
    supportedNeedIds,
    setIsReportModalOpen, 
    setReportModalType,
    userProfile,
    openAuthModal
  } = useApp();

  // El apoyo exige cuenta: sin sesión de Clerk se abre el inicio de sesión.
  const { isSignedIn } = useUser();
  const { openSignIn } = useClerk();

  const [activeFilter, setActiveFilter] = useState<'all' | 'alta' | HelpCategory | 'resuelta'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredNeeds = useMemo(() => {
    return helpNeeds.filter((need) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        need.title.toLowerCase().includes(q) ||
        need.description.toLowerCase().includes(q) ||
        need.barrio.toLowerCase().includes(q) ||
        need.items.some((item) => item.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (activeFilter === 'all') return need.status !== 'resuelta';
      if (activeFilter === 'alta') return need.urgency === 'alta' && need.status !== 'resuelta';
      if (activeFilter === 'resuelta') return need.status === 'resuelta';
      return need.category === activeFilter && need.status !== 'resuelta';
    });
  }, [helpNeeds, activeFilter, searchQuery]);

  const handleShare = (need: HelpNeed) => {
    const text = `🚨 Ayuda en Cali: ${need.title} (${need.barrio}). Contacto: ${need.contactPhone}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(need.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  /** ¿La cuenta actual ya apoyó esta necesidad? (corazón relleno) */
  const isNeedSupported = (need: HelpNeed) => supportedNeedIds.includes(need.id);

  /**
   * Like conmutador: una sola acción por clic (`add` da el apoyo, `remove`
   * lo retira). Sin cuenta de Clerk se abre el inicio de sesión de la app.
   */
  const handleSupport = (need: HelpNeed) => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    void supportNeed(need.id, isNeedSupported(need) ? 'remove' : 'add');
  };

  const handleOpenReport = () => {
    if (!userProfile.isRegistered) {
      openAuthModal('Para publicar una necesidad en el tablón comunitario debes crear tu cuenta.', () => {
        setReportModalType('need');
        setIsReportModalOpen(true);
      });
      return;
    }
    setReportModalType('need');
    setIsReportModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-12">
      {/* Editorial Hero Header */}
      <section className="relative bg-slate-900 text-white overflow-hidden py-10 md:py-14 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 opacity-25">
          <img
            src="/images/cali_relief_banner_1790469947561.jpg"
            alt="Panorama de Cali Solidaria"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-transparent" />
        </div>

        <div className="relative max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-bold text-orange-400 mb-2 tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tablón Comunitario de Ayuda y Emergencias</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white text-balance leading-tight">
              Reportes de Necesidades y Ayudas en Santiago de Cali
            </h1>
            <p className="mt-3 text-sm md:text-base text-slate-300 leading-relaxed text-balance">
              Espacio solidario y colaborativo donde fundaciones, brigadistas y ciudadanos caleños
              visibilizan insumos requeridos en albergues, veterinarias y centros de acopio.
            </p>
          </div>

          <button
            onClick={handleOpenReport}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold shadow-lg shadow-orange-600/30 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span>Publicar Necesidad</span>
          </button>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-5">
        {/* Search & Filter Controls */}
        <div className="bg-white rounded-3xl p-4 md:p-6 shadow-md shadow-slate-900/5 border border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por barrio (Siloé, San Antonio, Meléndez) o insumos (cobijas, comida)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs md:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            />
          </div>

          {/* Segmented Filter Controls */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar shrink-0">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
                activeFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Activas ({helpNeeds.filter((n) => n.status !== 'resuelta').length})
            </button>

            <button
              onClick={() => setActiveFilter('alta')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap flex items-center gap-1 ${
                activeFilter === 'alta'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Prioridad Alta</span>
            </button>

            <button
              onClick={() => setActiveFilter('veterinaria')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
                activeFilter === 'veterinaria'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              🐾 Mascotas
            </button>

            <button
              onClick={() => setActiveFilter('albergue')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
                activeFilter === 'albergue'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              🏠 Albergues
            </button>

            <button
              onClick={() => setActiveFilter('acopio')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
                activeFilter === 'acopio'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              🚚 Acopio
            </button>

            <button
              onClick={() => setActiveFilter('resuelta')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
                activeFilter === 'resuelta'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              ✓ Resueltas
            </button>
          </div>
        </div>

        {/* Needs Feed List */}
        <div className="mt-8 space-y-5">
          {filteredNeeds.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-sm font-bold text-slate-800">No se encontraron reportes con estos criterios</p>
              <p className="text-xs text-slate-500 mt-1">
                Puedes cambiar el filtro o ser el primero en publicar una necesidad comunitaria.
              </p>
              <button
                onClick={handleOpenReport}
                className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold"
              >
                + Publicar Reporte
              </button>
            </div>
          ) : (
            filteredNeeds.map((need) => {
              const isResolved = need.status === 'resuelta';
              return (
                <article
                  key={need.id}
                  className="bg-white rounded-3xl p-5 md:p-6 shadow-sm hover:shadow-md transition-shadow border border-slate-100 flex flex-col md:flex-row gap-5"
                >
                  {/* Optional Image */}
                  {need.imageUrl && (
                    <div className="w-full md:w-52 h-44 rounded-2xl overflow-hidden bg-slate-100 shrink-0 relative">
                      <img
                        src={need.imageUrl}
                        alt={need.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-bold backdrop-blur-sm">
                        {need.category === 'veterinaria' && '🐾 Veterinaria'}
                        {need.category === 'albergue' && '🏠 Albergue'}
                        {need.category === 'acopio' && '🚚 Acopio'}
                        {need.category === 'salud' && '🏥 Emergencia'}
                      </div>
                    </div>
                  )}

                  {/* Body Content */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      {/* Quiet Unboxed Metadata */}
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5 flex-wrap">
                        <span className="font-bold text-slate-700">{need.barrio}</span>
                        <span aria-hidden="true">·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>
                            {new Date(need.createdAt).toLocaleDateString('es-CO', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            need.urgency === 'alta'
                              ? 'text-rose-600'
                              : need.urgency === 'media'
                              ? 'text-amber-600'
                              : 'text-slate-500'
                          }`}
                        >
                          {need.urgency === 'alta'
                            ? 'Urgencia Alta'
                            : need.urgency === 'media'
                            ? 'Urgencia Media'
                            : 'Normal'}
                        </span>
                        {isResolved && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Resuelto
                            </span>
                          </>
                        )}
                      </div>

                      <h2 className="text-base md:text-lg font-bold text-slate-900 leading-snug">
                        {need.title}
                      </h2>

                      <p className="mt-2 text-xs md:text-sm text-slate-600 leading-relaxed">
                        {need.description}
                      </p>

                      {/* Required Items Badges */}
                      {need.items && need.items.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                          <span className="text-[11px] font-bold text-slate-500 mr-1">Se requiere:</span>
                          {need.items.map((item, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] font-medium text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/60"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer Actions: Contact, WhatsApp, Support Counter */}
                    <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">
                          Coordinador:{' '}
                          <strong className="text-slate-800 font-semibold">{need.contactName}</strong>
                        </span>

                        <button
                          type="button"
                          onClick={() => handleSupport(need)}
                          aria-pressed={isNeedSupported(need)}
                          aria-label={
                            isNeedSupported(need)
                              ? `Retirar tu apoyo de ${need.title}`
                              : `Apoyar ${need.title}`
                          }
                          title={
                            isNeedSupported(need)
                              ? 'Retirar tu apoyo'
                              : isSignedIn
                                ? 'Apoyar esta necesidad'
                                : 'Inicia sesión para apoyar'
                          }
                          className={`flex items-center gap-1.5 text-xs transition-colors px-2.5 py-1 rounded-xl ${
                            isNeedSupported(need)
                              ? 'text-rose-600 bg-rose-50'
                              : 'text-slate-600 hover:text-rose-600 bg-slate-50 hover:bg-rose-50'
                          }`}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${isNeedSupported(need) ? 'text-rose-600' : 'text-rose-500'}`}
                            fill={isNeedSupported(need) ? 'currentColor' : 'none'}
                          />
                          <span className="font-mono tabular-nums font-semibold">
                            {need.supportersCount} apoyos
                          </span>
                          {!isSignedIn && (
                            <span className="text-slate-400">· inicia sesión</span>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleShare(need)}
                          title="Copiar información para compartir"
                          className="p-2 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-xs font-semibold flex items-center gap-1"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>{copiedId === need.id ? 'Copiado' : 'Compartir'}</span>
                        </button>

                        <a
                          href={`tel:${need.contactPhone}`}
                          className="p-2 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                          title="Llamar"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>

                        <a
                          href={`https://wa.me/${need.contactPhone.replace(/[^0-9]/g, '')}?text=Hola,%20vi%20el%20reporte%20en%20AyudaEnCali:%20"${encodeURIComponent(
                            need.title
                          )}"%20y%20deseo%20colaborar.`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-sm shadow-emerald-600/20"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Ofrecer Ayuda</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
