import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CALI_BARRIOS_DATA as BARRIOS } from '../data/caliLocations';
import {
  MapPin,
  Crosshair,
  Search,
  Check,
  X,
  AlertCircle,
  Navigation,
  Compass,
} from 'lucide-react';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({ isOpen, onClose }) => {
  const {
    userLocation,
    setUserBarrioLocation,
    requestUserLocation,
    isLocatingUser,
    locationError,
    setActiveTab,
  } = useApp();

  const [filterQuery, setFilterQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const zones = ['all', 'Norte', 'Sur', 'Centro / Oeste', 'Oriente', 'Ladera'] as const;

  const filteredBarrios = Object.values(BARRIOS).filter((barrio) => {
    const matchesQuery =
      barrio.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      barrio.comuna.toLowerCase().includes(filterQuery.toLowerCase());
    const matchesZone = selectedZone === 'all' || barrio.zona === selectedZone;
    return matchesQuery && matchesZone;
  });

  const handleSelectBarrio = (barrioName: string) => {
    setUserBarrioLocation(barrioName);
    setSuccessMessage(`¡Ubicación actualizada a ${barrioName}!`);
    setTimeout(() => {
      setSuccessMessage(null);
      onClose();
    }, 900);
  };

  const handleGpsLocate = async () => {
    setSuccessMessage(null);
    const result = await requestUserLocation();
    if (result.success) {
      setSuccessMessage('¡Ubicación GPS detectada correctamente!');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1000);
    }
  };

  const handleGoToMap = () => {
    setActiveTab('map');
    onClose();
  };

  const getSourceBadge = () => {
    if (!userLocation) return null;
    switch (userLocation.source) {
      case 'gps':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            GPS Satelital
          </span>
        );
      case 'barrio_selection':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
            Barrio Seleccionado
          </span>
        );
      case 'map_pin':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
            Fijado en Mapa
          </span>
        );
      case 'profile':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            Perfil de Usuario
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            Predeterminada
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/20 shrink-0">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                Registrar y Ajustar Mi Ubicación
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Calcula distancias exactas a los centros de ayuda en Cali
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

        {/* Current Location Status Card */}
        <div className="p-5 space-y-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {userLocation?.barrio || 'Sin registrar'}
                  </span>
                  {getSourceBadge()}
                </div>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  {userLocation
                    ? `Coordenadas: ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`
                    : 'Ubicación no establecida'}
                </p>
              </div>
            </div>
          </div>

          {/* Success or Error Feedback */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-800 font-semibold animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {locationError && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Aviso sobre GPS:</p>
                <p className="mt-0.5 text-[11px] text-amber-800">{locationError}</p>
                <p className="mt-1 text-[11px] font-semibold text-amber-900">
                  👉 Puedes seleccionar tu barrio a continuación o fijar tu ubicación en el mapa.
                </p>
              </div>
            </div>
          )}

          {/* Action 1: GPS Detection Button */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={handleGpsLocate}
              disabled={isLocatingUser}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-2xl text-xs font-bold shadow-sm shadow-blue-600/20 flex items-center justify-center gap-2 transition-all active:scale-98"
            >
              <Crosshair className={`w-4 h-4 ${isLocatingUser ? 'animate-spin' : ''}`} />
              <span>{isLocatingUser ? 'Obteniendo GPS de Cali...' : 'Detectar con GPS Automático'}</span>
            </button>

            <button
              type="button"
              onClick={handleGoToMap}
              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Compass className="w-4 h-4 text-slate-500" />
              <span>Fijar en Mapa</span>
            </button>
          </div>

          {/* Action 2: Choose Barrio in Cali */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-orange-600" />
                <span>O selecciona tu barrio en Cali:</span>
              </span>
              <span className="text-[11px] text-slate-400">{filteredBarrios.length} barrios</span>
            </div>

            {/* Barrio search input */}
            <div className="relative mb-2.5">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Buscar barrio o comuna..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            {/* Zone Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none text-[11px]">
              {zones.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => setSelectedZone(zone)}
                  className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors ${
                    selectedZone === zone
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {zone === 'all' ? 'Todas las Zonas' : zone}
                </button>
              ))}
            </div>

            {/* Barrio List Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1 mt-1">
              {filteredBarrios.map((barrio) => {
                const isSelected = userLocation?.barrio === barrio.name;
                return (
                  <button
                    key={barrio.name}
                    type="button"
                    onClick={() => handleSelectBarrio(barrio.name)}
                    className={`p-2.5 text-left rounded-xl border text-xs transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-orange-50 border-orange-300 text-orange-950 font-bold shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="truncate">{barrio.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-orange-600 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal mt-1">
                      {barrio.comuna} · {barrio.zona}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer tip */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>💡 También puedes arrastrar el pin azul en el mapa</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
