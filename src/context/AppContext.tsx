import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  CommentsResponse,
  ConfigResponse,
  HelpNeed,
  HelpPoint,
  MySupportsResponse,
  NeedsResponse,
  PointComment,
  PointsResponse,
  SupportAction,
  SupportResponse,
  UserRole,
  UserCoordinates,
  UserProfile,
} from '../types';
import {
  INITIAL_HELP_POINTS,
  INITIAL_HELP_NEEDS,
  INITIAL_USER_PROFILE,
  INITIAL_POINT_COMMENTS,
} from '../data/initialData';
import { CALI_BARRIOS_DATA, getFriendlyLocationName } from '../data/caliLocations';
import { apiFetch } from '../services/api';
import { loadJSON, saveJSON } from '../utils/storage';
import { logger } from '../utils/logger';

export interface ServerStatus {
  supabaseConnected: boolean;
  supabaseUrl: string | null;
  supabaseTablesReady: boolean | null;
  supabaseHint: string | null;
  cartoConfigured: boolean;
  hasGeminiKey: boolean;
}

interface AppContextType {
  activeTab: 'map' | 'blog' | 'chat' | 'profile';
  setActiveTab: (tab: 'map' | 'blog' | 'chat' | 'profile') => void;
  helpPoints: HelpPoint[];
  helpNeeds: HelpNeed[];
  /** Necesidades que la cuenta actual (sesión de Clerk) ya apoyó. */
  supportedNeedIds: string[];
  pointComments: PointComment[];
  userProfile: UserProfile;
  userLocation: UserCoordinates | null;
  setUserLocation: (coords: UserCoordinates | null) => void;
  setUserBarrioLocation: (barrioName: string) => void;
  setUserCustomCoordinates: (lat: number, lng: number, customName?: string) => Promise<void>;
  isLocatingUser: boolean;
  locationError: string | null;
  setLocationError: (err: string | null) => void;
  isLocationModalOpen: boolean;
  setIsLocationModalOpen: (open: boolean) => void;
  selectedPoint: HelpPoint | null;
  setSelectedPoint: (point: HelpPoint | null) => void;
  selectedNeed: HelpNeed | null;
  setSelectedNeed: (need: HelpNeed | null) => void;
  isReportModalOpen: boolean;
  setIsReportModalOpen: (open: boolean) => void;
  reportModalType: 'point' | 'need';
  setReportModalType: (type: 'point' | 'need') => void;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  /** Cierra el modal de registro descartando la acción pendiente. */
  closeAuthModal: () => void;
  authModalMessage: string;
  openAuthModal: (message?: string, onSuccess?: () => void) => void;
  mapCenter: [number, number];
  setMapCenter: (center: [number, number]) => void;
  mapZoom: number;
  setMapZoom: (zoom: number) => void;
  initialCoordsForNewPoint: [number, number] | null;
  setInitialCoordsForNewPoint: (coords: [number, number] | null) => void;
  serverStatus: ServerStatus;
  addHelpPoint: (pointData: Omit<HelpPoint, 'id' | 'createdAt' | 'updatedAt' | 'verified'>) => Promise<void>;
  addHelpNeed: (needData: Omit<HelpNeed, 'id' | 'createdAt' | 'supportersCount'>) => Promise<void>;
  addPointComment: (pointId: string, commentText: string) => Promise<boolean>;
  toggleSavePoint: (pointId: string) => void;
  supportNeed: (needId: string, action: SupportAction) => Promise<void>;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
  registerUser: (data: {
    name: string;
    email: string;
    phone: string;
    barrio: string;
    role: UserRole;
    organization?: string;
  }) => void;
  logoutUser: () => void;
  requestUserLocation: () => Promise<{ success: boolean; error?: string }>;
  calculateDistance: (lat: number, lng: number) => number | null;
  focusPointOnMap: (point: HelpPoint) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  POINTS: 'ayudaencali_points_v4',
  NEEDS: 'ayudaencali_needs_v3',
  COMMENTS: 'ayudaencali_comments_v3',
  PROFILE: 'ayudaencali_profile_v3',
  LOCATION: 'ayudaencali_location_v2',
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Sesión de Clerk: identidad real para las acciones que exigen "tener
  // usuario" (p. ej. dar/retirar apoyos). `getToken` entrega el JWT que el
  // servidor verifica antes de aceptar la acción.
  const { isSignedIn, userId: clerkUserId, getToken } = useAuth();

  const [activeTab, setActiveTab] = useState<'map' | 'blog' | 'chat' | 'profile'>('map');

  const [helpPoints, setHelpPoints] = useState<HelpPoint[]>(() => {
    const saved = loadJSON<HelpPoint[] | null>(STORAGE_KEYS.POINTS, null);
    if (Array.isArray(saved)) return saved;

    // Migración desde la clave v3: solo se conservan los puntos reportados
    // por el usuario; los oficiales se recargan desde el código.
    const legacy = loadJSON<HelpPoint[] | null>('ayudaencali_points_v3', null);
    if (Array.isArray(legacy)) {
      const customPoints = legacy.filter((p) => !INITIAL_HELP_POINTS.some((ip) => ip.id === p.id));
      return [...INITIAL_HELP_POINTS, ...customPoints];
    }
    return INITIAL_HELP_POINTS;
  });

  const [helpNeeds, setHelpNeeds] = useState<HelpNeed[]>(() => {
    const saved = loadJSON<HelpNeed[] | null>(STORAGE_KEYS.NEEDS, null);
    return Array.isArray(saved) ? saved : INITIAL_HELP_NEEDS;
  });

  const [pointComments, setPointComments] = useState<PointComment[]>(() => {
    const saved = loadJSON<PointComment[] | null>(STORAGE_KEYS.COMMENTS, null);
    return Array.isArray(saved) ? saved : INITIAL_POINT_COMMENTS;
  });

  // Apoyos ("likes") de la cuenta actual, como IDs de necesidad. Se limpia
  // al cerrar sesión y se recarga desde el servidor al iniciar.
  const [supportedNeedIds, setSupportedNeedIds] = useState<string[]>([]);

  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = loadJSON<UserProfile | null>(STORAGE_KEYS.PROFILE, null);
    if (saved && typeof saved === 'object') {
      if (!saved.isRegistered) {
        return {
          ...INITIAL_USER_PROFILE,
          name: 'Usuario no aún creado',
          isRegistered: false,
        };
      }
      return saved;
    }
    return INITIAL_USER_PROFILE;
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('');
  const [authCallback, setAuthCallback] = useState<(() => void) | null>(null);

  // Estado inicial desconocido: se completa con GET /api/config al montar.
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    supabaseConnected: false,
    supabaseUrl: null,
    supabaseTablesReady: null,
    supabaseHint: null,
    cartoConfigured: false,
    hasGeminiKey: false,
  });

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

  const [selectedPoint, setSelectedPoint] = useState<HelpPoint | null>(null);
  const [selectedNeed, setSelectedNeed] = useState<HelpNeed | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalType, setReportModalType] = useState<'point' | 'need'>('point');

  // Cali center coordinates [3.4400, -76.5350]
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => {
    if (userLocation) return [userLocation.lat, userLocation.lng];
    return [3.4400, -76.5350];
  });
  const [mapZoom, setMapZoom] = useState(13);
  const [initialCoordsForNewPoint, setInitialCoordsForNewPoint] = useState<[number, number] | null>(null);

  const openAuthModal = (message?: string, onSuccess?: () => void) => {
    setAuthModalMessage(message || 'Para realizar esta acción necesitas crear una cuenta comunitaria.');
    setAuthCallback(() => onSuccess || null);
    setIsAuthModalOpen(true);
  };

  /**
   * Cierra el modal de registro **deshaciendo** la acción pendiente: si el
   * usuario cancela, el callback guardado por `openAuthModal` no debe
   * ejecutarse en un registro posterior (p. ej. abrir el reportero minutos
   * más tarde sin que lo haya pedido). Al registrarse, `registerUser` es
   * quien dispara el callback y lo limpia.
   */
  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    setAuthCallback(null);
  };

  const registerUser = (data: {
    name: string;
    email: string;
    phone: string;
    barrio: string;
    role: UserRole;
    organization?: string;
  }) => {
    const updated: UserProfile = {
      ...userProfile,
      id: `usr-cali-${Date.now()}`,
      name: data.name,
      email: data.email,
      phone: data.phone,
      barrio: data.barrio,
      role: data.role,
      organization: data.organization || '',
      isRegistered: true, // Cuenta activa
    };
    setUserProfile(updated);

    // Synchronize userLocation with newly registered barrio if not overridden by GPS
    if (data.barrio && CALI_BARRIOS_DATA[data.barrio]) {
      const b = CALI_BARRIOS_DATA[data.barrio];
      const newCoords: UserCoordinates = {
        lat: b.lat,
        lng: b.lng,
        barrio: b.name,
        source: 'profile',
        isCustom: true,
      };
      setUserLocation(newCoords);
      setMapCenter([b.lat, b.lng]);
    }

    if (authCallback) {
      authCallback();
      setAuthCallback(null);
    }
  };

  const logoutUser = () => {
    setUserProfile(INITIAL_USER_PROFILE);
  };

  // Carga los apoyos de la cuenta al entrar la sesión y los limpia al salir.
  useEffect(() => {
    if (!isSignedIn || !clerkUserId) {
      setSupportedNeedIds([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const data = await apiFetch<MySupportsResponse>('/api/support/mine', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && Array.isArray(data.needIds)) setSupportedNeedIds(data.needIds);
      } catch (error) {
        if (!cancelled) logger.warn('No se pudieron cargar tus apoyos:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, clerkUserId, getToken]);

  // Sync with backend API
  useEffect(() => {
    let cancelled = false;

    const fetchConfig = async () => {
      try {
        const data = await apiFetch<ConfigResponse>('/api/config');
        if (cancelled) return;
        setServerStatus({
          supabaseConnected: Boolean(data.supabaseConnected),
          supabaseUrl: data.supabaseUrl ?? null,
          supabaseTablesReady: data.supabaseTablesReady ?? null,
          supabaseHint: data.supabaseHint ?? null,
          cartoConfigured: Boolean(data.cartoConfigured),
          hasGeminiKey: Boolean(data.hasGeminiKey),
        });
      } catch (error) {
        logger.warn('No se pudo obtener la configuración del servidor:', error);
      }
    };

    const fetchBackendData = async () => {
      try {
        const [pointsData, needsData, commentsData] = await Promise.all([
          apiFetch<PointsResponse>('/api/points'),
          apiFetch<NeedsResponse>('/api/needs'),
          apiFetch<CommentsResponse>('/api/comments'),
        ]);

        if (cancelled) return;
        if (Array.isArray(pointsData.points) && pointsData.points.length > 0) {
          setHelpPoints(pointsData.points);
        }
        if (Array.isArray(needsData.needs) && needsData.needs.length > 0) {
          setHelpNeeds(needsData.needs);
        }
        if (Array.isArray(commentsData.comments) && commentsData.comments.length > 0) {
          setPointComments(commentsData.comments);
        }
      } catch (error) {
        logger.warn('No se pudo sincronizar con el backend:', error);
      }
    };

    fetchConfig();
    fetchBackendData();
    // Revisa la configuración cada minuto: si se ejecuta el SQL de Supabase
    // (o cambia una variable de entorno) el estado visible se actualiza sin
    // recargar la página.
    const timer = window.setInterval(fetchConfig, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Persistencia local: un único efecto por clave para evitar escrituras
  // duplicadas y mantener la lógica de guardado en un solo lugar.
  useEffect(() => saveJSON(STORAGE_KEYS.POINTS, helpPoints), [helpPoints]);
  useEffect(() => saveJSON(STORAGE_KEYS.NEEDS, helpNeeds), [helpNeeds]);
  useEffect(() => saveJSON(STORAGE_KEYS.COMMENTS, pointComments), [pointComments]);
  useEffect(() => saveJSON(STORAGE_KEYS.PROFILE, userProfile), [userProfile]);
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
        errorMsg = 'El permiso de ubicación fue denegado en el navegador. Por favor selecciona tu barrio o márcalo en el mapa.';
      } else if ('code' in geoError && geoError.code === 2) {
        errorMsg = 'La ubicación GPS no está disponible en este dispositivo. Puedes seleccionar tu barrio en la lista.';
      } else if ('code' in geoError && geoError.code === 3) {
        errorMsg = 'Tiempo de espera agotado al consultar el GPS. Selecciona tu barrio para calcular distancias.';
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
    const R = 6371; // Earth radius in km
    const dLat = ((lat - userLocation.lat) * Math.PI) / 180;
    const dLng = ((lng - userLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.lat * Math.PI) / 180) *
        Math.cos((lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
  };

  const addHelpPoint = async (pointData: Omit<HelpPoint, 'id' | 'createdAt' | 'updatedAt' | 'verified'>) => {
    const newPoint: HelpPoint = {
      ...pointData,
      id: `cali-point-${Date.now()}`,
      verified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      authorId: userProfile.id || `usr-${Date.now()}`,
    };

    setHelpPoints((prev) => [newPoint, ...prev]);
    setUserProfile((prev) => ({
      ...prev,
      reportedPointIds: [newPoint.id, ...prev.reportedPointIds],
    }));
    setSelectedPoint(newPoint);
    setMapCenter([newPoint.lat, newPoint.lng]);
    setMapZoom(15);

    // Persist to backend & Supabase
    try {
      await apiFetch('/api/points', { method: 'POST', body: newPoint });
    } catch (error) {
      logger.warn('Punto guardado localmente, sincronización pendiente:', error);
    }
  };

  const addHelpNeed = async (needData: Omit<HelpNeed, 'id' | 'createdAt' | 'supportersCount'>) => {
    const newNeed: HelpNeed = {
      ...needData,
      id: `cali-need-${Date.now()}`,
      supportersCount: 1,
      createdAt: new Date().toISOString(),
    };

    setHelpNeeds((prev) => [newNeed, ...prev]);

    // Persist to backend & Supabase
    try {
      await apiFetch('/api/needs', { method: 'POST', body: newNeed });
    } catch (error) {
      logger.warn('Necesidad guardada localmente, sincronización pendiente:', error);
    }
  };

  const addPointComment = async (pointId: string, commentText: string): Promise<boolean> => {
    if (!userProfile.isRegistered) {
      openAuthModal('Debes crear una cuenta comunitaria para publicar comentarios y actualizaciones.');
      return false;
    }

    const newComment: PointComment = {
      id: `comm-${Date.now()}`,
      pointId,
      userId: userProfile.id || 'usr-registered',
      userName: userProfile.name,
      userRole: userProfile.role,
      userBarrio: userProfile.barrio,
      comment: commentText.trim(),
      createdAt: new Date().toISOString(),
    };

    setPointComments((prev) => [newComment, ...prev]);

    try {
      await apiFetch('/api/comments', { method: 'POST', body: newComment });
    } catch (error) {
      logger.warn('Comentario guardado localmente:', error);
    }

    return true;
  };

  const toggleSavePoint = (pointId: string) => {
    setUserProfile((prev) => {
      const exists = prev.savedPointIds.includes(pointId);
      return {
        ...prev,
        savedPointIds: exists
          ? prev.savedPointIds.filter((id) => id !== pointId)
          : [...prev.savedPointIds, pointId],
      };
    });
  };

  /**
   * Apoya o retira el apoyo de una necesidad (like conmutador).
   *
   * Requiere sesión de Clerk: el token viaja en `Authorization` y el servidor
   * lo verifica antes de aceptar. El estado se actualiza de forma optimista y
   * se revierte si el servidor no lo confirma; al terminar manda la respuesta
   * del servidor (`count` y `supported`), no la suposición local.
   */
  const supportNeed = async (needId: string, action: SupportAction) => {
    const adding = action === 'add';
    const wasSupported = supportedNeedIds.includes(needId);

    // Ya está en ese estado: un usuario no puede dar dos veces el mismo like.
    if (adding === wasSupported) return;

    /**
     * Aplica el estado local: `toSupported` decide si el corazón queda
     * relleno y `delta` cómo se mueve el contador (nunca por debajo de 0).
     */
    const applyLocalState = (toSupported: boolean, delta: 1 | -1) => {
      setSupportedNeedIds((prev) => {
        const inList = prev.includes(needId);
        if (toSupported && !inList) return [...prev, needId];
        if (!toSupported && inList) return prev.filter((id) => id !== needId);
        return prev;
      });
      setHelpNeeds((prev) =>
        prev.map((item) =>
          item.id === needId
            ? { ...item, supportersCount: Math.max(0, item.supportersCount + delta) }
            : item,
        ),
      );
    };

    applyLocalState(adding, adding ? 1 : -1);

    try {
      const token = await getToken();
      if (!token) throw new Error('No hay sesión activa.');

      const data = await apiFetch<SupportResponse>(
        `/api/needs/${encodeURIComponent(needId)}/support`,
        {
          method: 'POST',
          body: { action },
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      // El servidor es la fuente de verdad: alineamos contador y estado.
      setHelpNeeds((prev) =>
        prev.map((item) => (item.id === needId ? { ...item, supportersCount: data.count } : item)),
      );
      setSupportedNeedIds((prev) => {
        const inList = prev.includes(needId);
        if (data.supported && !inList) return [...prev, needId];
        if (!data.supported && inList) return prev.filter((id) => id !== needId);
        return prev;
      });
    } catch (error) {
      logger.warn('No se pudo registrar el apoyo:', error);
      applyLocalState(!adding, adding ? -1 : 1); // deshace lo no confirmado
    }
  };

  const updateUserProfile = (updated: Partial<UserProfile>) => {
    setUserProfile((prev) => {
      const nextProfile = { ...prev, ...updated };
      if (updated.barrio && updated.barrio !== prev.barrio && CALI_BARRIOS_DATA[updated.barrio]) {
        const b = CALI_BARRIOS_DATA[updated.barrio];
        const newCoords: UserCoordinates = {
          lat: b.lat,
          lng: b.lng,
          barrio: b.name,
          source: 'profile',
          isCustom: true,
        };
        setUserLocation(newCoords);
        setMapCenter([b.lat, b.lng]);
      }
      return nextProfile;
    });
  };

  const focusPointOnMap = (point: HelpPoint) => {
    setSelectedPoint(point);
    setMapCenter([point.lat, point.lng]);
    setMapZoom(16);
    setActiveTab('map');
  };

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        helpPoints,
        helpNeeds,
        supportedNeedIds,
        pointComments,
        userProfile,
        userLocation,
        setUserLocation,
        setUserBarrioLocation,
        setUserCustomCoordinates,
        isLocatingUser,
        locationError,
        setLocationError,
        isLocationModalOpen,
        setIsLocationModalOpen,
        selectedPoint,
        setSelectedPoint,
        selectedNeed,
        setSelectedNeed,
        isReportModalOpen,
        setIsReportModalOpen,
        reportModalType,
        setReportModalType,
        isAuthModalOpen,
        setIsAuthModalOpen,
        closeAuthModal,
        authModalMessage,
        openAuthModal,
        mapCenter,
        setMapCenter,
        mapZoom,
        setMapZoom,
        initialCoordsForNewPoint,
        setInitialCoordsForNewPoint,
        serverStatus,
        addHelpPoint,
        addHelpNeed,
        addPointComment,
        toggleSavePoint,
        supportNeed,
        updateUserProfile,
        registerUser,
        logoutUser,
        requestUserLocation,
        calculateDistance,
        focusPointOnMap,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
