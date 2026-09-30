import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CALI_BARRIOS, CALI_EMERGENCY_NUMBERS } from '../data/initialData';
import { UserRole } from '../types';
import { 
  User, 
  ShieldCheck, 
  Bookmark, 
  FileText, 
  Check, 
  Save, 
  PhoneCall, 
  ArrowRight,
  Plus,
  Navigation,
  Compass,
  HelpCircle,
  Cookie
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const { 
    userProfile, 
    updateUserProfile, 
    helpPoints, 
    focusPointOnMap, 
    toggleSavePoint,
    setIsReportModalOpen,
    setReportModalType,
    openAuthModal,
    logoutUser,
    userLocation,
    setIsLocationModalOpen,
    serverStatus,
    openFaq,
    cookieConsent,
  } = useApp();

  const consentLabel =
    cookieConsent === 'all'
      ? 'Opcionales aceptadas'
      : cookieConsent === 'essential'
        ? 'Solo esenciales'
        : 'Sin responder todavía';

  const [formData, setFormData] = useState({
    name: userProfile.name,
    email: userProfile.email,
    phone: userProfile.phone,
    barrio: userProfile.barrio,
    role: userProfile.role,
    organization: userProfile.organization || '',
  });

  const [isSavedNotification, setIsSavedNotification] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile(formData);
    setIsSavedNotification(true);
    setTimeout(() => setIsSavedNotification(false), 2500);
  };

  // Find saved points
  const savedPoints = helpPoints.filter((p) => userProfile.savedPointIds.includes(p.id));

  // Find reported points by this user
  const reportedPoints = helpPoints.filter(
    (p) => p.authorId === userProfile.id || userProfile.reportedPointIds.includes(p.id)
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-12">
      {/* Top Profile Banner */}
      <section className="bg-white border-b border-slate-100 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="w-20 h-20 rounded-3xl bg-orange-600 text-white flex items-center justify-center text-3xl font-extrabold shadow-lg shadow-orange-600/20 shrink-0">
            {userProfile.isRegistered ? userProfile.name.charAt(0) : '?'}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                {userProfile.isRegistered ? userProfile.name : 'Usuario no aún creado'}
              </h1>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                userProfile.isRegistered
                  ? 'bg-orange-50 text-orange-700 border-orange-200/60 capitalize'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {userProfile.isRegistered
                  ? (userProfile.role === 'coordinador'
                    ? 'Coordinador de Punto'
                    : userProfile.role === 'voluntario'
                    ? 'Voluntario Activo'
                    : 'Ciudadano Solidario')
                  : 'Cuenta de prueba: Usuario no aún creado'}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {userProfile.isRegistered
                ? `${userProfile.organization || 'Miembro de la comunidad AyudaEnCali'} · ${userProfile.barrio}, Cali`
                : 'Cuenta de prueba actual: Usuario no aún creado. Crea una cuenta para registrar ayudas y comentar en los centros.'}
            </p>

            <div className="mt-3 flex items-center justify-center sm:justify-start gap-4 text-xs font-semibold text-slate-600">
              <div>
                <strong className="text-slate-900 font-bold font-mono">{reportedPoints.length}</strong>{' '}
                Puntos reportados
              </div>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <div>
                <strong className="text-slate-900 font-bold font-mono">{savedPoints.length}</strong>{' '}
                Puntos guardados
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!userProfile.isRegistered ? (
              <button
                onClick={() => openAuthModal('Crea tu cuenta para comenzar a reportar y colaborar.')}
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Crear Cuenta</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setReportModalType('point');
                  setIsReportModalOpen(true);
                }}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Reportar Nuevo</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Form & Lists Grid */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Settings Form */}
        <div className="lg:col-span-2 space-y-6">
          {!userProfile.isRegistered ? (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center mb-3">
                <User className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Usuario no aún creado</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                Estás navegando en modo consulta. Para poder registrar centros de acopio, publicar necesidades urgentes o dejar comentarios con insumos actualizados, activa tu cuenta.
              </p>
              <button
                onClick={() => openAuthModal('Crea tu cuenta en segundos para participar.')}
                className="mt-4 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Crear mi Cuenta Comunitaria</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-orange-600" />
                  <span>Datos Personales y de Contacto</span>
                </h2>
                <button
                  type="button"
                  onClick={logoutUser}
                  className="text-xs text-slate-400 hover:text-rose-600 font-semibold transition-colors"
                >
                  Cerrar Sesión
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Completo</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono / WhatsApp</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Barrio Preferido en Cali</label>
                    <select
                      value={formData.barrio}
                      onChange={(e) => setFormData({ ...formData, barrio: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    >
                      {CALI_BARRIOS.map((barrio) => (
                        <option key={barrio} value={barrio}>
                          {barrio}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Rol en la Comunidad</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    >
                      <option value="ciudadano">Ciudadano Solidario</option>
                      <option value="voluntario">Voluntario Activo / Brigadista</option>
                      <option value="coordinador">Coordinador de Centro de Acopio o Albergue</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Organización / Colectivo</label>
                    <input
                      type="text"
                      placeholder="Ej. Defensa Civil, JAC San Antonio, Fundación..."
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Current Map Location Status */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                      <Navigation className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">Ubicación activa en mapa:</span>
                        <span className="text-xs font-extrabold text-orange-600">
                          {userLocation?.barrio || formData.barrio}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {userLocation ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : 'No configurada'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsLocationModalOpen(true)}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 flex items-center justify-center gap-1.5"
                  >
                    <Compass className="w-3.5 h-3.5 text-orange-600" />
                    <span>Configurar GPS / Barrio</span>
                  </button>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  {isSavedNotification ? (
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="w-4 h-4" /> ¡Perfil actualizado con éxito!
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">Tus datos están protegidos</span>
                  )}

                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Guardar Cambios</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Mis Puntos Reportados */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-orange-600" />
              <span>Mis Centros y Puntos Reportados ({reportedPoints.length})</span>
            </h2>

            {reportedPoints.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                Aún no has reportado ningún centro de ayuda. Puedes agregar uno en la pestaña Mapa.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {reportedPoints.map((point) => (
                  <div key={point.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{point.name}</h4>
                      <p className="text-[11px] text-slate-500">
                        {point.barrio} · {point.address}
                      </p>
                    </div>

                    <button
                      onClick={() => focusPointOnMap(point)}
                      className="px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold flex items-center gap-1 shrink-0"
                    >
                      <span>Ver en Mapa</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Puntos Guardados */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-orange-600" />
              <span>Puntos Guardados en Favoritos ({savedPoints.length})</span>
            </h2>

            {savedPoints.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                No tienes puntos guardados. Puedes guardar centros de acopio y veterinarias haciendo clic en el icono de guardar en el mapa.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {savedPoints.map((point) => (
                  <div key={point.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">
                        {point.category === 'acopio' && '🚚'}
                        {point.category === 'veterinaria' && '🐾'}
                        {point.category === 'albergue' && '🏠'}
                        {point.category === 'salud' && '🏥'}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{point.name}</h4>
                        <p className="text-[11px] text-slate-500">{point.barrio} · Tel: {point.phone}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => focusPointOnMap(point)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold"
                      >
                        Mapa
                      </button>
                      <button
                        onClick={() => toggleSavePoint(point.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600"
                        title="Quitar de guardados"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Direct Emergency Hotline Directory */}
        <div className="space-y-6">
          {/* Cloud Services Status Card */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Conexión en Producción</span>
            </h2>
            <p className="text-xs text-slate-500 mb-3.5">
              Estado de los servicios en la nube vinculados para AyudaEnCali (ayudaencali.lat):
            </p>

            <div className="space-y-2 text-xs">
              {/* Supabase status */}
              <div
                className={`p-3 rounded-2xl border flex items-start justify-between gap-3 ${
                  serverStatus.supabaseTablesReady
                    ? 'bg-emerald-50/60 border-emerald-200/60'
                    : serverStatus.supabaseConnected
                      ? 'bg-amber-50/60 border-amber-200/60'
                      : 'bg-slate-50/60 border-slate-200/60'
                }`}
              >
                <div>
                  <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        serverStatus.supabaseTablesReady
                          ? 'bg-emerald-500 animate-pulse'
                          : serverStatus.supabaseConnected
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                      }`}
                    />
                    Supabase Database
                  </span>
                  <span className="text-[11px] text-emerald-800/80 block mt-0.5">
                    {serverStatus.supabaseUrl ?? 'Sin proyecto configurado'}
                  </span>
                  {serverStatus.supabaseHint && (
                    <span className="text-[11px] text-amber-900/90 block mt-1.5 leading-snug">
                      {serverStatus.supabaseHint}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md whitespace-nowrap ${
                    serverStatus.supabaseTablesReady
                      ? 'bg-emerald-100 text-emerald-800'
                      : serverStatus.supabaseConnected
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {serverStatus.supabaseTablesReady
                    ? 'Conectado'
                    : serverStatus.supabaseConnected
                      ? 'Sin tablas'
                      : 'Offline'}
                </span>
              </div>

              {/* Carto status */}
              <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-200/60 flex items-center justify-between">
                <div>
                  <span className="font-bold text-blue-950 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        serverStatus.cartoConfigured ? 'bg-blue-500' : 'bg-slate-400'
                      }`}
                    />
                    Carto Maps Engine
                  </span>
                  <span className="text-[11px] text-blue-800/80 block mt-0.5">
                    Capa base del mapa · credencial gestionada en el servidor
                  </span>
                </div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                  {serverStatus.cartoConfigured ? 'Válido' : 'Sin clave'}
                </span>
              </div>

              {/* Gemini AI status */}
              <div className="p-3 rounded-2xl bg-orange-50/60 border border-orange-200/60 flex items-center justify-between">
                <div>
                  <span className="font-bold text-orange-950 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        serverStatus.hasGeminiKey ? 'bg-orange-500 animate-pulse' : 'bg-slate-400'
                      }`}
                    />
                    Google Gemini AI (SDK)
                  </span>
                  <span className="text-[11px] text-orange-800/80 block mt-0.5">
                    Asistente CaliSolidaria IA · credencial gestionada en el servidor
                  </span>
                </div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-orange-100 text-orange-800 rounded-md">
                  {serverStatus.hasGeminiKey ? 'Activo' : 'Sin clave'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-rose-600" />
              <span>Directorio Oficial de Emergencias Cali</span>
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Líneas vitales de respuesta rápida ante desastres, rescates médicos y emergencias de fauna en el Valle del Cauca.
            </p>

            <div className="space-y-2.5">
              {CALI_EMERGENCY_NUMBERS.map((emergency, idx) => (
                <a
                  key={idx}
                  href={`tel:${emergency.number.replace(/[^0-9]/g, '')}`}
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-rose-50 border border-slate-100 hover:border-rose-200 flex items-center justify-between transition-all group"
                >
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-rose-700">
                      {emergency.name}
                    </h4>
                    <p className="text-[11px] text-slate-500">{emergency.desc}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono tabular-nums text-xs font-extrabold text-rose-600 bg-white px-2.5 py-1 rounded-xl shadow-xs border border-rose-100">
                      {emergency.number}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* Quick Info Box on Mutual Aid */}
          <div className="bg-orange-50/70 rounded-3xl p-5 border border-orange-200/60">
            <h3 className="text-xs font-bold text-orange-950 flex items-center gap-1.5 mb-1.5">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              <span>Compromiso Caleño Solidario</span>
            </h3>
            <p className="text-xs text-orange-900/80 leading-relaxed">
              AyudaEnCali es una iniciativa abierta para articular esfuerzos ciudadanos, fundaciones y brigadas de rescate. Verifica siempre con los números de contacto antes de despachar vehículos de carga.
            </p>
          </div>
        </div>
      </div>

      {/* Ayuda y privacidad: atajos al FAQ y a la configuración de cookies */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 mb-4 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100">
        <button
          type="button"
          onClick={() => openFaq()}
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <HelpCircle className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-900">Preguntas frecuentes</p>
            <p className="text-[11px] text-slate-500">
              Cuentas, reportes, apoyos, asistente y privacidad
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => openFaq('cookies')}
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Cookie className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-900">Cookies y privacidad</p>
            <p className="text-[11px] text-slate-500">{consentLabel}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
        </button>
      </div>
    </div>
  );
};
