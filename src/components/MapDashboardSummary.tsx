import React, { useState, useMemo } from 'react';
import { HelpCategory, HelpPoint } from '../types';
import { 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle, 
  CheckCircle2, 
  RotateCcw,
} from 'lucide-react';

interface MapDashboardSummaryProps {
  helpPoints: HelpPoint[];
  selectedCategory: HelpCategory | 'all';
  onSelectCategory: (category: HelpCategory | 'all') => void;
  className?: string;
}

interface CategoryConfig {
  id: HelpCategory;
  nameSingle: string;
  namePlural: string;
  shortName: string;
  icon: string;
  accentColor: string;
  bgLight: string;
  borderActive: string;
  textBadge: string;
  description: string;
}

const CATEGORIES_CONFIG: CategoryConfig[] = [
  {
    id: 'veterinaria',
    nameSingle: 'Clínica Veterinaria',
    namePlural: 'Clínicas Veterinarias',
    shortName: 'Veterinarias',
    icon: '🐾',
    accentColor: 'text-emerald-700',
    bgLight: 'bg-emerald-50/90 hover:bg-emerald-100/90',
    borderActive: 'border-emerald-500 ring-2 ring-emerald-400/40 bg-emerald-50/80',
    textBadge: 'text-emerald-700 bg-emerald-100/80',
    description: 'Atención a mascotas y rescates',
  },
  {
    id: 'albergue',
    nameSingle: 'Albergue Temporal',
    namePlural: 'Albergues y Refugios',
    shortName: 'Albergues',
    icon: '🏠',
    accentColor: 'text-amber-700',
    bgLight: 'bg-amber-50/90 hover:bg-amber-100/90',
    borderActive: 'border-amber-500 ring-2 ring-amber-400/40 bg-amber-50/80',
    textBadge: 'text-amber-700 bg-amber-100/80',
    description: 'Hospedaje y techo de emergencia',
  },
  {
    id: 'acopio',
    nameSingle: 'Centro de Acopio',
    namePlural: 'Centros de Acopio',
    shortName: 'Acopio',
    icon: '🚚',
    accentColor: 'text-blue-700',
    bgLight: 'bg-blue-50/90 hover:bg-blue-100/90',
    borderActive: 'border-blue-500 ring-2 ring-blue-400/40 bg-blue-50/80',
    textBadge: 'text-blue-700 bg-blue-100/80',
    description: 'Víveres, donaciones y camiones',
  },
  {
    id: 'salud',
    nameSingle: 'Centro de Salud',
    namePlural: 'Emergencias Médicas',
    shortName: 'Salud',
    icon: '🏥',
    accentColor: 'text-rose-700',
    bgLight: 'bg-rose-50/90 hover:bg-rose-100/90',
    borderActive: 'border-rose-500 ring-2 ring-rose-400/40 bg-rose-50/80',
    textBadge: 'text-rose-700 bg-rose-100/80',
    description: 'Urgencias y puntos hospitalarios',
  },
];

export const MapDashboardSummary: React.FC<MapDashboardSummaryProps> = ({
  helpPoints,
  selectedCategory,
  onSelectCategory,
  className = '',
}) => {
  // Mobile devices (<768px) start collapsed to prevent map occlusion
  // Desktop screens (>=768px) start expanded for an immediate dashboard view
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return false;
  });

  // Real-time calculations
  const stats = useMemo(() => {
    const counts = {
      veterinaria: { total: 0, active: 0, open: 0, highDemand: 0 },
      albergue: { total: 0, active: 0, open: 0, highDemand: 0 },
      acopio: { total: 0, active: 0, open: 0, highDemand: 0 },
      salud: { total: 0, active: 0, open: 0, highDemand: 0 },
    };

    let totalActiveCount = 0;
    let totalHighDemandCount = 0;
    let verifiedCount = 0;

    helpPoints.forEach((point) => {
      const cat = point.category;
      if (counts[cat]) {
        counts[cat].total += 1;

        if (point.status !== 'cerrado') {
          counts[cat].active += 1;
          totalActiveCount += 1;

          if (point.status === 'abierto') {
            counts[cat].open += 1;
          } else if (point.status === 'alta_demanda') {
            counts[cat].highDemand += 1;
            totalHighDemandCount += 1;
          }
        }

        if (point.verified) {
          verifiedCount += 1;
        }
      }
    });

    return {
      counts,
      totalActiveCount,
      totalHighDemandCount,
      verifiedCount,
      totalPoints: helpPoints.length,
    };
  }, [helpPoints]);

  return (
    <div
      className={`bg-white/95 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-900/10 border border-slate-200/80 transition-all duration-300 overflow-hidden pointer-events-auto select-none ${className}`}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      aria-label="Resumen de centros de ayuda activos en tiempo real"
    >
      {/* Top Header Bar with Live Indicator & Expand/Collapse Toggle */}
      <div className="px-3 py-2 md:px-3.5 md:py-2.5 flex items-center justify-between border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-center gap-2">
          {/* Real-time Pulse Indicator */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
          </span>

          <div className="flex items-baseline gap-1.5">
            <h2 className="text-xs font-black text-slate-900 tracking-tight">
              Centros Activos
            </h2>
            <span className="text-[10px] md:text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-md">
              En vivo
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-800">
            {stats.totalActiveCount}{' '}
            <span className="font-normal text-slate-500 text-[11px]">activos</span>
          </span>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-orange-600 p-1 md:px-2 md:py-1 rounded-lg hover:bg-slate-200/60 transition-colors"
            title={isExpanded ? 'Ocultar panel' : 'Ver resumen completo'}
            aria-expanded={isExpanded}
          >
            <span className="hidden sm:inline">{isExpanded ? 'Ocultar' : 'Detalle'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Compact Quick Summary Strip (Always available when collapsed on mobile & desktop) */}
      {!isExpanded && (
        <div className="px-2.5 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* "Todos" Quick Pill */}
          <button
            type="button"
            onClick={() => onSelectCategory('all')}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 flex items-center gap-1 ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200/80'
            }`}
          >
            <span>Todos</span>
            <span className="font-mono text-[11px] opacity-80">({stats.totalPoints})</span>
          </button>

          {/* Category Count Quick Pills */}
          {CATEGORIES_CONFIG.map((cat) => {
            const count = stats.counts[cat.id].active;
            const isSelected = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(isSelected ? 'all' : cat.id)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 border ${
                  isSelected
                    ? `${cat.borderActive} shadow-xs font-extrabold`
                    : 'bg-slate-50/90 hover:bg-slate-100 border-slate-200/60 text-slate-700'
                }`}
                title={`Filtrar por ${cat.namePlural}`}
              >
                <span>{cat.icon}</span>
                <span className={`font-mono tabular-nums font-black ${cat.accentColor}`}>{count}</span>
                <span className="text-[11px] text-slate-600 font-medium">{cat.shortName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded Dashboard Content */}
      {isExpanded && (
        <div className="p-2.5 md:p-3 space-y-2.5 max-h-[50vh] md:max-h-none overflow-y-auto overscroll-contain">
          {/* 4 Real-time Category Cards Grid */}
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES_CONFIG.map((cat) => {
              const catStats = stats.counts[cat.id];
              const isSelected = selectedCategory === cat.id;
              const title = catStats.active === 1 ? cat.nameSingle : cat.namePlural;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(isSelected ? 'all' : cat.id)}
                  className={`text-left p-2.5 rounded-xl border transition-all relative overflow-hidden group touch-manipulation ${
                    isSelected
                      ? `${cat.borderActive} shadow-sm`
                      : `bg-slate-50/70 hover:bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs`
                  }`}
                  title={`Filtrar mapa por ${title}`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xl group-hover:scale-110 transition-transform">
                      {cat.icon}
                    </span>
                    <span
                      className={`font-mono text-base md:text-lg font-black tabular-nums ${
                        catStats.active > 0 ? cat.accentColor : 'text-slate-400'
                      }`}
                    >
                      {catStats.active}
                    </span>
                  </div>

                  <div className="mt-1">
                    <p className="text-[11px] font-bold text-slate-800 leading-tight line-clamp-1">
                      {catStats.active} {title}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-tight flex items-center gap-1">
                      {catStats.highDemand > 0 ? (
                        <span className="text-amber-700 font-semibold flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5 inline shrink-0" />
                          {catStats.highDemand} alta demanda
                        </span>
                      ) : catStats.open > 0 ? (
                        <span>{catStats.open} disponibles</span>
                      ) : (
                        <span>Sin centros activos</span>
                      )}
                    </p>
                  </div>

                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-600 ring-2 ring-orange-200"></div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Metrics Bar: Verificados, Alta Demanda, Reset Filter */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-y-1.5 gap-x-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1 text-slate-600 font-medium" title="Centros verificados en Cali">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{stats.verifiedCount} verificados</span>
              </span>

              {stats.totalHighDemandCount > 0 && (
                <span className="flex items-center gap-1 text-amber-700 font-medium" title="Centros con alta demanda de suministros">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{stats.totalHighDemandCount} alta demanda</span>
                </span>
              )}
            </div>

            {selectedCategory !== 'all' && (
              <button
                type="button"
                onClick={() => onSelectCategory('all')}
                className="flex items-center gap-1 text-orange-600 font-bold hover:text-orange-700 hover:underline cursor-pointer ml-auto"
                title="Mostrar todas las categorías"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Ver todos ({stats.totalPoints})</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
