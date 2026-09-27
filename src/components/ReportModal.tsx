import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { HelpCategory, NeedUrgency } from '../types';
import { CALI_BARRIOS } from '../data/initialData';
import { CALI_BARRIOS_DATA } from '../data/caliLocations';
import { 
  X, 
  MapPin, 
  User, 
  Check
} from 'lucide-react';

export const ReportModal: React.FC = () => {
  const {
    isReportModalOpen,
    setIsReportModalOpen,
    reportModalType,
    initialCoordsForNewPoint,
    setInitialCoordsForNewPoint,
    addHelpPoint,
    addHelpNeed,
    userLocation,
    userProfile,
    openAuthModal,
  } = useApp();

  // Mode: 'point' (Centro/Punto en mapa) or 'need' (Necesidad en el Tablón)
  const [formMode, setFormMode] = useState<'point' | 'need'>(reportModalType);

  useEffect(() => {
    setFormMode(reportModalType);
  }, [reportModalType]);

  // Form State for Point
  const [name, setName] = useState('');
  const [category, setCategory] = useState<HelpCategory>('acopio');
  const [barrio, setBarrio] = useState(CALI_BARRIOS[0]);
  const [comuna, setComuna] = useState('Comuna 3');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState(userProfile.phone || '+57 3');
  const [whatsapp, setWhatsapp] = useState('');
  const [contactPerson, setContactPerson] = useState(userProfile.name || '');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('Lunes a Sábado: 8:00 AM - 6:00 PM');
  const [urgentItems, setUrgentItems] = useState('Agua embotellada, Alimentos no perecederos');
  // Sin campo editable en el formulario: se envía un valor por defecto.
  const capacity = 'Capacidad activa';
  const [lat, setLat] = useState<number>(initialCoordsForNewPoint ? initialCoordsForNewPoint[0] : 3.4475);
  const [lng, setLng] = useState<number>(initialCoordsForNewPoint ? initialCoordsForNewPoint[1] : -76.5412);

  // Form State for Need
  const [needTitle, setNeedTitle] = useState('');
  const [needDescription, setNeedDescription] = useState('');
  const [needUrgency, setNeedUrgency] = useState<NeedUrgency>('alta');
  const [needItems, setNeedItems] = useState('Cobijas, Agua, Alimentos');

  useEffect(() => {
    if (initialCoordsForNewPoint) {
      setLat(initialCoordsForNewPoint[0]);
      setLng(initialCoordsForNewPoint[1]);
    } else if (userLocation) {
      setLat(userLocation.lat);
      setLng(userLocation.lng);
    }
  }, [initialCoordsForNewPoint, userLocation]);

  if (!isReportModalOpen) return null;

  const handleClose = () => {
    setIsReportModalOpen(false);
    setInitialCoordsForNewPoint(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formMode === 'point') {
      const itemsArray = urgentItems
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean);

      const cleanWhatsapp = (whatsapp || phone).replace(/[^0-9]/g, '');

      addHelpPoint({
        name,
        category,
        lat: Number(lat),
        lng: Number(lng),
        address,
        barrio,
        comuna,
        phone,
        whatsapp: cleanWhatsapp,
        contactPerson,
        description,
        schedule,
        status: 'abierto',
        urgentItems: itemsArray,
        capacity,
      });
    } else {
      const itemsArray = needItems
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean);

      addHelpNeed({
        title: needTitle,
        description: needDescription,
        category,
        urgency: needUrgency,
        barrio,
        contactName: contactPerson || userProfile.name,
        contactPhone: phone || userProfile.phone,
        items: itemsArray,
        status: 'activa',
      });
    }

    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              {formMode === 'point' ? 'Reportar Centro o Punto de Ayuda' : 'Publicar Necesidad Solidaria'}
            </h2>
            <p className="text-xs text-slate-500">
              Registra un punto visible en el mapa de Santiago de Cali
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!userProfile.isRegistered ? (
          <div className="p-6 sm:p-8 text-center my-auto">
            <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center mb-4 shadow-sm border border-amber-200/60">
              <User className="w-8 h-8" />
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              Para registrar una ayuda debes crear una cuenta
            </h3>
            <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
              En tu cuenta de prueba actual solo aparece: <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md font-mono">Usuario no aún creado</span>.
              Para garantizar la veracidad de los centros y necesidades en Cali, activa tu cuenta comunitaria.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 text-xs transition-colors"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  openAuthModal('Crea tu cuenta para poder registrar este centro en Cali.', () => {
                    setIsReportModalOpen(true);
                  });
                }}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs transition-colors shadow-md shadow-orange-600/20 flex items-center justify-center gap-2"
              >
                <span>Crear mi Cuenta Ahora</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab switch between Point vs Need */}
            <div className="px-5 pt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setFormMode('point')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                  formMode === 'point'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                📍 Centro / Punto en Mapa
              </button>
              <button
                type="button"
                onClick={() => setFormMode('need')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                  formMode === 'need'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                📋 Necesidad en Tablón
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Category Selector with the 4 user requested icons */}
          <div>
            <label className="block font-bold text-slate-800 mb-1.5">
              Tipo de Ayuda o Sector
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setCategory('acopio')}
                className={`p-2.5 rounded-2xl border text-center transition-all ${
                  category === 'acopio'
                    ? 'border-blue-500 bg-blue-50/80 text-blue-900 ring-2 ring-blue-400'
                    : 'border-slate-200 bg-slate-50 hover:bg-white text-slate-700'
                }`}
              >
                <div className="text-xl mb-0.5">🚚</div>
                <div className="font-bold text-[11px]">Acopio / Camión</div>
              </button>

              <button
                type="button"
                onClick={() => setCategory('veterinaria')}
                className={`p-2.5 rounded-2xl border text-center transition-all ${
                  category === 'veterinaria'
                    ? 'border-emerald-500 bg-emerald-50/80 text-emerald-900 ring-2 ring-emerald-400'
                    : 'border-slate-200 bg-slate-50 hover:bg-white text-slate-700'
                }`}
              >
                <div className="text-xl mb-0.5">🐾</div>
                <div className="font-bold text-[11px]">Veterinaria / Fauna</div>
              </button>

              <button
                type="button"
                onClick={() => setCategory('albergue')}
                className={`p-2.5 rounded-2xl border text-center transition-all ${
                  category === 'albergue'
                    ? 'border-amber-500 bg-amber-50/80 text-amber-900 ring-2 ring-amber-400'
                    : 'border-slate-200 bg-slate-50 hover:bg-white text-slate-700'
                }`}
              >
                <div className="text-xl mb-0.5">🏠</div>
                <div className="font-bold text-[11px]">Albergue / Refugio</div>
              </button>

              <button
                type="button"
                onClick={() => setCategory('salud')}
                className={`p-2.5 rounded-2xl border text-center transition-all ${
                  category === 'salud'
                    ? 'border-rose-500 bg-rose-50/80 text-rose-900 ring-2 ring-rose-400'
                    : 'border-slate-200 bg-slate-50 hover:bg-white text-slate-700'
                }`}
              >
                <div className="text-xl mb-0.5">🏥</div>
                <div className="font-bold text-[11px]">Emergencia Médica</div>
              </button>
            </div>
          </div>

          {formMode === 'point' ? (
            <>
              {/* Name */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Nombre del Centro o Punto de Acopio *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Centro de Acopio Las Banderas, Refugio Huellitas San Antonio..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Barrio & Comuna */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Barrio en Cali *</label>
                  <select
                    value={barrio}
                    onChange={(e) => {
                      const newB = e.target.value;
                      setBarrio(newB);
                      const bData = CALI_BARRIOS_DATA[newB];
                      if (bData) {
                        setComuna(bData.comuna);
                        if (!initialCoordsForNewPoint) {
                          setLat(bData.lat);
                          setLng(bData.lng);
                        }
                      }
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    {CALI_BARRIOS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Comuna / Sector</label>
                  <input
                    type="text"
                    placeholder="Ej. Comuna 19, Comuna 2, Zona Ladera"
                    value={comuna}
                    onChange={(e) => setComuna(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Exact Address */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">Dirección Exacta o Referencia *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Calle 5 # 34-00, Frente al Parque Panamericano"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Coordinates Preview */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between text-[11px] text-slate-600">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                  <span>
                    Coordenadas: <strong>{Number(lat).toFixed(4)}</strong>,{' '}
                    <strong>{Number(lng).toFixed(4)}</strong>
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">
                  (Haz clic en el mapa si deseas cambiar la posición exacta)
                </span>
              </div>

              {/* Phone & WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Teléfono de Contacto *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+57 315 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">WhatsApp de Coordinación</label>
                  <input
                    type="tel"
                    placeholder="3151234567"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Contact Person & Schedule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Persona Responsable</label>
                  <input
                    type="text"
                    placeholder="Ej. Carlos Giraldo / Hermana Teresa"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Horario de Atención</label>
                  <input
                    type="text"
                    placeholder="Ej. 24 Horas / Lunes a Sábado 8am - 6pm"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Urgent Items */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Insumos o Donaciones Requeridas (separados por coma)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Agua potable, Cobijas térmicas, Concentrado para perro, Gasas"
                  value={urgentItems}
                  onChange={(e) => setUrgentItems(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">Descripción y Detalles</label>
                <textarea
                  rows={3}
                  placeholder="Explica qué tipo de ayuda se coordina, cómo llegar y recomendaciones para voluntarios o donantes."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            </>
          ) : (
            <>
              {/* Need Title */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Título de la Necesidad Urgente *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Se requieren 30 cobijas y agua para familias damnificadas en Siloé"
                  value={needTitle}
                  onChange={(e) => setNeedTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Urgency & Barrio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Nivel de Prioridad *</label>
                  <select
                    value={needUrgency}
                    onChange={(e) => setNeedUrgency(e.target.value as NeedUrgency)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    <option value="alta">🚨 Alta (Atención inmediata en &lt; 24h)</option>
                    <option value="media">⚠️ Media (Requerido en 48-72h)</option>
                    <option value="baja">ℹ️ Baja / Campaña continua</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Barrio en Cali *</label>
                  <select
                    value={barrio}
                    onChange={(e) => setBarrio(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    {CALI_BARRIOS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Artículos requeridos (separados por coma) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. 10 colchonetas, 20 litros de agua, Pañales etapa 3"
                  value={needItems}
                  onChange={(e) => setNeedItems(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Persona de Contacto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Tu nombre o líder comunitario"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Teléfono / WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+57 312 345 6789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Need Description */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">Detalles de la Situación *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe la situación actual, cuántas personas o animales están afectados y lugar exacto de entrega."
                  value={needDescription}
                  onChange={(e) => setNeedDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold transition-colors shadow-md shadow-orange-600/25 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Publicar en AyudaEnCali</span>
            </button>
          </div>
        </form>
      </>
    )}
  </div>
</div>
);
};
