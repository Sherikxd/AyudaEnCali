import React, { useState, useMemo } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useApp } from '../context/AppContext';
import { HelpCategory, HelpNeed, NeedUrgency } from '../types';
import { CDN_IMAGES } from '../config/images';
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
  Sparkles,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  RotateCcw,
} from 'lucide-react';

export const BlogView: React.FC = () => {
  const { 
    helpNeeds, 
    supportNeed, 
    supportedNeedIds,
    setIsReportModalOpen, 
    setReportModalType,
    userProfile,
    openAuthModal,
    updateNeed,
    deleteNeed,
  } = useApp();

  // El apoyo exige cuenta: se usa solo para el texto de ayuda («inicia
  // sesión»). La puerta de identidad la pone `supportNeed` en el contexto.
  const { isSignedIn, user } = useUser();

  // Identidad de la sesión de Clerk: con ella se decide quién ve las
  // acciones de edición (el servidor exige el mismo `sub` en el JWT).
  const sessionId = user?.id ?? null;

  const [activeFilter, setActiveFilter] = useState<
    'all' | 'alta' | HelpCategory | 'resuelta' | 'archivada'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** Necesidad en edición y borrador de su formulario. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', description: '', urgency: 'media', items: '' });
  /** Necesidad con la eliminación pendiente de confirmación en línea. */
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  /** Evita dobles clics sobre las acciones del ciclo de vida. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const isOwnNeed = (need: HelpNeed): boolean =>
    !need.pending && sessionId !== null && need.authorId === sessionId;

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

      // Fuente de verdad: el `status` que devuelve el servidor (T10).
      if (activeFilter === 'all') return need.status !== 'resuelta' && need.status !== 'archivada';
      if (activeFilter === 'alta') return need.urgency === 'alta' && need.status !== 'resuelta' && need.status !== 'archivada';
      if (activeFilter === 'resuelta') return need.status === 'resuelta';
      if (activeFilter === 'archivada') return need.status === 'archivada';
      return need.category === activeFilter && need.status !== 'resuelta' && need.status !== 'archivada';
    });
  }, [helpNeeds, activeFilter, searchQuery]);

  const activeCount = useMemo(
    () => helpNeeds.filter((n) => n.status !== 'resuelta' && n.status !== 'archivada').length,
    [helpNeeds],
  );

  const startEdit = (need: HelpNeed) => {
    setConfirmingDeleteId(null);
    setEditingId(need.id);
    setDraft({
      title: need.title,
      description: need.description,
      urgency: need.urgency,
      items: need.items.join(', '),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (need: HelpNeed) => {
    if (busyId) return;
    const title = draft.title.trim();
    if (title.length < 5) {
      return; // El servidor exigiría 5 caracteres: no se gasta la llamada.
    }
    setBusyId(need.id);
    try {
      const ok = await updateNeed(need.id, {
        title,
        description: draft.description.trim(),
        urgency: draft.urgency as NeedUrgency,
        items: draft.items
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      });
      if (ok) setEditingId(null);
    } finally {
      setBusyId(null);
    }
  };

  /** Cambia el estado de la necesidad (`resuelta` ⇄ `activa`). */
  const toggleResolved = async (need: HelpNeed) => {
    if (busyId) return;
    setBusyId(need.id);
    try {
      await updateNeed(need.id, { status: need.status === 'resuelta' ? 'activa' : 'resuelta' });
    } finally {
      setBusyId(null);
    }
  };

  /** Retira el reporte del tablón sin borrarlo (o lo devuelve). */
  const toggleArchived = async (need: HelpNeed) => {
    if (busyId) return;
    setBusyId(need.id);
    try {
      await updateNeed(need.id, { status: need.status === 'archivada' ? 'activa' : 'archivada' });
    } finally {
      setBusyId(null);
    }
  };

  const removeNeed = async (need: HelpNeed) => {
    if (busyId) return;
    setBusyId(need.id);
    try {
      const ok = await deleteNeed(need.id);
      if (ok) {
        setConfirmingDeleteId(null);
        setEditingId((current) => (current === need.id ? null : current));
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleShare = (need: HelpNeed) => {
    const text = `🚨 Ayuda en Cali: ${need.title} (${need.barrio}). Contacto: ${need.contactPhone}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(need.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // ¿La cuenta actual ya apoyó esta necesidad? (corazón relleno)
  const isNeedSupported = (need: HelpNeed) => supportedNeedIds.includes(need.id);

  /**
   * Like conmutador: una sola acción por clic (`add` da el apoyo, `remove`
   * lo retira). Exige sesión de Clerk (T8): sin ella, `supportNeed` guarda
   * la acción para reanudarla en cuanto se entre y abre el flujo de ingreso
   * correspondiente.
   */
  const handleSupport = (need: HelpNeed) => {
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
            src={CDN_IMAGES.blogHero}
            alt="Panorama de Cali Solidaria"
            width={1376}
            height={768}
            decoding="async"
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
              Activas ({activeCount})
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

            <button
              onClick={() => setActiveFilter('archivada')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors whitespace-nowrap ${
                activeFilter === 'archivada'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              🗄 Archivadas
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
                        width={900}
                        height={672}
                        loading="lazy"
                        decoding="async"
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

                      {editingId === need.id ? (
                        <form
                          className="mt-3 space-y-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl p-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveEdit(need);
                          }}
                        >
                          <label className="block">
                            <span className="text-[11px] font-bold text-slate-600">Título</span>
                            <input
                              type="text"
                              value={draft.title}
                              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                              className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                              required
                              minLength={5}
                            />
                          </label>

                          <label className="block">
                            <span className="text-[11px] font-bold text-slate-600">Descripción</span>
                            <textarea
                              value={draft.description}
                              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                              rows={3}
                              className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                            />
                          </label>

                          <div className="flex flex-wrap gap-2">
                            <label className="block">
                              <span className="text-[11px] font-bold text-slate-600">Urgencia</span>
                              <select
                                value={draft.urgency}
                                onChange={(e) =>
                                  setDraft((d) => ({ ...d, urgency: e.target.value as NeedUrgency }))
                                }
                                className="mt-1 block px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                              >
                                <option value="alta">Alta</option>
                                <option value="media">Media</option>
                                <option value="baja">Baja</option>
                              </select>
                            </label>

                            <label className="block flex-1 min-w-[180px]">
                              <span className="text-[11px] font-bold text-slate-600">
                                Ítems (separados por coma)
                              </span>
                              <input
                                type="text"
                                value={draft.items}
                                onChange={(e) => setDraft((d) => ({ ...d, items: e.target.value }))}
                                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                              />
                            </label>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              disabled={busyId === need.id || draft.title.trim().length < 5}
                              className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition-colors"
                            >
                              {busyId === need.id ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
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
                        </>
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

                    {/* Acciones del ciclo de vida: solo para la persona que
                        publicó (autoría = `sub` del JWT, T10 · FEAT-01). */}
                    {isOwnNeed(need) && (
                      <div className="mt-3 pt-3 border-t border-dashed border-slate-200 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                          Tu publicación
                        </span>

                        <button
                          type="button"
                          onClick={() => (editingId === need.id ? cancelEdit() : startEdit(need))}
                          disabled={busyId === need.id}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>{editingId === need.id ? 'Cerrar edición' : 'Editar'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void toggleResolved(need)}
                          disabled={busyId === need.id}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                        >
                          {need.status === 'resuelta' ? (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reabrir</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Marcar resuelta</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => void toggleArchived(need)}
                          disabled={busyId === need.id}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                        >
                          {need.status === 'archivada' ? (
                            <>
                              <ArchiveRestore className="w-3.5 h-3.5" />
                              <span>Restaurar</span>
                            </>
                          ) : (
                            <>
                              <Archive className="w-3.5 h-3.5" />
                              <span>Archivar</span>
                            </>
                          )}
                        </button>

                        {confirmingDeleteId === need.id ? (
                          <span className="inline-flex items-center gap-2 text-xs">
                            <span className="text-rose-700 font-semibold">¿Eliminar definitivamente?</span>
                            <button
                              type="button"
                              onClick={() => void removeNeed(need)}
                              disabled={busyId === need.id}
                              className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-xs font-bold rounded-xl transition-colors"
                            >
                              Sí, eliminar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteId(null)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setConfirmingDeleteId(need.id);
                            }}
                            disabled={busyId === need.id}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </div>
                    )}
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
