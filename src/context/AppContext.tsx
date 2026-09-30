import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth, useClerk } from '@clerk/clerk-react';
import {
  CommentsResponse,
  CommentResponse,
  ConfigResponse,
  HelpNeed,
  HelpPoint,
  MySupportsResponse,
  NeedsResponse,
  NeedResponse,
  PointComment,
  PointResponse,
  PointsResponse,
  SupportAction,
  SupportResponse,
  ToastItem,
  ToastKind,
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
import { apiFetch, ApiError } from '../services/api';
import { applyConsent, readConsent, saveConsent, type CookieConsent } from '../utils/consent';
import { loadJSON, saveJSON } from '../utils/storage';
import { countPending, mergeById } from '../utils/sync';
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
  /**
   * Cierra el registro **conservando** la escritura pendiente: se usa cuando
   * el cierre forma parte del flujo (registro local o ingreso con cuenta
   * existente) y no es una cancelación. La escritura se reanuda sola al
   * entrar la sesión de Clerk.
   */
  completeAuthModal: () => void;
  /** Avisos efímeros visibles (éxito, error, aviso). */
  toasts: ToastItem[];
  /** Muestra un aviso; se cierra solo tras unos segundos. */
  notify: (message: string, kind?: ToastKind) => void;
  /** Cierra un aviso concreto (botón «Cerrar aviso»). */
  dismissToast: (id: number) => void;
  /** Preguntas frecuentes: `section` despliega esa entrada concreta. */
  isFaqOpen: boolean;
  faqSection: string | null;
  openFaq: (section?: string) => void;
  closeFaq: () => void;
  /** Consentimiento de cookies (`null` = aún sin responder). */
  cookieConsent: CookieConsent | null;
  setCookieConsent: (value: CookieConsent) => void;
  mapCenter: [number, number];
  setMapCenter: (center: [number, number]) => void;
  mapZoom: number;
  setMapZoom: (zoom: number) => void;
  initialCoordsForNewPoint: [number, number] | null;
  setInitialCoordsForNewPoint: (coords: [number, number] | null) => void;
  serverStatus: ServerStatus;
  addHelpPoint: (
    pointData: Omit<HelpPoint, 'id' | 'createdAt' | 'updatedAt' | 'verified' | 'pending'>,
  ) => Promise<void>;
  addHelpNeed: (
    needData: Omit<HelpNeed, 'id' | 'createdAt' | 'supportersCount' | 'pending'>,
  ) => Promise<void>;
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

/**
 * IDs del contenido de ejemplo local. Son relleno de arranque: la fuente de
 * verdad de esos IDs es el servidor, así que en cada sync se descartan si no
 * vienen de allá (evita duplicar los puntos oficiales en el mapa).
 */
const SEED_IDS = {
  POINTS: new Set(INITIAL_HELP_POINTS.map((point) => point.id)),
  NEEDS: new Set(INITIAL_HELP_NEEDS.map((need) => need.id)),
  COMMENTS: new Set(INITIAL_POINT_COMMENTS.map((comment) => comment.id)),
};

/** Avisos simultáneos en pantalla (se recorta por la cola). */
const MAX_TOASTS = 3;
/** Segundos que permanece cada aviso antes de cerrarse solo. */
const TOAST_DURATION_MS = 6_000;
/** Reanudaciones automáticas de una escritura guardada (p. ej. al entrar). */
const MAX_WRITE_RESUMES = 1;
/** Una escritura guardada deja de ser relevante pasados 10 minutos. */
const PENDING_WRITE_TTL_MS = 10 * 60_000;
/** Reenvíos de cada elemento local sin confirmar, por sesión de la app. */
const MAX_SYNC_ATTEMPTS = 3;
/** Enfriamiento entre avisos de identidad por 401 (evita pop-ups en bucle). */
const IDENTITY_PROMPT_COOLDOWN_MS = 5_000;
/** Mensaje por defecto cuando una escritura se queda sin identidad de Clerk. */
const IDENTITY_MESSAGE =
  'Para continuar necesitas entrar con tu cuenta de AyudaEnCali: así evitamos reportes falsos.';

/** El servidor respondió «no tienes sesión válida» (T1: 401 en las escrituras). */
const isUnauthorized = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 401;

/** El servidor ni siquiera respondió: red caída o timeout. */
const isServerUnreachable = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 0;

/** Texto amable para «N publicaciones pendientes». */
const pendingLabel = (total: number): string =>
  total === 1
    ? '1 publicación sigue sin confirmarse'
    : `${total} publicaciones siguen sin confirmarse`;

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Sesión de Clerk: identidad real para las acciones que exigen "tener
  // usuario" (p. ej. dar/retirar apoyos). `getToken` entrega el JWT que el
  // servidor verifica antes de aceptar la acción.
  const { isSignedIn, userId: clerkUserId, getToken } = useAuth();
  // Ingreso/alta/cierre de Clerk: se abre cuando una escritura se queda sin
  // sesión (la identidad es única y la decide Clerk, no el registro local).
  const { openSignIn, signOut } = useClerk();

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

  /* ------------------------------------------------------------------ *
   * Avisos visibles (T7): éxitos, errores y reintentos que antes solo
   * llegaban a `logger.warn`. El componente `Toast` (región `aria-live`)
   * vive en `App.tsx`.
   * ------------------------------------------------------------------ */
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeqRef = useRef(0);

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    toastSeqRef.current += 1;
    const id = toastSeqRef.current;
    setToasts((prev) =>
      // Sin duplicados: los reintentos suelen repetir el mismo mensaje.
      [...prev.filter((toast) => toast.message !== message), { id, kind, message }].slice(-MAX_TOASTS),
    );
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Auto-cierre: retira el aviso más antiguo cuando lleva su tiempo.
  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timer = window.setTimeout(() => setToasts((prev) => prev.slice(1)), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  /* ------------------------------------------------------------------ *
   * Escritura pendiente (T8): si alguien intenta publicar/apoyar sin
   * sesión de Clerk, la acción se guarda aquí y se reanuda en cuanto
   * entre la cuenta. Mismo espíritu que el `authCallback` del registro:
   * cancelar el modal la descarta (`closeAuthModal`), completar el flujo
   * la conserva (`completeAuthModal`).
   * ------------------------------------------------------------------ */
  interface PendingWrite {
    run: () => void;
    at: number;
    /** Veces que ya se ha reanudado; por encima de `MAX_WRITE_RESUMES` se descarta. */
    resumes: number;
  }

  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);
  // Marca la última reanudada ejecutada para no duplicarla si React vuelve
  // a ejecutar el efecto (StrictMode) antes de confirmar el `setState`.
  const consumedWriteRef = useRef<PendingWrite | null>(null);
  // Instante del último aviso de identidad (enfriamiento frente a bucles 401).
  const lastIdentityPromptRef = useRef(0);
  // Ids cuyo POST está en vuelo: el reenvío automático no debe duplicarlos.
  const inflightIdsRef = useRef<Set<string>>(new Set());
  // Intentos de reenvío por elemento local sin confirmar y por sesión.
  const syncAttemptsRef = useRef<Map<string, number>>(new Map());

  const queueWrite = (build: (resumes: number) => void, resumes: number) => {
    setPendingWrite({ run: () => build(resumes), at: Date.now(), resumes });
  };

  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [faqSection, setFaqSection] = useState<string | null>(null);

  // `null` → la persona aún no respondió el banner de cookies.
  const [cookieConsent, setCookieConsentState] = useState<CookieConsent | null>(() => readConsent());

  // Estado inicial desconocido: se completa con GET /api/config al montar.
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    supabaseConnected: false,
    supabaseUrl: null,
    supabaseTablesReady: null,
    supabaseHint: null,
    cartoConfigured: false,
    hasGeminiKey: false,
  });

  // ¿Ha respondido el servidor últimamente? Gobierna el reenvío de lo
  // pendiente y la reintentación del sync (ver `lastSyncOkRef`).
  const [serverReachable, setServerReachable] = useState(false);
  const lastSyncOkRef = useRef(false);
  // Último estado conocido del servidor, para avisar solo cuando cambia
  // (y no en cada sync de 60 s). Se arranca en «ok»: así la primera carga
  // exitosa no suelta un aviso innecesario.
  const serverReachableRef = useRef(true);
  /** Nº de elementos locales aún sin confirmar (para saber si hay que reintentar). */
  const pendingCountRef = useRef(0);

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
    // Cancelar el registro también deshace cualquier escritura guardada:
    // no debe publicarse nada más adelante sin que lo haya pedido.
    setPendingWrite(null);
    consumedWriteRef.current = null;
    lastIdentityPromptRef.current = 0;
  };

  /**
   * Variante de cierre para cuando el flujo **continúa** (se registró el
   * perfil local o se va a entrar con cuenta existente): cierra el modal y
   * descarta el callback del registro, pero conserva la escritura pendiente
   * para reanudarla en cuanto haya sesión de Clerk.
   */
  const completeAuthModal = () => {
    setIsAuthModalOpen(false);
    setAuthCallback(null);
    lastIdentityPromptRef.current = 0;
  };

  /**
   * Registra si el servidor está respondiendo (para el sync y los reenvíos).
   * Cuando el estado cambia se avisa con un toast: «se cayó» o «volvió»,
   * una sola vez por transición para no repetir el mensaje cada minuto.
   */
  const setReachable = (reachable: boolean) => {
    lastSyncOkRef.current = reachable;
    if (serverReachableRef.current !== reachable) {
      serverReachableRef.current = reachable;
      notify(
        reachable
          ? 'Conexión con el servidor restablecida: tus datos están al día.'
          : 'Sin conexión con el servidor. Lo que publiques se guarda en este dispositivo y se sincronizará al volver.',
        reachable ? 'success' : 'error',
      );
    }
    setServerReachable((prev) => (prev === reachable ? prev : reachable));
  };

  /**
   * Abre el flujo de identidad correspondiente, con enfriamento corto para
   * que los reintentos automáticos no apilen ventanas encima del usuario.
   */
  const promptForIdentity = (message: string) => {
    const now = Date.now();
    if (now - lastIdentityPromptRef.current < IDENTITY_PROMPT_COOLDOWN_MS) return;
    lastIdentityPromptRef.current = now;
    if (!userProfile.isRegistered) openAuthModal(message);
    else openSignIn();
  };

  /**
   * Guarda una escritura y abre el flujo de identidad para reanudarla al
   * entrar. Devuelve `true` si la acción puede ejecutarse ahora mismo.
   *
   * Es la única puerta de entrada de las escrituras (T8): sin sesión de
   * Clerk no se escribe ni en el servidor ni en el dispositivo.
   */
  const ensureIdentity = (
    build: (resumes: number) => void,
    resumes: number,
    message: string,
  ): boolean => {
    if (isSignedIn && clerkUserId) return true;
    queueWrite(build, resumes + 1);
    // Acción explícita del usuario: siempre se abre algo visible (no aplica
    // el enfriamiento de los 401 automáticos).
    lastIdentityPromptRef.current = Date.now();
    if (!userProfile.isRegistered) openAuthModal(message);
    else openSignIn();
    return false;
  };

  /**
   * Un `401` (T1) significa que la identidad no vale: sesión caducada o
   * ausente. Se avisa con un toast y se vuelve a abrir el ingreso; lo que ya
   * estuviera guardado localmente sigue `pending` y se reintentará.
   */
  const handleUnauthorized = (message: string) => {
    setReachable(true); // respondió el servidor: solo falla la identidad
    notify(message, 'warning');
    promptForIdentity(IDENTITY_MESSAGE);
  };

  /** El servidor rechazó o no contestó al publicar: el ítem queda local. */
  const handlePublishError = (error: unknown, what: string) => {
    if (isUnauthorized(error)) {
      handleUnauthorized(`Tu sesión caducó: vuelve a entrar para completar ${what}.`);
      return;
    }
    if (isServerUnreachable(error)) setReachable(false);
    logger.warn(`No se pudo publicar ${what}:`, error);
    notify(
      `No pudimos publicar ${what} en el servidor. Queda guardado en tu dispositivo y se reintentará en cuanto vuelva la conexión.`,
      'error',
    );
  };

  const openFaq = (section?: string) => {
    setFaqSection(section ?? null);
    setIsFaqOpen(true);
  };

  const closeFaq = () => {
    setIsFaqOpen(false);
    setFaqSection(null);
  };

  /**
   * Guarda la elección de cookies y la aplica al documento (carga o retira los
   * recursos de terceros). Cada cambio es reversible desde el propio FAQ.
   */
  const setCookieConsent = (value: CookieConsent) => {
    saveConsent(value);
    applyConsent(value);
    setCookieConsentState(value);
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

  /**
   * Cierra la sesión **de verdad** (T5): limpia el perfil local, el estado
   * derivado de la sesión (apoyos, escritura en cola, callback de registro) y
   * cierra además la sesión de Clerk si la hay. Sin sesión de Clerk solo se
   * limpia el perfil local, como antes.
   *
   * El `.finally` vuelve a limpiar el perfil por si `ClerkSync` lo repuso
   * mientras la sesión se estaba cerrando (hay una ventana en la que Clerk
   * sigue `isSignedIn` y él realinea el perfil).
   */
  const logoutUser = () => {
    setSupportedNeedIds([]);
    setPendingWrite(null);
    consumedWriteRef.current = null;
    setAuthCallback(null);
    setIsAuthModalOpen(false);
    lastIdentityPromptRef.current = 0;
    setUserProfile(INITIAL_USER_PROFILE);

    if (!isSignedIn) {
      notify('Sesión cerrada.', 'info');
      return;
    }

    void signOut()
      .then(() => notify('Sesión cerrada. Ya puedes entrar con otra cuenta.', 'info'))
      .catch((error: unknown) => {
        logger.warn('No se pudo cerrar la sesión de Clerk:', error);
        notify('No se pudo cerrar la sesión de Clerk. Inténtalo de nuevo.', 'error');
      })
      .finally(() => {
        setUserProfile(INITIAL_USER_PROFILE);
        setSupportedNeedIds([]);
      });
  };

  // Reanuda la escritura guardada en cuanto entra la sesión de Clerk.
  useEffect(() => {
    if (!pendingWrite || !isSignedIn || !clerkUserId) return;
    // React puede volver a ejecutar este efecto en StrictMode antes de que el
    // `setState` se confirme: la identidad del objeto evita ejecutarla dos veces.
    if (consumedWriteRef.current === pendingWrite) return;
    consumedWriteRef.current = pendingWrite;
    setPendingWrite(null);

    if (Date.now() - pendingWrite.at > PENDING_WRITE_TTL_MS) {
      logger.debug('Escritura pendiente descartada: caducó la acción original.');
      return;
    }
    if (pendingWrite.resumes > MAX_WRITE_RESUMES) {
      logger.debug('Escritura pendiente descartada: agotadas las reanudaciones automáticas.');
      return;
    }

    lastIdentityPromptRef.current = 0; // ya hay sesión: se puede pedir de nuevo
    pendingWrite.run();
  }, [isSignedIn, clerkUserId, pendingWrite]);

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
        setReachable(true);

        // Fusión por `id` (T6): lo del servidor actualiza lo local y lo local
        // que allí no aparece (reportes hechos con el servidor caído) se
        // conserva marcado como `pending` en lugar de borrarse.
        if (Array.isArray(pointsData.points)) {
          setHelpPoints((prev) => mergeById(prev, pointsData.points, SEED_IDS.POINTS));
        }
        if (Array.isArray(needsData.needs)) {
          setHelpNeeds((prev) => mergeById(prev, needsData.needs, SEED_IDS.NEEDS));
        }
        if (Array.isArray(commentsData.comments)) {
          setPointComments((prev) => mergeById(prev, commentsData.comments, SEED_IDS.COMMENTS));
        }
      } catch (error) {
        if (!cancelled) setReachable(false);
        logger.warn('No se pudo sincronizar con el backend:', error);
      }
    };

    fetchConfig();
    fetchBackendData();
    // Revisa la configuración cada minuto. La sincronización solo se repite
    // mientras falle o haya algo pendiente de confirmar: así, si el servidor
    // estaba caído, la app se recupera sola sin recargar la página.
    const timer = window.setInterval(() => {
      fetchConfig();
      if (!lastSyncOkRef.current || pendingCountRef.current > 0) void fetchBackendData();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Locales aún sin confirmar por el servidor (T6): alimenta el contador que
  // decide cuándo reintentar el sync y avisa a la persona usuaria.
  const pendingCount =
    countPending(helpPoints) + countPending(helpNeeds) + countPending(pointComments);

  useEffect(() => {
    pendingCountRef.current = pendingCount;
  }, [pendingCount]);

  // Aviso visible: «tu reporte se guardó pero aún no está en el servidor» y,
  // si se confirma, «ya está todo sincronizado». Una sola vez por bloque.
  const pendingWarnedRef = useRef(false);
  const hadPendingRef = useRef(false);
  useEffect(() => {
    if (pendingCount === 0) {
      if (hadPendingRef.current) {
        hadPendingRef.current = false;
        pendingWarnedRef.current = false;
        notify('Ya está todo sincronizado con el servidor.', 'success');
      }
      return;
    }
    hadPendingRef.current = true;
    if (pendingWarnedRef.current) return;
    pendingWarnedRef.current = true;
    notify(
      `${pendingLabel(pendingCount)}: se guardaron en tu dispositivo y se reintentará la sincronización.`,
      'warning',
    );
  }, [pendingCount, notify]);

  /**
   * El servidor confirmó un elemento local: se adopta su versión (que puede
   * traer otro `id`, `verified: false`, contadores reales…) y se retira la
   * marca `pending`. Si el id cambió, se mueven también las referencias
   * locales que lo usaban.
   */
  const confirmPoint = (localId: string, confirmed?: HelpPoint) => {
    setHelpPoints((prev) =>
      prev.map((item) => (item.id === localId ? { ...(confirmed ?? item), pending: false } : item)),
    );
    if (!confirmed || confirmed.id === localId) return;
    setSelectedPoint((prev) => (prev && prev.id === localId ? confirmed : prev));
    setUserProfile((prev) => ({
      ...prev,
      reportedPointIds: prev.reportedPointIds.map((id) => (id === localId ? confirmed.id : id)),
      savedPointIds: prev.savedPointIds.map((id) => (id === localId ? confirmed.id : id)),
    }));
  };

  const confirmNeed = (localId: string, confirmed?: HelpNeed) => {
    setHelpNeeds((prev) =>
      prev.map((item) => (item.id === localId ? { ...(confirmed ?? item), pending: false } : item)),
    );
    if (!confirmed || confirmed.id === localId) return;
    setSelectedNeed((prev) => (prev && prev.id === localId ? confirmed : prev));
  };

  const confirmComment = (localId: string, confirmed?: PointComment) => {
    setPointComments((prev) =>
      prev.map((item) => (item.id === localId ? { ...(confirmed ?? item), pending: false } : item)),
    );
  };

  /**
   * Reenvío automático de lo que quedó `pending` (reportes, necesidades y
   * comentarios creados sin conexión o rechazados). Solo mientras el
   * servidor responda y haya sesión de Clerk (T1: las escrituras exigen
   * identidad), y como máximo `MAX_SYNC_ATTEMPTS` veces por elemento y
   * sesión para no machacar el servidor ni duplicar publicaciones.
   *
   * Los identificadores en vuelo (`inflightIdsRef`) quedan fuera: quien
   * acaba de publicar ya está esperando su respuesta.
   */
  useEffect(() => {
    if (!serverReachable || !isSignedIn || !clerkUserId) return;

    let cancelled = false;

    const takeAttempt = (key: string): boolean => {
      const used = syncAttemptsRef.current.get(key) ?? 0;
      if (used >= MAX_SYNC_ATTEMPTS) return false;
      syncAttemptsRef.current.set(key, used + 1);
      return true;
    };

    /**
     * Reenvía los elementos `pending` de una lista. `send` hace la
     * petición concreta; si el servidor la confirma, el elemento se
     * reemplaza por la respuesta y deja de estar pendiente.
     */
    const resendPending = async <T extends { id: string; pending?: boolean }>(
      items: readonly T[],
      unauthorizedMessage: string,
      send: (item: T) => Promise<void>,
    ): Promise<void> => {
      for (const item of items) {
        if (item.pending !== true) continue;
        if (cancelled || inflightIdsRef.current.has(item.id) || !takeAttempt(item.id)) continue;

        inflightIdsRef.current.add(item.id);
        try {
          await send(item);
        } catch (error) {
          if (cancelled) return;
          if (isUnauthorized(error)) {
            handleUnauthorized(unauthorizedMessage);
          } else {
            if (isServerUnreachable(error)) setReachable(false);
            logger.warn('Reenvío de elemento pendiente fallido:', error);
          }
        } finally {
          inflightIdsRef.current.delete(item.id);
        }
        if (cancelled) return;
      }
    };

    const run = async () => {
      const token = await getToken().catch(() => null);
      if (!token || cancelled) return;

      await resendPending(
        helpPoints,
        'Tu sesión caducó: vuelve a entrar para sincronizar tus reportes.',
        async (point) => {
          const data = await apiFetch<PointResponse>('/api/points', {
            method: 'POST',
            body: point,
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelled) confirmPoint(point.id, data.point);
        },
      );

      await resendPending(
        helpNeeds,
        'Tu sesión caducó: vuelve a entrar para sincronizar tus necesidades.',
        async (need) => {
          const data = await apiFetch<NeedResponse>('/api/needs', {
            method: 'POST',
            body: need,
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelled) confirmNeed(need.id, data.need);
        },
      );

      await resendPending(
        pointComments,
        'Tu sesión caducó: vuelve a entrar para sincronizar tus comentarios.',
        async (comment) => {
          const data = await apiFetch<CommentResponse>('/api/comments', {
            method: 'POST',
            body: comment,
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelled) confirmComment(comment.id, data.comment);
        },
      );
    };

    void run();
    return () => {
      cancelled = true;
    };
    // Los ayudantes (`confirm*`, `handleUnauthorized`) se recrean en cada
    // render: no van en las dependencias para no reejecutar el efecto sin
    // motivo; los datos que sí cambian (listas, sesión, conexión) sí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpPoints, helpNeeds, pointComments, serverReachable, isSignedIn, clerkUserId, getToken]);

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

  /**
   * Publica un punto de ayuda en el mapa.
   *
   * - **T8**: sin sesión de Clerk no se escribe nada; la acción se guarda y
   *   se reanuda en cuanto entre la cuenta.
   * - **T6**: si el servidor no llega a confirmarlo, el punto se queda en el
   *   dispositivo con `pending: true` y se reintenta (nunca se pierde).
   * - **T7**: éxito y fallo se cuentan con un toast, no solo en el logger.
   */
  const addHelpPoint = async (
    pointData: Omit<HelpPoint, 'id' | 'createdAt' | 'updatedAt' | 'verified' | 'pending'>,
    resumes = 0,
  ): Promise<void> => {
    if (
      !ensureIdentity(
        (more) => void addHelpPoint(pointData, more),
        resumes,
        'Para publicar un punto de ayuda necesitas iniciar sesión con tu cuenta.',
      )
    ) {
      return;
    }

    const newPoint: HelpPoint = {
      ...pointData,
      id: `cali-point-${Date.now()}`,
      pending: true,
      // Nace sin verificar (decisión 2026-09-28): la verificación es un paso aparte.
      verified: false,
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

    const token = await getToken().catch(() => null);
    if (!token) {
      // Sin token no hay identidad: el punto queda local y pendiente.
      handleUnauthorized('Tu sesión no está activa: vuelve a entrar para publicar el punto.');
      return;
    }

    inflightIdsRef.current.add(newPoint.id);
    try {
      const data = await apiFetch<PointResponse>('/api/points', {
        method: 'POST',
        body: newPoint,
        headers: { Authorization: `Bearer ${token}` },
      });
      confirmPoint(newPoint.id, data.point);
      notify('Punto publicado: ya aparece en el mapa para la comunidad de Cali.', 'success');
    } catch (error) {
      handlePublishError(error, 'el punto');
    } finally {
      inflightIdsRef.current.delete(newPoint.id);
    }
  };

  /** Misma política que `addHelpPoint`, para el tablón de necesidades. */
  const addHelpNeed = async (
    needData: Omit<HelpNeed, 'id' | 'createdAt' | 'supportersCount' | 'pending'>,
    resumes = 0,
  ): Promise<void> => {
    if (
      !ensureIdentity(
        (more) => void addHelpNeed(needData, more),
        resumes,
        'Para publicar una necesidad necesitas iniciar sesión con tu cuenta.',
      )
    ) {
      return;
    }

    const newNeed: HelpNeed = {
      ...needData,
      id: `cali-need-${Date.now()}`,
      pending: true,
      supportersCount: 1,
      createdAt: new Date().toISOString(),
    };

    setHelpNeeds((prev) => [newNeed, ...prev]);

    const token = await getToken().catch(() => null);
    if (!token) {
      handleUnauthorized('Tu sesión no está activa: vuelve a entrar para publicar la necesidad.');
      return;
    }

    inflightIdsRef.current.add(newNeed.id);
    try {
      const data = await apiFetch<NeedResponse>('/api/needs', {
        method: 'POST',
        body: newNeed,
        headers: { Authorization: `Bearer ${token}` },
      });
      confirmNeed(newNeed.id, data.need);
      notify('Necesidad publicada en el tablón comunitario.', 'success');
    } catch (error) {
      handlePublishError(error, 'la necesidad');
    } finally {
      inflightIdsRef.current.delete(newNeed.id);
    }
  };

  /**
   * Comentario sobre un punto. Misma política: identidad antes de escribir,
   * `pending` si el servidor no lo confirma y aviso visible en ambos casos.
   * Devuelve `true` si el comentario se aceptó (publicado o en cola).
   */
  const addPointComment = async (
    pointId: string,
    commentText: string,
    resumes = 0,
  ): Promise<boolean> => {
    if (
      !ensureIdentity(
        (more) => void addPointComment(pointId, commentText, more),
        resumes,
        'Debes iniciar sesión con tu cuenta para publicar comentarios y actualizaciones.',
      )
    ) {
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
      pending: true,
      createdAt: new Date().toISOString(),
    };

    setPointComments((prev) => [newComment, ...prev]);

    const token = await getToken().catch(() => null);
    if (!token) {
      handleUnauthorized('Tu sesión no está activa: vuelve a entrar para publicar el comentario.');
      return true;
    }

    inflightIdsRef.current.add(newComment.id);
    try {
      const data = await apiFetch<CommentResponse>('/api/comments', {
        method: 'POST',
        body: newComment,
        headers: { Authorization: `Bearer ${token}` },
      });
      confirmComment(newComment.id, data.comment);
      notify('Comentario publicado.', 'success');
    } catch (error) {
      handlePublishError(error, 'el comentario');
    } finally {
      inflightIdsRef.current.delete(newComment.id);
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
   *
   * T8/T7: sin sesión la acción queda en cola para reanudarla al entrar, y
   * cuando se revierte el cambio se avisa con un toast (antes era en silencio).
   */
  const supportNeed = async (needId: string, action: SupportAction, resumes = 0): Promise<void> => {
    const adding = action === 'add';
    const wasSupported = supportedNeedIds.includes(needId);

    // Ya está en ese estado: un usuario no puede dar dos veces el mismo like.
    if (adding === wasSupported) return;

    if (
      !ensureIdentity(
        (more) => void supportNeed(needId, action, more),
        resumes,
        'Inicia sesión con tu cuenta para apoyar esta necesidad.',
      )
    ) {
      return;
    }

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
      const token = await getToken().catch(() => null);
      if (!token) throw new ApiError('No hay sesión activa.', 401);

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
      setReachable(true);
    } catch (error) {
      logger.warn('No se pudo registrar el apoyo:', error);
      applyLocalState(!adding, adding ? -1 : 1); // deshace lo no confirmado

      if (isUnauthorized(error)) {
        // Identidad que ya no sirve: se avisa, se reabre el ingreso y la
        // acción queda en cola (una sola reanudación automática).
        handleUnauthorized('Tu sesión caducó: se deshizo tu apoyo. Vuelve a entrar para apoyar de nuevo.');
        queueWrite((more) => void supportNeed(needId, action, more), resumes + 1);
      } else {
        if (isServerUnreachable(error)) setReachable(false);
        notify('No pudimos registrar tu apoyo: se deshizo el cambio. Inténtalo de nuevo.', 'warning');
      }
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
        completeAuthModal,
        authModalMessage,
        openAuthModal,
        toasts,
        notify,
        dismissToast,
        isFaqOpen,
        faqSection,
        openFaq,
        closeFaq,
        cookieConsent,
        setCookieConsent,
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
