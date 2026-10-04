import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
// El CSS de Leaflet viaja con este chunk: antes venía de un CDN en el <head>
// y bloqueaba el render de TODAS las pestañas, incluso sin mapa.
import 'leaflet/dist/leaflet.css';
import { useUser } from '@clerk/clerk-react';
import { useApp, useMapUI } from '../context/AppContext';
import { HelpCategory, HelpPoint, PointStatus } from '../types';
import { MapDashboardSummary } from './MapDashboardSummary';
import { escapeHtml } from '../utils/sanitize';
import { isApproximateOrigin } from '../utils/proximity';
import { 
  Search, 
  Crosshair, 
  Phone, 
  MessageCircle, 
  Navigation, 
  Clock, 
  MapPin, 
  AlertCircle, 
  ChevronRight, 
  Bookmark, 
  Layers, 
  Loader2, 
  Compass, 
  SlidersHorizontal,
  CheckCircle2,
  Pencil,
  Trash2,
} from 'lucide-react';

type MapLayerType = 'streets' | 'light' | 'satellite';

/**
 * MEJ-02 · «Cerca de mí»: radio del filtro optativo por proximidad (en km).
 * Cali mide ~20 km de norte a sur, así que 5 km cubre la zona central sin
 * vaciar el listado. El filtro está **apagado por defecto**: el orden por
 * defecto es el de siempre.
 */
const NEAR_ME_MAX_KM = 5;

const MAP_LAYERS: Record<MapLayerType, { name: string; url: string; subdomains?: string; maxZoom: number }> = {
  streets: {
    name: 'Calles Cali (Sin Marca)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 19,
  },
  light: {
    name: 'Limpio Rappi',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
  },
  satellite: {
    name: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
  },
};

// Custom SVG Icons for Leaflet markers matching the exact user requirements:
// 🐾 Patitas para animales
// 🏠 Casas para albergues
// 🏥 Hospitales para emergencias médicas
// 🚚 Camiones para donde están recogiendo ayuda
/**
 * Icono de un punto. `name` (el nombre del punto) se usa como nombre
 * accesible del marcador: Leaflet crea un `<div>` (no un `<img>`), así que
 * su `alt` de opciones no llega al DOM y el texto alternativo va en el
 * `aria-label` del propio icono (SEO-11).
 */
const createMarkerIcon = (category: HelpCategory, isSelected: boolean = false, verified: boolean = false, name?: string) => {
  const configs = {
    acopio: {
      bg: 'bg-blue-600',
      border: isSelected ? 'ring-4 ring-blue-300 scale-110' : 'ring-2 ring-white',
      shadow: 'shadow-md shadow-blue-600/30',
      label: 'Acopio',
      svg: `
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
          <path d="M15 18H9"/>
          <path d="M19 18h2a1 1 0 0 0 1-1v-5l-3-4h-5v10Z"/>
          <circle cx="7" cy="18" r="2"/>
          <circle cx="17" cy="18" r="2"/>
        </svg>
      `,
    },
    veterinaria: {
      bg: 'bg-emerald-600',
      border: isSelected ? 'ring-4 ring-emerald-300 scale-110' : 'ring-2 ring-white',
      shadow: 'shadow-md shadow-emerald-600/30',
      label: 'Veterinaria',
      svg: `
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="7.5" cy="8.5" r="2.2"/>
          <circle cx="16.5" cy="8.5" r="2.2"/>
          <circle cx="4.5" cy="13.5" r="1.8"/>
          <circle cx="19.5" cy="13.5" r="1.8"/>
          <path d="M12 11.5c-3 0-5 2.2-5 4.8 0 2.2 2 3.7 5 3.7s5-1.5 5-3.7c0-2.6-2-4.8-5-4.8z"/>
        </svg>
      `,
    },
    albergue: {
      bg: 'bg-amber-600',
      border: isSelected ? 'ring-4 ring-amber-300 scale-110' : 'ring-2 ring-white',
      shadow: 'shadow-md shadow-amber-600/30',
      label: 'Albergue',
      svg: `
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>
          <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        </svg>
      `,
    },
    salud: {
      bg: 'bg-rose-600',
      border: isSelected ? 'ring-4 ring-rose-300 scale-110' : 'ring-2 ring-white',
      shadow: 'shadow-md shadow-rose-600/30',
      label: 'Emergencias',
      svg: `
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 6v12"/>
          <path d="M6 12h12"/>
        </svg>
      `,
    },
  };

  const c = configs[category] || configs.acopio;

  const ariaLabel = `${name ? `${name} — ` : ''}${c.label}${verified ? ' (punto verificado)' : ''}`;

  const html = `
    <div class="relative group cursor-pointer transition-transform duration-200" aria-label="${escapeHtml(ariaLabel)}">
      <div class="w-10 h-10 rounded-2xl ${c.bg} ${c.border} ${c.shadow} flex items-center justify-center transition-all duration-200">
        ${c.svg}
      </div>
      ${
        verified
          ? `<span class="absolute -top-2 -right-2 flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-md" title="Punto verificado">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
             </span>`
          : ''
      }
      <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 ${c.bg} rotate-45"></div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-cali-pin',
    html,
    iconSize: [40, 42],
    iconAnchor: [20, 42],
    popupAnchor: [0, -42],
  });
};

/* ------------------------------------------------------------------ *
 * Agrupación de marcadores (T16 · FEAT-11)
 *
 * Sin dependencia nueva (`leaflet.markercluster` no está en `package.json`
 * y este área no lo gestiona): agrupamiento manual por celda, con el mismo
 * efecto visual. Por encima de `CLUSTER_MAX_ZOOM` todo se pinta suelto, y
 * pulsar un cúmulo acerca el mapa hasta que se reparta en individuales.
 * ------------------------------------------------------------------ */

/** Zoom a partir del cual los puntos se pintan uno a uno. */
const CLUSTER_MAX_ZOOM = 13;
/** Tamaño (en grados) de la celda de agrupación al zoom 10. */
const CLUSTER_CELL_DEG_AT_10 = 0.02;

interface PointGroup {
  points: HelpPoint[];
}

/**
 * Reparte los puntos en celdas de cuadrícula según el zoom. Los cúmulos de
 * un solo punto se devuelven igual (el render los pinta como marcador normal),
 * así que a partir de `CLUSTER_MAX_ZOOM` el comportamiento es el de siempre.
 * El punto seleccionado se excluye para que nunca quede escondido dentro de
 * un cúmulo.
 *
 * Exportada para poder verificarla sin navegador (T16).
 */
export const groupPointsForZoom = (
  points: readonly HelpPoint[],
  zoom: number,
  selectedId: string | undefined,
): PointGroup[] => {
  const toGroup = selectedId ? points.filter((point) => point.id !== selectedId) : points;

  if (zoom > CLUSTER_MAX_ZOOM) {
    return toGroup.map((point) => ({ points: [point] }));
  }

  // Cada zoom mitad la celda: menos zoom, cúmulos más grandes.
  const cell = Math.min(CLUSTER_CELL_DEG_AT_10 * 2 ** (10 - zoom), 1);
  const cells = new Map<string, PointGroup>();

  for (const point of toGroup) {
    const key = `${Math.floor(point.lat / cell)}:${Math.floor(point.lng / cell)}`;
    const existing = cells.get(key);
    if (existing) existing.points.push(point);
    else cells.set(key, { points: [point] });
  }

  return [...cells.values()];
};

/** Punto medio de un cúmulo (dónde se ancla su icono). */
const groupCenter = (group: PointGroup): [number, number] => {
  const total = group.points.length;
  const lat = group.points.reduce((sum, point) => sum + point.lat, 0) / total;
  const lng = group.points.reduce((sum, point) => sum + point.lng, 0) / total;
  return [lat, lng];
};

/** Icono circular con el nº de puntos del cúmulo. */
const createClusterIcon = (count: number) =>
  L.divIcon({
    className: 'custom-cali-cluster',
    html: `
      <div class="flex items-center justify-center w-11 h-11 rounded-full bg-slate-900/85 text-white border-2 border-white shadow-lg shadow-slate-900/30" aria-label="${count} puntos de ayuda agrupados en esta zona">
        <span class="text-xs font-extrabold tabular-nums">${count}</span>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

const userLocationIcon = L.divIcon({
  className: 'user-location-pin',
  html: `
    <div class="relative flex items-center justify-center" aria-label="Tu ubicación en el mapa">
      <div class="w-7 h-7 rounded-full bg-blue-500/20 animate-ping absolute"></div>
      <div class="w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center">
        <div class="w-2 h-2 rounded-full bg-white"></div>
      </div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export const MapView: React.FC = () => {
  const {
    helpPoints,
    userLocation,
    requestUserLocation,
    isLocatingUser,
    setIsLocationModalOpen,
    setUserCustomCoordinates,
    calculateDistance,
    setIsReportModalOpen,
    setReportModalType,
    toggleSavePoint,
    userProfile,
    pointComments,
    addPointComment,
    openAuthModal,
    setActiveTab,
    updatePoint,
    deletePoint,
  } = useApp();
  // Vista del mapa (T12): contexto aparte para que seleccionar un punto
  // no re-renderice el tablón, el chat ni la cabecera.
  const {
    selectedPoint,
    setSelectedPoint,
    mapCenter,
    mapZoom,
    setInitialCoordsForNewPoint,
  } = useMapUI();

  // Identidad de la sesión de Clerk: gobierna qué puntos muestran las
  // acciones de edición (el servidor exige ese mismo `sub` en el JWT, T10).
  const { user } = useUser();
  const sessionId = user?.id ?? null;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<HelpCategory | 'all'>('all');
  // Búsqueda inicial opcional desde la URL (`/?q=…`), útil para compartir una
  // consulta del mapa; no se anuncia como un SearchAction de datos estructurados.
  const [searchQuery, setSearchQuery] = useState(
    () => new URLSearchParams(window.location.search).get('q') ?? '',
  );
  /**
   * MEJ-02 · orden/filtro optativo por distancia: apagado por defecto para
   * conservar el orden actual; activo, lista y mapa muestran primero lo que
   * está a menos de `NEAR_ME_MAX_KM` km, del más cercano al más lejano.
   */
  const [nearMeOnly, setNearMeOnly] = useState(false);
  const [showListViewDesktop, setShowListViewDesktop] = useState(true);
  const [currentLayer, setCurrentLayer] = useState<MapLayerType>('streets');
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  // Zoom real del mapa: gobierna la agrupación de marcadores (T16). Se
  // actualiza en `zoomend` para repintar los cúmulos al acercar/alejar.
  const [mapZoomLevel, setMapZoomLevel] = useState<number>(mapZoom);

  // Selected point comment input
  const [commentInput, setCommentInput] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);

  // Ciclo de vida del punto propio (T10 · FEAT-01): edición en línea dentro
  // de la ficha y borrado con confirmación visible.
  const [isEditingPoint, setIsEditingPoint] = useState(false);
  const [confirmingDeletePoint, setConfirmingDeletePoint] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [pointDraft, setPointDraft] = useState({
    name: '',
    address: '',
    schedule: '',
    description: '',
    status: 'abierto' as PointStatus,
    urgentItems: '',
  });

  // La ficha cambia de punto: se descartan edición y confirmación pendientes.
  useEffect(() => {
    setIsEditingPoint(false);
    setConfirmingDeletePoint(false);
  }, [selectedPoint?.id]);

  /** Solo la persona que publicó el punto ve las acciones de ciclo de vida. */
  const isOwnPoint =
    selectedPoint !== null && !selectedPoint.pending && sessionId !== null && selectedPoint.authorId === sessionId;

  const startPointEdit = (point: HelpPoint) => {
    setPointDraft({
      name: point.name,
      address: point.address,
      schedule: point.schedule,
      description: point.description,
      status: point.status,
      urgentItems: point.urgentItems.join(', '),
    });
    setConfirmingDeletePoint(false);
    setIsEditingPoint(true);
  };

  const savePointEdit = async () => {
    if (!selectedPoint || lifecycleBusy) return;
    const name = pointDraft.name.trim();
    const address = pointDraft.address.trim();
    if (name.length < 3 || address.length < 3) return; // El servidor rechazaría estos mínimos.

    setLifecycleBusy(true);
    try {
      const ok = await updatePoint(selectedPoint.id, {
        name,
        address,
        schedule: pointDraft.schedule.trim(),
        description: pointDraft.description.trim(),
        status: pointDraft.status,
        urgentItems: pointDraft.urgentItems
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      });
      if (ok) setIsEditingPoint(false);
    } finally {
      setLifecycleBusy(false);
    }
  };

  const removeSelectedPoint = async () => {
    if (!selectedPoint || lifecycleBusy) return;
    setLifecycleBusy(true);
    try {
      const ok = await deletePoint(selectedPoint.id);
      if (ok) setConfirmingDeletePoint(false);
    } finally {
      setLifecycleBusy(false);
    }
  };

  // Filtered points
  const filteredPoints = useMemo(() => {
    const base = helpPoints.filter((point) => {
      const matchCat = selectedCategory === 'all' || point.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        point.name.toLowerCase().includes(q) ||
        point.barrio.toLowerCase().includes(q) ||
        point.comuna.toLowerCase().includes(q) ||
        point.description.toLowerCase().includes(q) ||
        point.urgentItems.some((item) => item.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });

    // MEJ-02: «Cerca de mí» es optativo y, mientras esté apagado, el orden
    // es exactamente el de siempre (el del servidor/la fusión).
    if (!nearMeOnly) return base;

    const ranked = base
      .map((point, index) => ({ point, index, km: calculateDistance(point.lat, point.lng) }))
      // Sin ubicación no se filtra (no se esconden datos sin poder medirlos).
      .filter((entry) => entry.km === null || entry.km <= NEAR_ME_MAX_KM);
    ranked.sort((a, b) => {
      if (a.km === null && b.km === null) return a.index - b.index;
      if (a.km === null) return 1;
      if (b.km === null) return -1;
      return a.km === b.km ? a.index - b.index : a.km - b.km;
    });
    return ranked.map((entry) => entry.point);
    // `calculateDistance` mide contra `userLocation`: si cambia la ubicación
    // hay que reordenar.
  }, [helpPoints, selectedCategory, searchQuery, nearMeOnly, calculateDistance, userLocation]);

  /** ¿La distancia de la lista es aproximada (origen en centroide, MEJ-02)? */
  const distanceIsApprox = isApproximateOrigin(userLocation);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: mapCenter,
        zoom: mapZoom,
        zoomControl: false,
        attributionControl: false, // Disables all watermark banners
      });

      // Pure clean tile layer with ZERO watermark
      const layerConfig = MAP_LAYERS[currentLayer];
      const tileLayer = L.tileLayer(layerConfig.url, {
        subdomains: layerConfig.subdomains || 'abc',
        maxZoom: layerConfig.maxZoom,
      }).addTo(map);
      tileLayerRef.current = tileLayer;

      // Add Zoom Control at bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Markers layer group
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;

      // El zoom manda para agrupar (T16): al terminar cada animación de
      // zoom se repintan los cúmulos.
      setMapZoomLevel(map.getZoom());
      map.on('zoomend', () => setMapZoomLevel(map.getZoom()));

      // Handle map click to report a new point directly
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        // Prompt or offer quick reporting
        L.popup()
          .setLatLng([lat, lng])
          .setContent(`
            <div class="p-3 text-center">
              <p class="text-xs font-bold text-slate-800 mb-1">📍 Nueva Ubicación Seleccionada</p>
              <p class="text-[11px] text-slate-500 mb-2.5">Coordenadas: ${lat.toFixed(4)}, ${lng.toFixed(4)}</p>
              <button id="cali-map-report-btn" class="w-full px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors">
                + Reportar Centro o Ayuda Aquí
              </button>
            </div>
          `)
          .openOn(map);

        setTimeout(() => {
          const btn = document.getElementById('cali-map-report-btn');
          if (btn) {
            btn.onclick = () => {
              if (!userProfile.isRegistered) {
                openAuthModal('Para reportar un centro en esta ubicación debes crear una cuenta.', () => {
                  setInitialCoordsForNewPoint([lat, lng]);
                  setReportModalType('point');
                  setIsReportModalOpen(true);
                });
              } else {
                setInitialCoordsForNewPoint([lat, lng]);
                setReportModalType('point');
                setIsReportModalOpen(true);
              }
              map.closePopup();
            };
          }
        }, 100);
      });

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers when filtered points or selected point change
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    // Render User Location Pin if available
    if (userLocation) {
      const sourceDesc =
        userLocation.source === 'gps'
          ? 'GPS Satelital'
          : userLocation.source === 'barrio_selection'
          ? 'Barrio Seleccionado'
          : userLocation.source === 'map_pin'
          ? 'Fijado en Mapa'
          : userLocation.source === 'profile'
          ? 'Perfil de Usuario'
          : 'Predeterminada';

      const userMarker = L.marker([userLocation.lat, userLocation.lng], {
        icon: userLocationIcon,
        zIndexOffset: 1000,
        draggable: true,
        title: 'Tu ubicación en el mapa',
        alt: 'Tu ubicación en el mapa',
      }).bindPopup(`
        <div class="p-2.5 text-xs min-w-[210px]">
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="font-extrabold text-slate-900 text-xs">📍 Tu Ubicación Registrada</span>
            <span class="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded">${escapeHtml(sourceDesc)}</span>
          </div>
          <p class="font-bold text-orange-600 text-sm">${escapeHtml(userLocation.barrio || 'Cali')}</p>
          ${userLocation.address ? `<p class="text-slate-500 text-[11px] mt-0.5">${escapeHtml(userLocation.address)}</p>` : ''}
          <p class="text-[10px] text-slate-400 font-mono mt-1">${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}</p>
          <div class="mt-2.5 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
            <button id="cali-map-edit-loc-btn" class="w-full py-1.5 px-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-colors">
              ⚙️ Cambiar o Ajustar Ubicación
            </button>
            <span class="text-[10px] text-slate-400 text-center">💡 Puedes arrastrar este marcador azul por el mapa</span>
          </div>
        </div>
      `);

      userMarker.on('popupopen', () => {
        setTimeout(() => {
          const btn = document.getElementById('cali-map-edit-loc-btn');
          if (btn) {
            btn.onclick = () => {
              setIsLocationModalOpen(true);
            };
          }
        }, 60);
      });

      userMarker.on('dragend', async () => {
        const newPos = userMarker.getLatLng();
        await setUserCustomCoordinates(newPos.lat, newPos.lng);
      });

      markersLayerRef.current.addLayer(userMarker);
    }

    // Render Help Points: agrupados en cúmulos cuando el zoom es bajo y uno
    // a uno por encima de `CLUSTER_MAX_ZOOM` (T16). El punto seleccionado
    // nunca va dentro de un cúmulo.
    const selectedInList =
      selectedPoint && filteredPoints.some((point) => point.id === selectedPoint.id)
        ? selectedPoint
        : undefined;

    const groups = groupPointsForZoom(filteredPoints, mapZoomLevel, selectedInList?.id);

    // El seleccionado queda fuera de los cúmulos (o de la lista, si está
    // filtrado): se pinta siempre suelto y en primer plano.
    if (selectedInList) {
      const selectedMarker = L.marker([selectedInList.lat, selectedInList.lng], {
        icon: createMarkerIcon(selectedInList.category, true, selectedInList.verified, selectedInList.name),
        zIndexOffset: 500,
        title: selectedInList.name,
        alt: selectedInList.verified
          ? `${selectedInList.name} (punto verificado)`
          : selectedInList.name,
      });
      selectedMarker.on('click', () => setSelectedPoint(selectedInList));
      markersLayerRef.current?.addLayer(selectedMarker);
    }

    groups.forEach((group) => {
      const [lat, lng] = groupCenter(group);

      // Cúmulo: nº de puntos y acercada al hacer clic.
      if (group.points.length > 1) {
        const cluster = L.marker([lat, lng], {
          icon: createClusterIcon(group.points.length),
          zIndexOffset: 200,
          title: `${group.points.length} puntos de ayuda en esta zona (acércate para verlos)`,
          alt: `${group.points.length} puntos de ayuda agrupados en esta zona`,
        });

        cluster.on('click', () => {
          const map = mapInstanceRef.current;
          if (!map) return;
          // Se salta el umbral de agrupación para que el cúmulo se reparta.
          map.flyTo([lat, lng], Math.max(map.getZoom() + 2, CLUSTER_MAX_ZOOM + 1), {
            duration: 0.5,
          });
        });

        markersLayerRef.current?.addLayer(cluster);
        return;
      }

      const point = group.points[0];
      const isSelected = selectedInList?.id === point.id;
      const marker = L.marker([point.lat, point.lng], {
        icon: createMarkerIcon(point.category, isSelected, point.verified, point.name),
        zIndexOffset: isSelected ? 500 : 100,
        title: point.name,
        alt: point.verified ? `${point.name} (punto verificado)` : point.name,
      });

      marker.on('click', () => {
        setSelectedPoint(point);
      });

      markersLayerRef.current?.addLayer(marker);
    });
  }, [filteredPoints, selectedPoint, userLocation, mapZoomLevel]);

  // Fly to map center when center/zoom changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(mapCenter, mapZoom, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    }
  }, [mapCenter, mapZoom]);

  // Dynamically update tile layer without watermarks
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }
    const layerConfig = MAP_LAYERS[currentLayer];
    const newTileLayer = L.tileLayer(layerConfig.url, {
      subdomains: layerConfig.subdomains || 'abc',
      maxZoom: layerConfig.maxZoom,
    }).addTo(mapInstanceRef.current);
    newTileLayer.bringToBack();
    tileLayerRef.current = newTileLayer;
  }, [currentLayer]);

  const handleLocateMe = async () => {
    await requestUserLocation();
  };

  const isSaved = selectedPoint ? userProfile.savedPointIds.includes(selectedPoint.id) : false;

  const categoryLabels = {
    all: 'Todos los Puntos',
    acopio: 'Centros de Acopio',
    veterinaria: 'Veterinarias',
    albergue: 'Albergues',
    salud: 'Emergencias Médicas',
  };

  /**
   * CTA principal del mapa: reportar un punto de ayuda. Misma guarda que en el
   * resto de la app (cuenta comunitaria antes de abrir el formulario).
   */
  const handleOpenReport = () => {
    if (!userProfile.isRegistered) {
      openAuthModal(
        'Para reportar un centro de ayuda en Cali debes crear una cuenta comunitaria.',
        () => {
          setReportModalType('point');
          setIsReportModalOpen(true);
        },
      );
      return;
    }
    setReportModalType('point');
    setIsReportModalOpen(true);
  };

  return (
    <div className="relative w-full h-[calc(100vh-61px-56px)] md:h-[calc(100vh-61px)] flex flex-col md:flex-row overflow-hidden bg-slate-50">
      {/* Top Filter, Search Bar & Live Dashboard Summary Over Map */}
      <div 
        className="absolute top-3 left-3 right-3 md:left-6 md:right-auto md:w-96 lg:w-[420px] z-30 flex flex-col gap-2 pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Título de la vista (H1): la pestaña por defecto necesita encabezado
            propio con la keyword principal (SEO-07 · QW-02), pero no se muestra
            sobre la barra de búsqueda: queda oculto visualmente. */}
        <h1 className="sr-only">Centros de acopio y albergues en Cali</h1>

        {/* Top Search Bar & Mobile Action Buttons Row */}
        <div className="flex items-center gap-2 w-full">
          {/* Search Input */}
          <div className="relative flex-1 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-900/5 border border-slate-100 flex items-center px-3.5 py-2.5">
            <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
            <input
              type="text"
              placeholder="Buscar barrio o centro..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs md:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-slate-400 hover:text-slate-600 px-1 font-semibold"
                title="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          {/* Mobile-only Action Buttons (GPS & Layers) aligned in row to prevent any overlap */}
          <div className="flex md:hidden items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleLocateMe}
              disabled={isLocatingUser}
              title="Centrar en mi ubicación con GPS"
              className="w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md text-slate-700 hover:text-orange-600 shadow-md shadow-slate-900/10 flex items-center justify-center border border-slate-100 active:scale-95 transition-all shrink-0"
            >
              {isLocatingUser ? (
                <Loader2 className="w-4 h-4 text-orange-600 animate-spin" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsLocationModalOpen(true)}
              title="Ajustar mi ubicación"
              className="w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md text-slate-700 hover:text-orange-600 shadow-md shadow-slate-900/10 flex items-center justify-center border border-slate-100 active:scale-95 transition-all shrink-0"
            >
              <Compass className="w-4 h-4" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLayerMenu(!showLayerMenu)}
                title="Cambiar estilo de mapa"
                className="w-10 h-10 rounded-2xl bg-white/95 backdrop-blur-md text-slate-700 hover:text-orange-600 shadow-md shadow-slate-900/10 flex items-center justify-center border border-slate-100 active:scale-95 transition-all shrink-0"
              >
                <Layers className="w-4 h-4" />
              </button>

              {showLayerMenu && (
                <div className="absolute right-0 top-12 w-48 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                    Estilo de Mapa
                  </p>
                  {(Object.keys(MAP_LAYERS) as MapLayerType[]).map((layerKey) => (
                    <button
                      key={layerKey}
                      type="button"
                      onClick={() => {
                        setCurrentLayer(layerKey);
                        setShowLayerMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                        currentLayer === layerKey
                          ? 'bg-orange-50 text-orange-700 font-bold'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span>{MAP_LAYERS[layerKey].name}</span>
                      {currentLayer === layerKey && <span className="text-orange-600">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* User Location Interactive Status Bar */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-sm border border-slate-100 px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                userLocation?.source === 'gps'
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-blue-600'
              } shrink-0`}
            />
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[11px] font-bold text-slate-500 shrink-0">Mi ubicación:</span>
              <span className="text-xs font-extrabold text-slate-900 truncate">
                {userLocation?.barrio || 'San Antonio'}
              </span>
            </div>
          </div>

          {/* MEJ-02: orden/filtro optativo por proximidad (apagado por defecto). */}
          <button
            type="button"
            onClick={() => setNearMeOnly((prev) => !prev)}
            aria-pressed={nearMeOnly}
            title={`Mostrar solo los centros a menos de ${NEAR_ME_MAX_KM} km, del más cercano al más lejano`}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 active:scale-95 ${
              nearMeOnly
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            <Navigation className="w-3 h-3" aria-hidden="true" />
            Cerca de mí
          </button>

          <button
            type="button"
            onClick={() => setIsLocationModalOpen(true)}
            className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 text-[11px] font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1 active:scale-95"
            title="Cambiar o configurar mi ubicación"
          >
            <span>Cambiar</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Clear CTA: qué puede hacer aquí alguien que llega por primera vez */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-900/5 border border-slate-100 p-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-extrabold text-slate-900 leading-tight">
              ¿Necesitas ayuda o quieres ayudar?
            </p>
            <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
              Publica una necesidad o registra un centro de apoyo en Cali.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenReport}
              className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md shadow-orange-600/25 transition-all active:scale-95"
            >
              Publicar ayuda
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('blog')}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
            >
              Ver tablón
            </button>
          </div>
        </div>

        {/* Real-time Dashboard Summary Component */}
        <MapDashboardSummary
          helpPoints={helpPoints}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => setSelectedCategory(cat)}
        />
      </div>

      {/* Desktop-only Floating Action Controls on Map (GPS Locate, Config Location, Layer Selector, Toggle List) */}
      <div className="hidden md:flex absolute right-6 top-6 z-30 flex-col gap-2 items-end">
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={isLocatingUser}
          title="Centrar en mi ubicación con GPS"
          className="w-10 h-10 rounded-2xl bg-white text-slate-700 hover:text-orange-600 shadow-md shadow-slate-900/10 flex items-center justify-center border border-slate-100 active:scale-95 transition-all"
        >
          {isLocatingUser ? (
            <Loader2 className="w-5 h-5 text-orange-600 animate-spin" />
          ) : (
            <Crosshair className="w-5 h-5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setIsLocationModalOpen(true)}
          title="Configurar y cambiar mi ubicación"
          className="w-10 h-10 rounded-2xl bg-white text-slate-700 hover:text-orange-600 shadow-md shadow-slate-900/10 flex items-center justify-center border border-slate-100 active:scale-95 transition-all"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Layer style toggle */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLayerMenu(!showLayerMenu)}
            title="Cambiar estilo de mapa"
            className="w-10 h-10 rounded-2xl bg-white text-slate-700 hover:text-orange-600 shadow-md shadow-slate-900/10 flex items-center justify-center border border-slate-100 active:scale-95 transition-all"
          >
            <Layers className="w-5 h-5" />
          </button>

          {showLayerMenu && (
            <div className="absolute right-0 top-12 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-40 space-y-1">
              <p className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                Estilo de Mapa (Sin Marca)
              </p>
              {(Object.keys(MAP_LAYERS) as MapLayerType[]).map((layerKey) => (
                <button
                  key={layerKey}
                  type="button"
                  onClick={() => {
                    setCurrentLayer(layerKey);
                    setShowLayerMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                    currentLayer === layerKey
                      ? 'bg-orange-50 text-orange-700 font-bold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>{MAP_LAYERS[layerKey].name}</span>
                  {currentLayer === layerKey && <span className="text-orange-600">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowListViewDesktop(!showListViewDesktop)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white text-slate-700 hover:text-slate-900 shadow-md shadow-slate-900/10 border border-slate-100 text-xs font-bold active:scale-95 transition-all"
        >
          <span>{showListViewDesktop ? 'Ocultar Lista' : 'Ver Lista'}</span>
        </button>
      </div>

      {/* The Leaflet Map Canvas */}
      <div className="flex-1 relative w-full h-full min-h-[300px]">
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Map Legend Overlay (Quiet, unboxed) */}
        <div className="hidden lg:flex absolute bottom-6 left-6 z-20 bg-white/90 backdrop-blur-md rounded-2xl p-3 border border-slate-100 shadow-md text-xs text-slate-600 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-600"></span>
            <span>🚚 Acopio</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
            <span>🐾 Veterinaria</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-600"></span>
            <span>🏠 Albergue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-600"></span>
            <span>🏥 Salud</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white">
              <CheckCircle2 className="w-2.5 h-2.5" aria-hidden="true" />
            </span>
            <span>Verificado</span>
          </div>
          <span className="text-slate-400">|</span>
          <span className="text-[11px] text-slate-500">Haz clic en el mapa para reportar un punto</span>
        </div>
      </div>

      {/* Desktop Side Panel: Points Directory */}
      {showListViewDesktop && (
        <div className="hidden md:flex flex-col w-96 lg:w-[420px] bg-white border-l border-slate-200 z-20 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Puntos en Cali ({filteredPoints.length})
              </h2>
              <p className="text-xs text-slate-500">
                {selectedCategory === 'all' ? 'Todos los sectores' : categoryLabels[selectedCategory]}
                {nearMeOnly &&
                  ` · Cerca de mí (≤ ${NEAR_ME_MAX_KM} km, del más cercano al más lejano)`}
              </p>
            </div>
            <button
              onClick={() => {
                if (!userProfile.isRegistered) {
                  openAuthModal('Para reportar un centro en Cali debes crear una cuenta.', () => {
                    setReportModalType('point');
                    setIsReportModalOpen(true);
                  });
                } else {
                  setReportModalType('point');
                  setIsReportModalOpen(true);
                }
              }}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline"
            >
              + Nuevo punto
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
            {filteredPoints.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No se encontraron centros</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Intenta cambiar el filtro o buscar otro barrio caleño.
                </p>
              </div>
            ) : (
              filteredPoints.map((point) => {
                const dist = calculateDistance(point.lat, point.lng);
                const isPointSelected = selectedPoint?.id === point.id;

                return (
                  <div
                    key={point.id}
                    onClick={() => setSelectedPoint(point)}
                    className={`p-3.5 rounded-2xl cursor-pointer transition-all ${
                      isPointSelected
                        ? 'bg-orange-50/80 border border-orange-200/80 shadow-sm'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {point.category === 'acopio' && '🚚'}
                          {point.category === 'veterinaria' && '🐾'}
                          {point.category === 'albergue' && '🏠'}
                          {point.category === 'salud' && '🏥'}
                        </span>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 leading-snug line-clamp-1">
                            {point.name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-semibold text-slate-700">{point.barrio}</span>
                            <span aria-hidden="true">·</span>
                            <span>{point.comuna}</span>
                            {dist !== null && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className="font-mono tabular-nums text-orange-600 font-semibold"
                                  title={
                                    distanceIsApprox
                                      ? 'Distancia aproximada: mide desde el centro de tu barrio, no desde tu punto exacto'
                                      : undefined
                                  }
                                >
                                  {distanceIsApprox && (
                                    <span className="sr-only">(distancia aproximada) </span>
                                  )}
                                  {distanceIsApprox && '≈ '}
                                  {dist} km
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {point.verified && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            Verificado
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            point.status === 'abierto'
                              ? 'bg-emerald-50 text-emerald-700'
                              : point.status === 'alta_demanda'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {point.status === 'abierto'
                            ? 'Abierto'
                            : point.status === 'alta_demanda'
                            ? 'Alta demanda'
                            : 'Cerrado'}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                      {point.description}
                    </p>

                    {point.urgentItems && point.urgentItems.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {point.urgentItems.slice(0, 3).map((item, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                      <span className="flex items-center gap-1 font-medium text-slate-600">
                        <MessageCircle className="w-3 h-3 text-orange-600" />
                        <span>{pointComments.filter((c) => c.pointId === point.id).length} comentarios</span>
                      </span>
                      <span className="text-[10px] text-orange-600 font-bold">
                        Ver comentarios y reportes →
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Selected Point Bottom Sheet / Drawer (Mobile & Desktop) */}
      {selectedPoint && (
        <div className="absolute bottom-3 left-3 right-3 md:bottom-6 md:left-6 md:w-[480px] z-30 pointer-events-auto">
          <div className="bg-white rounded-3xl p-4 md:p-5 shadow-2xl shadow-slate-900/20 border border-slate-100 transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
                    selectedPoint.category === 'acopio'
                      ? 'bg-blue-50 text-blue-600'
                      : selectedPoint.category === 'veterinaria'
                      ? 'bg-emerald-50 text-emerald-600'
                      : selectedPoint.category === 'albergue'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  {selectedPoint.category === 'acopio' && '🚚'}
                  {selectedPoint.category === 'veterinaria' && '🐾'}
                  {selectedPoint.category === 'albergue' && '🏠'}
                  {selectedPoint.category === 'salud' && '🏥'}
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-orange-600">
                      {categoryLabels[selectedPoint.category]}
                    </span>
                    {selectedPoint.verified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        Verificado
                      </span>
                    )}
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="text-xs text-slate-500 font-medium">
                      {selectedPoint.barrio} ({selectedPoint.comuna})
                    </span>
                  </div>
                  <h3 className="text-sm md:text-base font-bold text-slate-900 leading-tight">
                    {selectedPoint.name}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleSavePoint(selectedPoint.id)}
                  title={isSaved ? 'Quitar de guardados' : 'Guardar punto'}
                  className={`p-2 rounded-xl transition-colors ${
                    isSaved ? 'text-orange-600 bg-orange-50' : 'text-slate-400 hover:text-slate-700 bg-slate-50'
                  }`}
                >
                  <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => setSelectedPoint(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 rounded-xl"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Address & Hours */}
            <div className="mt-3 space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-slate-800 font-medium">{selectedPoint.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{selectedPoint.schedule}</span>
              </div>
            </div>

            {/* Description */}
            <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">
              {selectedPoint.description}
            </p>

            {/* Urgent Items Needed */}
            {selectedPoint.urgentItems && selectedPoint.urgentItems.length > 0 && (
              <div className="mt-3 p-2.5 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
                  <span>Artículos de mayor urgencia:</span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedPoint.urgentItems.map((item, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] font-medium text-slate-700 bg-white border border-slate-200/80 px-2 py-0.5 rounded-lg"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons: Call, WhatsApp, Navigation */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <a
                href={`tel:${selectedPoint.phone}`}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Llamar</span>
              </a>

              <a
                href={`https://wa.me/${selectedPoint.whatsapp}?text=Hola,%20escribo%20desde%20la%20plataforma%20AyudaEnCali%20para%20coordinar%20ayuda.`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPoint.lat},${selectedPoint.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition-colors shadow-sm shadow-orange-600/20"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Ruta GPS</span>
              </a>
            </div>

            {/* Acciones del ciclo de vida: solo para quien publicó el punto
                (autoría = `sub` del JWT, T10 · FEAT-01). */}
            {isOwnPoint && (
              <div className="mt-4 pt-3.5 border-t border-dashed border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                    Tu punto
                  </span>
                  <button
                    type="button"
                    onClick={() => (isEditingPoint ? setIsEditingPoint(false) : startPointEdit(selectedPoint))}
                    disabled={lifecycleBusy}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{isEditingPoint ? 'Cerrar edición' : 'Editar'}</span>
                  </button>

                  {confirmingDeletePoint ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className="text-rose-700 font-semibold">¿Eliminar el punto?</span>
                      <button
                        type="button"
                        onClick={() => void removeSelectedPoint()}
                        disabled={lifecycleBusy}
                        className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-xs font-bold rounded-xl transition-colors"
                      >
                        Sí, eliminar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeletePoint(false)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingPoint(false);
                        setConfirmingDeletePoint(true);
                      }}
                      disabled={lifecycleBusy}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar</span>
                    </button>
                  )}
                </div>

                {isEditingPoint && (
                  <form
                    className="mt-3 space-y-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void savePointEdit();
                    }}
                  >
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-600">Nombre</span>
                      <input
                        type="text"
                        value={pointDraft.name}
                        onChange={(e) => setPointDraft((d) => ({ ...d, name: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        required
                        minLength={3}
                      />
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-bold text-slate-600">Dirección</span>
                        <input
                          type="text"
                          value={pointDraft.address}
                          onChange={(e) => setPointDraft((d) => ({ ...d, address: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                          required
                          minLength={3}
                        />
                      </label>

                      <label className="block">
                        <span className="text-[11px] font-bold text-slate-600">Horario</span>
                        <input
                          type="text"
                          value={pointDraft.schedule}
                          onChange={(e) => setPointDraft((d) => ({ ...d, schedule: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-600">Descripción</span>
                      <textarea
                        value={pointDraft.description}
                        onChange={(e) => setPointDraft((d) => ({ ...d, description: e.target.value }))}
                        rows={3}
                        className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <label className="block">
                        <span className="text-[11px] font-bold text-slate-600">Estado</span>
                        <select
                          value={pointDraft.status}
                          onChange={(e) =>
                            setPointDraft((d) => ({ ...d, status: e.target.value as PointStatus }))
                          }
                          className="mt-1 block px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                        >
                          <option value="abierto">Abierto</option>
                          <option value="alta_demanda">Alta demanda</option>
                          <option value="cerrado">Cerrado</option>
                        </select>
                      </label>

                      <label className="block flex-1 min-w-[180px]">
                        <span className="text-[11px] font-bold text-slate-600">
                          Artículos urgentes (separados por coma)
                        </span>
                        <input
                          type="text"
                          value={pointDraft.urgentItems}
                          onChange={(e) => setPointDraft((d) => ({ ...d, urgentItems: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={
                          lifecycleBusy ||
                          pointDraft.name.trim().length < 3 ||
                          pointDraft.address.trim().length < 3
                        }
                        className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition-colors"
                      >
                        {lifecycleBusy ? 'Guardando…' : 'Guardar cambios'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingPoint(false)}
                        className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Community Comments & Live Updates Section (Registered Users only) */}
            <div className="mt-4 pt-3.5 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-orange-600" />
                  <span>Comentarios y Reportes en Vivo</span>
                </h4>
                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {pointComments.filter((c) => c.pointId === selectedPoint.id).length} comentarios
                </span>
              </div>

              {/* Comments Feed */}
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1 my-2">
                {pointComments.filter((c) => c.pointId === selectedPoint.id).length === 0 ? (
                  <div className="p-3 bg-slate-50 rounded-2xl text-center text-slate-400 text-[11px]">
                    Aún no hay comentarios sobre este centro. Los voluntarios y ciudadanos registrados pueden compartir actualizaciones aquí.
                  </div>
                ) : (
                  pointComments
                    .filter((c) => c.pointId === selectedPoint.id)
                    .map((comm) => (
                      <div key={comm.id} className="p-2.5 bg-slate-50/90 rounded-2xl border border-slate-100 text-xs">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 text-[11px]">{comm.userName}</span>
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 bg-orange-100 text-orange-800 rounded">
                              {comm.userRole}
                            </span>
                            {comm.userBarrio && (
                              <span className="text-[10px] text-slate-400">· {comm.userBarrio}</span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(comm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700 leading-relaxed">{comm.comment}</p>
                      </div>
                    ))
                )}
              </div>

              {/* Add Comment Form or Registration Prompt */}
              {userProfile.isRegistered ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!commentInput.trim() || isPostingComment) return;
                    setIsPostingComment(true);
                    await addPointComment(selectedPoint.id, commentInput);
                    setCommentInput('');
                    setIsPostingComment(false);
                  }}
                  className="mt-2.5 flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    placeholder="Escribe un reporte o actualización sobre este centro..."
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    disabled={isPostingComment}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                  <button
                    type="submit"
                    disabled={!commentInput.trim() || isPostingComment}
                    className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 text-white text-xs font-bold rounded-xl transition-colors shadow-xs shrink-0"
                  >
                    Publicar
                  </button>
                </form>
              ) : (
                <div className="mt-2.5 p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                  <div className="text-[11px] text-amber-900 leading-snug">
                    <strong>Comentarios comunitarios:</strong> Solo los usuarios registrados pueden publicar novedades de este centro.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      openAuthModal('Para publicar comentarios en los centros debes crear una cuenta.', () => {
                        // callback
                      });
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs whitespace-nowrap transition-colors shrink-0"
                  >
                    Crear cuenta para comentar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
