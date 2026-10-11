import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { UserCoordinates, UserProfile } from '../types';
import { CALI_BARRIOS_DATA, getFriendlyLocationName } from '../data/caliLocations';
import { haversineKm } from '../utils/geo';
import { loadJSON, saveJSON } from '../utils/storage';
import { STORAGE_KEYS } from './appConstants';

export interface LocationApi {
  userLocation: UserCoordinates | null;
  setUserLocation: Dispatch<SetStateAction<UserCoordinates | null>>;
  isLocatingUser: boolean;
  locationError: string | null;
  setLocationError: (err: string | null) => void;
  isLocationModalOpen: boolean;
  setIsLocationModalOpen: (open: boolean) => void;
  /** Centro y zoom de la vista del mapa: la ubicación siempre los arrastra. */
  mapCenter: [number, number];
  setMapCenter: Dispatch<SetStateAction<[number, number]>>;
  mapZoom: number;
  setMapZoom: Dispatch<SetStateAction<number>>;
  requestUserLocation: () => Promise<{ success: boolean; error?: string }>;
  setUserBarrioLocation: (barrioName: string) => void;
  setUserCustomCoordinates: (lat: number, lng: number, customName?: string) => Promise<void>;
  calculateDistance: (lat: number, lng: number) => number | null;
}

const DEFAULT_CENTER: [number, number] = [3.44, -76.535];

/**
 * Ubicación del usuario (GPS, barrio o alfiler del mapa) y la vista del
 * mapa que la refleja (`mapCenter`/`mapZoom`): centrar en la ubicación es
 * la razón de ser de estas dos piezas, así que viven juntas.
 */
export function useUserLocation(): LocationApi {
  const [userLocation, setUserLocation] = useState<UserCoordinates | null>(() => {
    const saved = loadJSON<UserCoordinates | null>(STORAGE_KEYS.LOCATION, null);
    if (saved && typeof saved === 'object') return saved;

    const savedProfile = loadJSON<UserProfile | null>(STORAGE_KEYS.PROFILE, null);
    if (savedProfile?.barrio && CALI_BARRIOS_DATA[savedProfile.barrio]) {
      const b = CALI_BARRIOS_DATA[savedProfile.barrio];
      return {
        lat: b.lat,
        lng: b.lng,
        barrio: b.name,
        source: 'profile',
        isCustom: true,
      };
    }

    return {
      lat: 3.4475,
      lng: -76.5412,
      barrio: 'San Antonio (Predeterminado)',
      source: 'default',
    };
  });

  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  // Cali center coordinates [3.4400, -76.5350]
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => {
    if (userLocation) return [userLocation.lat, userLocation.lng];
    return DEFAULT_CENTER;
  });
  const [mapZoom, setMapZoom] = useState(13);

  useEffect(() => {
    if (userLocation) saveJSON(STORAGE_KEYS.LOCATION, userLocation);
  }, [userLocation]);

  const requestUserLocation = async (): Promise<{ success: boolean; error?: string }> => {
    if (!navigator.geolocation) {
      const msg = 'Tu navegador o dispositivo no soporta geolocalización GPS.';
      setLocationError(msg);
      setIsLocationModalOpen(true);
      return { success: false, error: msg };
    }

    setIsLocatingUser(true);
    setLocationError(null);

    const getPos = (options: PositionOptions): Promise<GeolocationPosition> =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });

    try {
      let pos: GeolocationPosition;
      try {
        // High accuracy GPS first
        pos = await getPos({ enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 });
      } catch {
        // Fallback to standard/network accuracy
        pos = await getPos({ enableHighAccuracy: false, timeout: 9000, maximumAge: 120000 });
      }

      const { latitude, longitude, accuracy } = pos.coords;
      const friendly = await getFriendlyLocationName(latitude, longitude);

      const coords: UserCoordinates = {
        lat: latitude,
        lng: longitude,
        barrio: friendly.barrioName,
        address: friendly.address,
        accuracy,
        source: 'gps',
        isCustom: true,
      };

      setUserLocation(coords);
      setMapCenter([coords.lat, coords.lng]);
      setMapZoom(15);
      setIsLocatingUser(false);
      return { success: true };
    } catch (error) {
      setIsLocatingUser(false);
      const geoError = error as GeolocationPositionError | Error;
      let errorMsg = 'No se pudo obtener la señal GPS.';
      if ('code' in geoError && geoError.code === 1) {
        errorMsg =
          'El permiso de ubicación fue denegado en el navegador. Por favor selecciona tu barrio o márcalo en el mapa.';
      } else if ('code' in geoError && geoError.code === 2) {
        errorMsg =
          'La ubicación GPS no está disponible en este dispositivo. Puedes seleccionar tu barrio en la lista.';
      } else if ('code' in geoError && geoError.code === 3) {
        errorMsg =
          'Tiempo de espera agotado al consultar el GPS. Selecciona tu barrio para calcular distancias.';
      }
      setLocationError(errorMsg);
      setIsLocationModalOpen(true);
      return { success: false, error: errorMsg };
    }
  };

  const setUserBarrioLocation = (barrioName: string) => {
    const barrioInfo = CALI_BARRIOS_DATA[barrioName];
    if (barrioInfo) {
      const coords: UserCoordinates = {
        lat: barrioInfo.lat,
        lng: barrioInfo.lng,
        barrio: barrioInfo.name,
        source: 'barrio_selection',
        isCustom: true,
      };
      setUserLocation(coords);
      setMapCenter([coords.lat, coords.lng]);
      setMapZoom(15);
    }
  };

  const setUserCustomCoordinates = async (lat: number, lng: number, customName?: string) => {
    let name = customName;
    if (!name) {
      const friendly = await getFriendlyLocationName(lat, lng);
      name = friendly.barrioName;
    }
    const coords: UserCoordinates = {
      lat,
      lng,
      barrio: name,
      source: 'map_pin',
      isCustom: true,
    };
    setUserLocation(coords);
  };

  const calculateDistance = (lat: number, lng: number): number | null => {
    if (!userLocation) return null;
    const km = haversineKm(userLocation.lat, userLocation.lng, lat, lng);
    return parseFloat(km.toFixed(1));
  };

  return {
    userLocation,
    setUserLocation,
    isLocatingUser,
    locationError,
    setLocationError,
    isLocationModalOpen,
    setIsLocationModalOpen,
    mapCenter,
    setMapCenter,
    mapZoom,
    setMapZoom,
    requestUserLocation,
    setUserBarrioLocation,
    setUserCustomCoordinates,
    calculateDistance,
  };
}
