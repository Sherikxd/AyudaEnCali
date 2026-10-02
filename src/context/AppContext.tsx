import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useAuth, useClerk } from '@clerk/clerk-react';
import {
  CommentsResponse,
  CommentResponse,
  ConfigResponse,
  DeleteResponse,
  HelpNeed,
  HelpPoint,
  MySupportsResponse,
  NeedPatch,
  NeedsResponse,
  NeedResponse,
  PointComment,
  PointPatch,
  PointResponse,
  PointsResponse,
  SupportAction,
  SupportResponse,
  ToastAction,
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
import { countFailed, countPending, mergeById } from '../utils/sync';
import { newId } from '../utils/id';
import { barrioLabel, formatKm, needDistanceKm, sameBarrio } from '../utils/proximity';
import {
  DEFAULT_TAB,
  hashForTab,
  initialTabFromHash,
  tabFromHash,
  type TabKey,
} from '../utils/tabUrl';
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
  activeTab: TabKey;
  /** Cambia de pestaña **y** escribe su hash en la URL (T38). */
  setActiveTab: (tab: TabKey) => void;
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
  /**
   * Muestra un aviso; se cierra solo tras unos segundos, salvo que lleve
   * `actions` (entonces exige decisión). Devuelve su `id` para poder
   * cerrarlo o reemplazarlo desde una acción.
   */
  notify: (message: string, kind?: ToastKind, actions?: ToastAction[]) => number;
  /** Cierra un aviso concreto (botón «Cerrar aviso»). */
  dismissToast: (id: number) => void;
  /**
   * Alertas locales por barrio (MEJ-03): suscripción **optativa** a avisos
   * de nuevas necesidades cerca del usuario. Persistida en el dispositivo.
   */
  needAlertsEnabled: boolean;
  setNeedAlertsEnabled: (enabled: boolean) => void;
  /** Consentimiento de cookies (`null` = aún sin responder). */
  cookieConsent: CookieConsent | null;
  setCookieConsent: (value: CookieConsent) => void;
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
  /**
   * Ciclo de vida (T10 · FEAT-01): edición y borrado de lo que publicó la
   * cuenta actual. La identidad viaja **solo** en el JWT de Clerk (nunca en
   * el cuerpo): el servidor responde 401 sin sesión y 403 si no eres el
   * autor. Devuelven `true` cuando el cambio quedó confirmado por el
   * servidor (o aplicado localmente si el elemento sigue `pending`).
   */
  updateNeed: (needId: string, patch: NeedPatch) => Promise<boolean>;
  deleteNeed: (needId: string) => Promise<boolean>;
  updatePoint: (pointId: string, patch: PointPatch) => Promise<boolean>;
  deletePoint: (pointId: string) => Promise<boolean>;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * Estado de la vista del mapa, separado del resto del contexto
 * (T12 · FAL-09): centrar el mapa o seleccionar un punto actualiza
 * **solo** a los consumidores de este contexto (MapView, ReportModal y
 * los botones de «ver en el mapa» del chat y el perfil), en vez de
 * re-renderizar tablón, cabecera y modales de paso.
 */
interface MapUIContextType {
  mapCenter: [number, number];
  setMapCenter: (center: [number, number]) => void;
  mapZoom: number;
  setMapZoom: (zoom: number) => void;
  selectedPoint: HelpPoint | null;
  setSelectedPoint: (point: HelpPoint | null) => void;
  initialCoordsForNewPoint: [number, number] | null;
  setInitialCoordsForNewPoint: (coords: [number, number] | null) => void;
  /** Centra el mapa en un punto, lo selecciona y salta a la pestaña «Mapa». */
  focusPointOnMap: (point: HelpPoint) => void;
}

const MapUIContext = createContext<MapUIContextType | undefined>(undefined);

/**
 * Devuelve `fn` con identidad estable (T12 · FAL-09): el wrapper se crea
 * una sola vez y siempre delega en la copia del último render. Así el
 * `value` del Provider puede memorizarse sin que las acciones —que se
 * recrean en cada render— invaliden el `memo` ni queden con estado
 * obsoleto. Solo se usa en las acciones expuestas por el contexto; por
 * dentro el resto del código sigue llamando a las funciones originales.
 */
function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A): R => ref.current(...args), []);
}

const STORAGE_KEYS = {
  POINTS: 'ayudaencali_points_v4',
  NEEDS: 'ayudaencali_needs_v3',
  COMMENTS: 'ayudaencali_comments_v3',
  PROFILE: 'ayudaencali_profile_v3',
  LOCATION: 'ayudaencali_location_v2',
  /** Suscripción a alertas de nuevas necesidades cerca del usuario (MEJ-03). */
  NEED_ALERTS: 'ayudaencali_need_alerts_v1',
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
/**
 * Cadencia del sondeo de nuevas necesidades (MEJ-03). Solo con la
 * suscripción activa y usando el **mismo** `GET /api/needs` del sync: sin
 * coordenadas en la petición, sin funciones nuevas ni dependencias.
 */
const NEED_ALERT_POLL_MS = 75_000;
/** Máximo de novedades que se detallan en un aviso de cercanía (MEJ-03). */
const MAX_ALERTED_NEEDS = 3;

/**
 * Campos de identidad que el cliente ya **no** envía en los cuerros de
 * escritura (T9 · FAL-03): la identidad viaja solo en el JWT de Clerk y el
 * servidor la lee de ahí. Se retiran también del reenvío de lo pendiente
 * para que ningún payload vuelva a mandarlos.
 */
const IDENTITY_KEYS = ['authorId', 'userId', 'userName', 'userRole', 'userBarrio', 'verified'] as const;

const withoutIdentity = (payload: object): Record<string, unknown> => {
  const clean: Record<string, unknown> = { ...payload };
  for (const key of IDENTITY_KEYS) delete clean[key];
  return clean;
};

/** El servidor respondió «no tienes sesión válida» (T1: 401 en las escrituras). */
const isUnauthorized = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 401;

/** El servidor ni siquiera respondió: red caída o timeout. */
const isServerUnreachable = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 0;

/**
 * Rechazo **permanente** (BUG-02): un 4xx que volver a enviar no va a
 * arreglar. Se separa del transitorio (red, 5xx, 429 y los 401/408 que ya
 * tienen su propio flujo) para poder pasar el ítem a estado `failed` y
 * ofrecer acciones en lugar de reintentarlo 3 veces en vano.
 */
const isPermanentRejection = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 401 &&
  error.status !== 408 &&
  error.status !== 429;

/** A qué lista local pertenece un elemento encolado (BUG-02). */
type SyncKind = 'point' | 'need' | 'comment';

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

  /**
   * Pestaña activa (T38 · pestaña ↔ URL): al cargar se mira el hash de la
   * URL —`#mapa`, `#tablon`, `#asistente`, `#perfil`— y sin hash se abre la
   * de siempre (`map`). Los hash ajenos a las pestañas
   * (`#preguntas-frecuentes`) no cambian la vista.
   */
  const [activeTab, setActiveTabState] = useState<TabKey>(() =>
    initialTabFromHash(window.location.hash),
  );

  /**
   * Cambia de pestaña y deja su hash en el historial (`pushState`, nunca
   * `location.hash`: no ancla ni recarga). El hash permite compartir el estado
   * de la SPA y hace que «atrás» vuelva a la pestaña anterior; no es una URL
   * indexable distinta. La raíz (`/`) ya representa al mapa por defecto.
   */
  const setActiveTab = useCallback((tab: TabKey) => {
    setActiveTabState(tab);
    const desired = hashForTab(tab);
    if (window.location.hash === desired) return;
    if (tab === DEFAULT_TAB && window.location.hash === '') return;
    window.history.pushState(null, '', desired);
  }, []);

  // Sin hash, la pestaña por defecto queda explícita (`/#mapa`) para que «atrás»
  // tras cambiar de pestaña aterrice en un estado conocido. `replaceState` no
  // añade entrada ni dispara eventos.
  useEffect(() => {
    if (window.location.hash === '') {
      window.history.replaceState(null, '', hashForTab(DEFAULT_TAB));
    }
  }, []);

  // Back/forward y hashes escritos a mano: la pestaña sigue a la URL. Un
  // hash que no es de pestaña (p. ej. `#preguntas-frecuentes`) no mueve la
  // vista, solo ancla donde ya se anclaría el navegador.
  useEffect(() => {
    const syncTabFromUrl = () => {
      const hash = window.location.hash;
      const tab = tabFromHash(hash);
      if (tab) setActiveTabState(tab);
      else if (hash === '') setActiveTabState(DEFAULT_TAB);
    };
    window.addEventListener('popstate', syncTabFromUrl);
    window.addEventListener('hashchange', syncTabFromUrl);
    return () => {
      window.removeEventListener('popstate', syncTabFromUrl);
      window.removeEventListener('hashchange', syncTabFromUrl);
    };
  }, []);

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

  /**
   * Espejo de la identidad vigente (mismo patrón que `serverReachableRef`).
   * La cola `pendingWrite` guarda un `build` que cierra sobre el render en
   * que se encoló; al reanudarse, `ensureIdentity` debe juzgar con la sesión
   * ACTUAL o la escritura se re-encolaría para siempre en vez de ejecutarse
   * (T8 · lo cubre el L6 de `scripts/test-nucleos.mjs`).
   */
  const identityRef = useRef({ isSignedIn, clerkUserId, isRegistered: userProfile.isRegistered });
  identityRef.current = { isSignedIn, clerkUserId, isRegistered: userProfile.isRegistered };

  /* ------------------------------------------------------------------ *
   * Avisos visibles (T7): éxitos, errores y reintentos que antes solo
   * llegaban a `logger.warn`. El componente `Toast` (región `aria-live`)
   * vive en `App.tsx`.
   * ------------------------------------------------------------------ */
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeqRef = useRef(0);

  /**
   * Aviso visible. `actions` añade botones (BUG-02): en ese caso el aviso
   * **no** se cierra solo, porque exige una decisión (reintentar / descartar)
   * y cerrarlo en silencio dejaría datos sin resolver.
   */
  const notify = useCallback(
    (message: string, kind: ToastKind = 'info', actions?: ToastAction[]): number => {
      toastSeqRef.current += 1;
      const id = toastSeqRef.current;
      setToasts((prev) =>
        // Sin duplicados: los reintentos suelen repetir el mismo mensaje.
        [
          ...prev.filter((toast) => toast.message !== message),
          actions && actions.length > 0 ? { id, kind, message, actions } : { id, kind, message },
        ].slice(-MAX_TOASTS),
      );
      return id;
    },
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Auto-cierre: retira el aviso más antiguo que no requiera decisión
  // (los avisos con `actions` se quedan hasta que se actúe sobre ellos).
  useEffect(() => {
    const needsDecision = (toast: ToastItem): boolean =>
      toast.actions !== undefined && toast.actions.length > 0;
    if (toasts.every(needsDecision)) return undefined;
    const timer = window.setTimeout(() => {
      setToasts((prev) => {
        const index = prev.findIndex((toast) => !needsDecision(toast));
        return index === -1 ? prev : [...prev.slice(0, index), ...prev.slice(index + 1)];
      });
    }, TOAST_DURATION_MS);
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

  // `null` → la persona aún no respondió el banner de cookies.
  const [cookieConsent, setCookieConsentState] = useState<CookieConsent | null>(() => readConsent());

  /**
   * Alertas locales por barrio (MEJ-03): suscripción **optativa** y
   * persistida en el dispositivo. Por defecto apagada: nadie recibe avisos
   * sin haberlos pedido.
   */
  const [needAlertsEnabled, setNeedAlertsEnabledState] = useState<boolean>(
    () => loadJSON<boolean>(STORAGE_KEYS.NEED_ALERTS, false) === true,
  );
  const setNeedAlertsEnabled = useCallback((enabled: boolean) => {
    saveJSON(STORAGE_KEYS.NEED_ALERTS, enabled);
    setNeedAlertsEnabledState(enabled);
  }, []);

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

  /**
   * Espejo de las tres listas locales (BUG-02): las acciones que se guardan
   * dentro de un aviso (`ToastAction`) se crean en el render en que se
   * muestra y se ejecutan más tarde; leen este ref para trabajar siempre con
   * el estado vigente y no con una copia congelada. Mismo patrón que
   * `identityRef` / `serverReachableRef`.
   */
  const listsRef = useRef({ points: helpPoints, needs: helpNeeds, comments: pointComments });
  listsRef.current = { points: helpPoints, needs: helpNeeds, comments: pointComments };

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
    // Identidad ACTUAL (espejo): `build` puede venir de la cola y cerrar
    // sobre un render sin sesión; con la lectura directa nunca se reanudaría.
    const current = identityRef.current;
    if (current.isSignedIn && current.clerkUserId) return true;
    queueWrite(build, resumes + 1);
    // Acción explícita del usuario: siempre se abre algo visible (no aplica
    // el enfriamiento de los 401 automáticos).
    lastIdentityPromptRef.current = Date.now();
    if (!current.isRegistered) openAuthModal(message);
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

  /* ------------------------------------------------------------------ *
   * Rechazos permanentes (BUG-02): el ítem pasa a `failed` conservando
   * su payload; a partir de ahí solo se mueve con una acción explícita
   * (reintentar / descartar) desde el aviso visible.
   * ------------------------------------------------------------------ */

  /** Marca un elemento concreto de una lista como rechazado, sin tocar su payload. */
  const markItemFailed = <T extends { id: string; syncFailed?: boolean; syncError?: string }>(
    setList: React.Dispatch<React.SetStateAction<T[]>>,
    id: string,
    reason: string,
  ): void => {
    setList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, syncFailed: true, syncError: reason } : item)),
    );
  };

  /** `markItemFailed` resolviendo a qué lista pertenece el id. */
  const markFailed = (kind: SyncKind, id: string, reason: string): void => {
    if (kind === 'point') markItemFailed<HelpPoint>(setHelpPoints, id, reason);
    else if (kind === 'need') markItemFailed<HelpNeed>(setHelpNeeds, id, reason);
    else markItemFailed<PointComment>(setPointComments, id, reason);
  };

  /** Quita la marca de rechazo y reinicia sus reenvíos (bug: 3 intentos/session). */
  const clearFailedFlags = (ids: ReadonlySet<string>): void => {
    for (const id of ids) {
      syncAttemptsRef.current.delete(id);
      inflightIdsRef.current.delete(id);
    }
    const strip = <T extends { id: string; syncFailed?: boolean; syncError?: string }>(
      prev: readonly T[],
    ): T[] =>
      prev.map((item) =>
        ids.has(item.id)
          ? { ...item, syncFailed: undefined, syncError: undefined }
          : item,
      );
    setHelpPoints((prev) => strip(prev));
    setHelpNeeds((prev) => strip(prev));
    setPointComments((prev) => strip(prev));
  };

  /** Ids rechazados ahora mismo (lee el espejo de listas: estado vigente). */
  const currentFailedIds = (): string[] => {
    const { points, needs, comments } = listsRef.current;
    return [...points, ...needs, ...comments]
      .filter((item) => item.syncFailed === true)
      .map((item) => item.id);
  };

  /**
   * Reintenta a mano todos los rechazados: limpia marcas y contadores de
   * intentos para que el reenvío automático vuelva a cogerlos. Si no hay
   * sesión de Clerk se abre el flujo de identidad existente (`ensureIdentity`
   * solo encola escrituras puntuales; aquí basta con entrar: el reenvío
   * automático se dispara solo al llegar la sesión).
   */
  const retryFailedWrites = (): void => {
    const ids = currentFailedIds();
    if (ids.length === 0) return;
    clearFailedFlags(new Set(ids));

    const current = identityRef.current;
    if (current.isSignedIn && current.clerkUserId) return;
    lastIdentityPromptRef.current = Date.now();
    if (!current.isRegistered) {
      openAuthModal('Vuelve a entrar con tu cuenta para reintentar tus publicaciones rechazadas.');
    } else {
      openSignIn();
    }
  };

  /**
   * Descarta a mano lo rechazado **con confirmación previa** (el aviso de
   * dos pasos lo monta quien lo llama): se borra del dispositivo, nunca en
   * silencio. En un punto se retiran también sus comentarios locales
   * pendientes (no podrían sincronizarse sin el punto).
   */
  const discardFailedWrites = (): void => {
    const ids = currentFailedIds();
    if (ids.length === 0) return;
    const idSet = new Set(ids);

    const removedPointIds = listsRef.current.points
      .filter((point) => idSet.has(point.id))
      .map((point) => point.id);

    clearFailedFlags(idSet);
    setHelpPoints((prev) => prev.filter((item) => !idSet.has(item.id)));
    setHelpNeeds((prev) => prev.filter((item) => !idSet.has(item.id)));
    setPointComments(
      (prev) =>
        prev.filter(
          (comment) =>
            !idSet.has(comment.id) &&
            !removedPointIds.includes(comment.pointId),
        ),
    );
    setUserProfile((prev) => ({
      ...prev,
      reportedPointIds: prev.reportedPointIds.filter((id) => !idSet.has(id)),
      savedPointIds: prev.savedPointIds.filter((id) => !idSet.has(id)),
    }));
    setSelectedPoint((prev) => (prev && idSet.has(prev.id) ? null : prev));
    setSelectedNeed((prev) => (prev && idSet.has(prev.id) ? null : prev));
    notify(
      ids.length === 1
        ? 'Publicación descartada de este dispositivo.'
        : `${ids.length} publicaciones descartadas de este dispositivo.`,
      'info',
    );
  };

  /** El servidor rechazó o no contestó al publicar: el ítem queda local. */
  const handlePublishError = (error: unknown, what: string, failed?: { kind: SyncKind; id: string }) => {
    if (isUnauthorized(error)) {
      handleUnauthorized(`Tu sesión caducó: vuelve a entrar para completar ${what}.`);
      return;
    }
    if (isServerUnreachable(error)) setReachable(false);
    logger.warn(`No se pudo publicar ${what}:`, error);
    // Rechazo permanente (BUG-02): no prometemos «se reintentará» si el
    // servidor ya dijo que no. El ítem queda en `failed` y el aviso
    // accionable (reintentar / descartar) lo saca el efecto de rechazados.
    if (failed && isPermanentRejection(error)) {
      markFailed(failed.kind, failed.id, error.message);
      return;
    }
    notify(
      `No pudimos publicar ${what} en el servidor. Queda guardado en tu dispositivo y se reintentará en cuanto vuelva la conexión.`,
      'error',
    );
  };

  /**
   * Fallo de una operación del ciclo de vida (`PATCH/PUT/DELETE`): traduce
   * el status a un aviso visible con el mensaje del servidor (403 «solo el
   * autor», 404 «ya no existe»…). Siempre con `Toast` (T10).
   */
  const notifyLifecycleError = (error: unknown, what: string): void => {
    if (isUnauthorized(error)) {
      handleUnauthorized(`Tu sesión caducó: vuelve a entrar para ${what}.`);
      return;
    }
    if (isServerUnreachable(error)) {
      setReachable(false);
      notify(`Sin conexión con el servidor: no se pudo ${what}. Inténtalo de nuevo en unos segundos.`, 'error');
      return;
    }
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      notify(error.message, 'error');
      return;
    }
    logger.warn(`No se pudo ${what}:`, error);
    notify(`No se pudo ${what}. Inténtalo de nuevo.`, 'error');
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
      id: newId('usr-cali'),
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

  /* ------------------------------------------------------------------ *
   * Alertas locales por barrio (MEJ-03): suscripción **optativa** que
   * sondea el `GET /api/needs` existente cada `NEED_ALERT_POLL_MS` y avisa
   * con un `Toast` (región `aria-live`) de las necesidades NUEVAS del
   * barrio del usuario —o de las más cercanas si hay ubicación—.
   *
   * - La petición es un GET simple: **no** se envía ninguna coordenada a
   *   ningún sitio; el filtrado por barrio/distancia ocurre en este
   *   dispositivo sobre el centroide (`src/utils/proximity.ts`).
   * - Deduplicación por ID (`alertedNeedIdsRef` + los ya conocidos): cada
   *   necesidad se anuncia como mucho una vez.
   * - Con la pestaña oculta no se sondea (no hay nadie que ver el aviso).
   * ------------------------------------------------------------------ */
  const alertedNeedIdsRef = useRef<Set<string>>(new Set());
  const alertBarrio = userLocation?.barrio || userProfile.barrio;

  useEffect(() => {
    if (!needAlertsEnabled) return undefined;
    let cancelled = false;

    /** Novedades que merecen aviso: primero mi barrio; si no, las más cercanas. */
    const pickAlertworthy = (
      fresh: readonly HelpNeed[],
    ): { list: HelpNeed[]; mode: 'barrio' | 'cercana' | 'tablon'; km: number | null } => {
      const inMyBarrio = fresh.filter((need) => sameBarrio(need.barrio, alertBarrio));
      if (inMyBarrio.length > 0) {
        return { list: inMyBarrio.slice(0, MAX_ALERTED_NEEDS), mode: 'barrio', km: null };
      }
      if (userLocation) {
        const ranked: { need: HelpNeed; index: number; km: number }[] = [];
        fresh.forEach((need, index) => {
          const km = needDistanceKm(userLocation, need);
          if (km !== null) ranked.push({ need, index, km });
        });
        ranked.sort((a, b) => (a.km === b.km ? a.index - b.index : a.km - b.km));
        if (ranked.length > 0) {
          return {
            list: ranked.slice(0, MAX_ALERTED_NEEDS).map((entry) => entry.need),
            mode: 'cercana',
            km: ranked[0].km,
          };
        }
      }
      return { list: fresh.slice(0, MAX_ALERTED_NEEDS), mode: 'tablon', km: null };
    };

    const buildMessage = (
      fresh: readonly HelpNeed[],
      picked: ReturnType<typeof pickAlertworthy>,
    ): string => {
      const shown = picked.list
        .map((need) => `«${need.title}»`)
        .join(' y ');
      const more = fresh.length > picked.list.length ? ` (y ${fresh.length - picked.list.length} más)` : '';
      if (picked.mode === 'barrio') {
        const label = barrioLabel(alertBarrio);
        const where = label !== '' ? ` en tu barrio (${label})` : '';
        return fresh.length === 1
          ? `Nueva necesidad${where}: ${shown}. Ábrela en el tablón para apoyarla.`
          : `${fresh.length} nuevas necesidades${where}: ${shown}${more}.`;
      }
      if (picked.mode === 'cercana' && picked.km !== null) {
        return fresh.length === 1
          ? `Nueva necesidad cerca de ti (≈${formatKm(picked.km)}, aproximado): ${shown}.`
          : `${fresh.length} nuevas necesidades cerca de ti (distancia aproximada): ${shown}${more}.`;
      }
      return fresh.length === 1
        ? `Nueva necesidad en el tablón: ${shown}.`
        : `${fresh.length} nuevas necesidades en el tablón: ${shown}${more}.`;
    };

    const scan = async (announce: boolean): Promise<void> => {
      // Con la pestaña oculta no se sondea; la línea base (sin anuncio) sí.
      if (announce && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const data = await apiFetch<NeedsResponse>('/api/needs');
        if (cancelled) return;
        const remote = Array.isArray(data.needs) ? data.needs : [];
        if (remote.length === 0) return;

        const known = new Set(listsRef.current.needs.map((need) => need.id));
        const fresh = remote.filter(
          (need) => !known.has(need.id) && !alertedNeedIdsRef.current.has(need.id),
        );
        // Misma fusión que el sync: la novedad se ve en el tablón en el
        // momento en que el aviso la anuncia.
        setHelpNeeds((prev) => mergeById(prev, remote, SEED_IDS.NEEDS));
        if (fresh.length === 0) return;
        for (const need of fresh) alertedNeedIdsRef.current.add(need.id);
        if (!announce) return; // línea base al activar: no avisa de lo ya existente

        const picked = pickAlertworthy(fresh);
        if (picked.list.length === 0) return;
        notify(buildMessage(fresh, picked), 'info');
      } catch (error) {
        if (!cancelled) logger.debug('No se pudieron revisar nuevas necesidades:', error);
      }
    };

    // Línea base al activar (nada de avisos por lo que ya existía) + sondeo.
    void scan(false);
    const timer = window.setInterval(() => {
      void scan(true);
    }, NEED_ALERT_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [needAlertsEnabled, alertBarrio, userLocation, notify]);

  // Locales aún sin confirmar por el servidor (T6): alimenta el contador que
  // decide cuándo reintentar el sync y avisa a la persona usuaria. Los
  // rechazados de forma permanente (`syncFailed`, BUG-02) **no** cuentan aquí:
  // ya no se reenvían solos y se avisan aparte, con acciones.
  const pendingCount =
    countPending(helpPoints) + countPending(helpNeeds) + countPending(pointComments);
  const failedCount =
    countFailed(helpPoints) + countFailed(helpNeeds) + countFailed(pointComments);

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
        // No puede decir «todo sincronizado» si queda algo rechazado (BUG-02).
        if (failedCount === 0) notify('Ya está todo sincronizado con el servidor.', 'success');
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
  }, [pendingCount, failedCount, notify]);

  /* ------------------------------------------------------------------ *
   * Aviso ACCIONABLE de rechazados (BUG-02): mientras haya `failed` se
   * mantiene en pantalla un aviso (región `aria-live`) con «Reintentar» y
   * «Descartar»; descartar pide confirmación en un segundo aviso. No se
   * cierra solo: cerrarlo en silencio dejaría datos sin resolver.
   * ------------------------------------------------------------------ */
  const failedToastIdRef = useRef<number | null>(null);
  // Segundo paso de «Descartar»: conmuta el aviso a su pregunta de confirmación.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    // Retira el aviso anterior antes de pintar el nuevo (siempre el vigente).
    if (failedToastIdRef.current !== null) {
      dismissToast(failedToastIdRef.current);
      failedToastIdRef.current = null;
    }

    if (failedCount === 0) {
      if (confirmingDiscard) setConfirmingDiscard(false);
      return;
    }

    const rejected = [...listsRef.current.points, ...listsRef.current.needs, ...listsRef.current.comments].filter(
      (item) => item.syncFailed === true,
    );

    if (confirmingDiscard) {
      failedToastIdRef.current = notify(
        rejected.length === 1
          ? '¿Descartar la publicación rechazada? Se borrará de este dispositivo y no se puede deshacer.'
          : `¿Descartar las ${rejected.length} publicaciones rechazadas? Se borrarán de este dispositivo y no se puede deshacer.`,
        'warning',
        [
          {
            id: 'discard-yes',
            label: 'Sí, descartar',
            variant: 'danger',
            run: (toastId) => {
              dismissToast(toastId);
              failedToastIdRef.current = null;
              discardFailedWrites();
            },
          },
          {
            id: 'discard-no',
            label: 'Cancelar',
            run: () => setConfirmingDiscard(false),
          },
        ],
      );
      return;
    }

    const reason = rejected[0]?.syncError?.trim();
    failedToastIdRef.current = notify(
      rejected.length === 1
        ? `El servidor rechazó una publicación${reason ? `: «${reason}»` : ''}. Puedes reintentarla o descartarla.`
        : `El servidor rechazó ${rejected.length} publicaciones. Puedes reintentarlas o descartarlas.`,
      'error',
      [
        {
          id: 'retry',
          label: 'Reintentar',
          run: (toastId) => {
            dismissToast(toastId);
            failedToastIdRef.current = null;
            retryFailedWrites();
          },
        },
        {
          id: 'discard',
          label: 'Descartar',
          variant: 'danger',
          run: () => setConfirmingDiscard(true),
        },
      ],
    );
  }, [failedCount, confirmingDiscard, notify, dismissToast]);

  /**
   * El servidor confirmó un elemento local: se adopta su versión (que puede
   * traer otro `id`, `verified: false`, contadores reales…) y se retira la
   * marca `pending`. Si el id cambió, se mueven también las referencias
   * locales que lo usaban.
   */
  const confirmPoint = (localId: string, confirmed?: HelpPoint) => {
    setHelpPoints((prev) =>
      prev.map((item) =>
        item.id === localId
          ? { ...(confirmed ?? item), pending: false, syncFailed: undefined, syncError: undefined }
          : item,
      ),
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
      prev.map((item) =>
        item.id === localId
          ? { ...(confirmed ?? item), pending: false, syncFailed: undefined, syncError: undefined }
          : item,
      ),
    );
    if (!confirmed || confirmed.id === localId) return;
    setSelectedNeed((prev) => (prev && prev.id === localId ? confirmed : prev));
  };

  const confirmComment = (localId: string, confirmed?: PointComment) => {
    setPointComments((prev) =>
      prev.map((item) =>
        item.id === localId
          ? { ...(confirmed ?? item), pending: false, syncFailed: undefined, syncError: undefined }
          : item,
      ),
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
   *
   * BUG-02: un fallo transitorio (red, 5xx, 429) sigue con estos 3
   * intentos, pero un **4xx permanente** (salvo 401/408/429) pasa el ítem a
   * `failed`: ya no se reintenta solo y espera la decisión de la persona
   * (reintentar / descartar) en el aviso accionable.
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
    const resendPending = async <T extends { id: string; pending?: boolean; syncFailed?: boolean }>(
      items: readonly T[],
      kind: SyncKind,
      unauthorizedMessage: string,
      send: (item: T) => Promise<void>,
    ): Promise<void> => {
      for (const item of items) {
        if (item.pending !== true) continue;
        // Rechazo permanente (BUG-02): fuera del reenvío automático.
        if (item.syncFailed === true) continue;
        if (cancelled || inflightIdsRef.current.has(item.id) || !takeAttempt(item.id)) continue;

        inflightIdsRef.current.add(item.id);
        try {
          await send(item);
        } catch (error) {
          if (cancelled) return;
          if (isUnauthorized(error)) {
            // 401 → identidad caducada: mismo flujo de siempre
            // (`handleUnauthorized` → `promptForIdentity` → `ensureIdentity`).
            handleUnauthorized(unauthorizedMessage);
          } else if (isPermanentRejection(error)) {
            markFailed(kind, item.id, error.message);
            logger.warn(`Rechazo permanente de ${kind} ${item.id}:`, error);
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
        'point',
        'Tu sesión caducó: vuelve a entrar para sincronizar tus reportes.',
        async (point) => {
          const data = await apiFetch<PointResponse>('/api/points', {
            method: 'POST',
            body: withoutIdentity(point),
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelled) confirmPoint(point.id, data.point);
        },
      );

      await resendPending(
        helpNeeds,
        'need',
        'Tu sesión caducó: vuelve a entrar para sincronizar tus necesidades.',
        async (need) => {
          const data = await apiFetch<NeedResponse>('/api/needs', {
            method: 'POST',
            body: withoutIdentity(need),
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelled) confirmNeed(need.id, data.need);
        },
      );

      await resendPending(
        pointComments,
        'comment',
        'Tu sesión caducó: vuelve a entrar para sincronizar tus comentarios.',
        async (comment) => {
          const data = await apiFetch<CommentResponse>('/api/comments', {
            method: 'POST',
            body: withoutIdentity(comment),
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
      id: newId('cali-point'),
      pending: true,
      // Nace sin verificar (decisión 2026-09-28): la verificación es un paso aparte.
      verified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Autoría = sesión de Clerk, nunca el perfil local (decisión 2026-09-28).
      // El servidor la vuelve a tomar de su propio JWT; esto solo sirve para
      // pintar «es mío» mientras la respuesta no llega.
      authorId: clerkUserId ?? undefined,
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
        body: withoutIdentity(newPoint),
        headers: { Authorization: `Bearer ${token}` },
      });
      confirmPoint(newPoint.id, data.point);
      notify('Punto publicado: ya aparece en el mapa para la comunidad de Cali.', 'success');
    } catch (error) {
      handlePublishError(error, 'el punto', { kind: 'point', id: newPoint.id });
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
      id: newId('cali-need'),
      pending: true,
      // Nace en 0 (T2): el primer apoyo real lo da la BD, nunca un contador
      // inflado en el cliente.
      supportersCount: 0,
      createdAt: new Date().toISOString(),
      authorId: clerkUserId ?? undefined,
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
        body: withoutIdentity(newNeed),
        headers: { Authorization: `Bearer ${token}` },
      });
      confirmNeed(newNeed.id, data.need);
      notify('Necesidad publicada en el tablón comunitario.', 'success');
    } catch (error) {
      handlePublishError(error, 'la necesidad', { kind: 'need', id: newNeed.id });
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
      id: newId('comm'),
      pointId,
      // Identidad de la sesión de Clerk, no del perfil local (decisión
      // 2026-09-28): el servidor la sustituye por la suya resuelta.
      userId: clerkUserId ?? '',
      // Solo para pintar el comentario en local: no viaja en el payload.
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
        body: withoutIdentity(newComment),
        headers: { Authorization: `Bearer ${token}` },
      });
      confirmComment(newComment.id, data.comment);
      notify('Comentario publicado.', 'success');
    } catch (error) {
      handlePublishError(error, 'el comentario', { kind: 'comment', id: newComment.id });
    } finally {
      inflightIdsRef.current.delete(newComment.id);
    }

    return true;
  };

  /**
   * Edita una necesidad propia (`PATCH /api/needs/:id`).
   *
   * Cambio optimista: se pinta al instante y se **revierte** si el servidor
   * no lo confirma (401/403/404 o caída). Un elemento todavía `pending` no
   * existe en el servidor, así que solo se aplica en local: lo recogerá el
   * reenvío automático con el nuevo contenido.
   */
  const updateNeed = async (
    needId: string,
    patch: NeedPatch,
    resumes = 0,
  ): Promise<boolean> => {
    if (
      !ensureIdentity(
        (more) => void updateNeed(needId, patch, more),
        resumes,
        'Inicia sesión con tu cuenta para editar esta necesidad.',
      )
    ) {
      return false;
    }

    const previous = helpNeeds.find((item) => item.id === needId);
    if (!previous) return false;

    const applyPatch = (item: HelpNeed): HelpNeed => (item.id === needId ? { ...item, ...patch } : item);
    setHelpNeeds((prev) => prev.map(applyPatch));
    setSelectedNeed((prev) => (prev && prev.id === needId ? { ...prev, ...patch } : prev));

    if (previous.pending) {
      notify('Cambio aplicado en tu dispositivo: se sincronizará con el servidor en cuanto vuelva la conexión.', 'info');
      return true;
    }

    const token = await getToken().catch(() => null);
    if (!token) {
      setHelpNeeds((prev) => prev.map((item) => (item.id === needId ? previous : item)));
      setSelectedNeed((prev) => (prev && prev.id === needId ? previous : prev));
      handleUnauthorized('Tu sesión no está activa: vuelve a entrar para editar la necesidad.');
      return false;
    }

    try {
      const data = await apiFetch<NeedResponse>(`/api/needs/${encodeURIComponent(needId)}`, {
        method: 'PATCH',
        body: patch,
        headers: { Authorization: `Bearer ${token}` },
      });
      confirmNeed(needId, data.need);
      setReachable(true);
      notify('Necesidad actualizada.', 'success');
      return true;
    } catch (error) {
      setHelpNeeds((prev) => prev.map((item) => (item.id === needId ? previous : item)));
      setSelectedNeed((prev) => (prev && prev.id === needId ? previous : prev));
      notifyLifecycleError(error, 'editar la necesidad');
      return false;
    }
  };

  /** Borra una necesidad propia (`DELETE /api/needs/:id`). Misma política. */
  const deleteNeed = async (needId: string, resumes = 0): Promise<boolean> => {
    if (
      !ensureIdentity(
        (more) => void deleteNeed(needId, more),
        resumes,
        'Inicia sesión con tu cuenta para eliminar esta necesidad.',
      )
    ) {
      return false;
    }

    const previous = helpNeeds.find((item) => item.id === needId);
    if (!previous) return false;

    setHelpNeeds((prev) => prev.filter((item) => item.id !== needId));
    setSelectedNeed((prev) => (prev && prev.id === needId ? null : prev));

    if (previous.pending) {
      notify('Reporte eliminado de tu dispositivo.', 'success');
      return true;
    }

    const token = await getToken().catch(() => null);
    if (!token) {
      setHelpNeeds((prev) => (prev.some((item) => item.id === needId) ? prev : [previous, ...prev]));
      handleUnauthorized('Tu sesión no está activa: vuelve a entrar para eliminar la necesidad.');
      return false;
    }

    try {
      await apiFetch<DeleteResponse>(`/api/needs/${encodeURIComponent(needId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setReachable(true);
      notify('Necesidad eliminada del tablón.', 'success');
      return true;
    } catch (error) {
      setHelpNeeds((prev) => (prev.some((item) => item.id === needId) ? prev : [previous, ...prev]));
      setSelectedNeed(previous);
      notifyLifecycleError(error, 'eliminar la necesidad');
      return false;
    }
  };

  /**
   * Edita un punto propio (`PUT /api/points/:id`). El servidor exige el
   * objeto completo de campos editables: aquí se manda el parche recibido y
   * quien edita (el panel del mapa) parte siempre de la copia vigente.
   */
  const updatePoint = async (
    pointId: string,
    patch: PointPatch,
    resumes = 0,
  ): Promise<boolean> => {
    if (
      !ensureIdentity(
        (more) => void updatePoint(pointId, patch, more),
        resumes,
        'Inicia sesión con tu cuenta para editar este punto.',
      )
    ) {
      return false;
    }

    const previous = helpPoints.find((item) => item.id === pointId);
    if (!previous) return false;

    setHelpPoints((prev) => prev.map((item) => (item.id === pointId ? { ...item, ...patch } : item)));
    setSelectedPoint((prev) => (prev && prev.id === pointId ? { ...prev, ...patch } : prev));

    if (previous.pending) {
      notify('Cambio aplicado en tu dispositivo: se sincronizará con el servidor en cuanto vuelva la conexión.', 'info');
      return true;
    }

    const token = await getToken().catch(() => null);
    if (!token) {
      setHelpPoints((prev) => prev.map((item) => (item.id === pointId ? previous : item)));
      setSelectedPoint((prev) => (prev && prev.id === pointId ? previous : prev));
      handleUnauthorized('Tu sesión no está activa: vuelve a entrar para editar el punto.');
      return false;
    }

    try {
      const data = await apiFetch<PointResponse>(`/api/points/${encodeURIComponent(pointId)}`, {
        method: 'PUT',
        body: patch,
        headers: { Authorization: `Bearer ${token}` },
      });
      confirmPoint(pointId, data.point);
      setReachable(true);
      notify('Punto de ayuda actualizado.', 'success');
      return true;
    } catch (error) {
      setHelpPoints((prev) => prev.map((item) => (item.id === pointId ? previous : item)));
      setSelectedPoint((prev) => (prev && prev.id === pointId ? previous : prev));
      notifyLifecycleError(error, 'editar el punto');
      return false;
    }
  };

  /** Borra un punto propio (`DELETE /api/points/:id`). */
  const deletePoint = async (pointId: string, resumes = 0): Promise<boolean> => {
    if (
      !ensureIdentity(
        (more) => void deletePoint(pointId, more),
        resumes,
        'Inicia sesión con tu cuenta para eliminar este punto.',
      )
    ) {
      return false;
    }

    const previous = helpPoints.find((item) => item.id === pointId);
    if (!previous) return false;
    // Los comentarios del punto se ocultan con él y se restauran si falla.
    const removedComments = pointComments.filter((comment) => comment.pointId === pointId);

    setHelpPoints((prev) => prev.filter((item) => item.id !== pointId));
    setSelectedPoint((prev) => (prev && prev.id === pointId ? null : prev));
    setPointComments((prev) => prev.filter((comment) => comment.pointId !== pointId));

    if (previous.pending) {
      notify('Punto eliminado de tu dispositivo.', 'success');
      return true;
    }

    const restoreLocal = () => {
      setHelpPoints((prev) => (prev.some((item) => item.id === pointId) ? prev : [previous, ...prev]));
      if (removedComments.length > 0) {
        setPointComments((prev) => [...prev, ...removedComments]);
      }
    };

    const token = await getToken().catch(() => null);
    if (!token) {
      restoreLocal();
      setSelectedPoint(previous);
      handleUnauthorized('Tu sesión no está activa: vuelve a entrar para eliminar el punto.');
      return false;
    }

    try {
      await apiFetch<DeleteResponse>(`/api/points/${encodeURIComponent(pointId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setReachable(true);
      notify('Punto eliminado del mapa.', 'success');
      return true;
    } catch (error) {
      restoreLocal();
      setSelectedPoint(previous);
      notifyLifecycleError(error, 'eliminar el punto');
      return false;
    }
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

  /* ------------------------------------------------------------------ *
   * T12 · FAL-09 — acciones con identidad estable. Cada wrapper se crea
   * una sola vez y delega en la copia vigente del render: internamente
   * el resto del contexto sigue llamando a las funciones originales (se
   * recrean —frescas— en cada render), pero los consumidores ven siempre
   * el mismo wrapper, de modo que el `value` memorizado solo cambia de
   * identidad cuando cambia el estado que expone.
   * ------------------------------------------------------------------ */
  const setUserBarrioLocationStable = useStableCallback(setUserBarrioLocation);
  const setUserCustomCoordinatesStable = useStableCallback(setUserCustomCoordinates);
  const closeAuthModalStable = useStableCallback(closeAuthModal);
  const completeAuthModalStable = useStableCallback(completeAuthModal);
  const openAuthModalStable = useStableCallback(openAuthModal);
  const setCookieConsentStable = useStableCallback(setCookieConsent);
  const addHelpPointStable = useStableCallback(addHelpPoint);
  const addHelpNeedStable = useStableCallback(addHelpNeed);
  const addPointCommentStable = useStableCallback(addPointComment);
  const toggleSavePointStable = useStableCallback(toggleSavePoint);
  const supportNeedStable = useStableCallback(supportNeed);
  const updateNeedStable = useStableCallback(updateNeed);
  const deleteNeedStable = useStableCallback(deleteNeed);
  const updatePointStable = useStableCallback(updatePoint);
  const deletePointStable = useStableCallback(deletePoint);
  const updateUserProfileStable = useStableCallback(updateUserProfile);
  const registerUserStable = useStableCallback(registerUser);
  const logoutUserStable = useStableCallback(logoutUser);
  const requestUserLocationStable = useStableCallback(requestUserLocation);
  const calculateDistanceStable = useStableCallback(calculateDistance);
  const focusPointOnMapStable = useStableCallback(focusPointOnMap);

  /** `value` del contexto del mapa: solo cambia al centrar/seleccionar. */
  const mapUiValue = useMemo<MapUIContextType>(
    () => ({
      mapCenter,
      setMapCenter,
      mapZoom,
      setMapZoom,
      selectedPoint,
      setSelectedPoint,
      initialCoordsForNewPoint,
      setInitialCoordsForNewPoint,
      focusPointOnMap: focusPointOnMapStable,
    }),
    [
      mapCenter,
      setMapCenter,
      mapZoom,
      setMapZoom,
      selectedPoint,
      setSelectedPoint,
      initialCoordsForNewPoint,
      setInitialCoordsForNewPoint,
      focusPointOnMapStable,
    ],
  );

  /**
   * `value` del contexto principal, memorizado (T12 · FAL-09): solo se
   * reconstruye cuando cambia el estado o las acciones que expone. Las
   * acciones van con identidad estable (bloque anterior) para que el
   * `useMemo` no se invalde en cada render por culpa de closures nuevas.
   */
  const appValue = useMemo<AppContextType>(
    () => ({
      activeTab,
      setActiveTab,
      helpPoints,
      helpNeeds,
      supportedNeedIds,
      pointComments,
      userProfile,
      userLocation,
      setUserLocation,
      setUserBarrioLocation: setUserBarrioLocationStable,
      setUserCustomCoordinates: setUserCustomCoordinatesStable,
      isLocatingUser,
      locationError,
      setLocationError,
      isLocationModalOpen,
      setIsLocationModalOpen,
      selectedNeed,
      setSelectedNeed,
      isReportModalOpen,
      setIsReportModalOpen,
      reportModalType,
      setReportModalType,
      isAuthModalOpen,
      setIsAuthModalOpen,
      closeAuthModal: closeAuthModalStable,
      completeAuthModal: completeAuthModalStable,
      authModalMessage,
      openAuthModal: openAuthModalStable,
      toasts,
      notify,
      dismissToast,
      needAlertsEnabled,
      setNeedAlertsEnabled,
      cookieConsent,
      setCookieConsent: setCookieConsentStable,
      serverStatus,
      addHelpPoint: addHelpPointStable,
      addHelpNeed: addHelpNeedStable,
      addPointComment: addPointCommentStable,
      toggleSavePoint: toggleSavePointStable,
      supportNeed: supportNeedStable,
      updateNeed: updateNeedStable,
      deleteNeed: deleteNeedStable,
      updatePoint: updatePointStable,
      deletePoint: deletePointStable,
      updateUserProfile: updateUserProfileStable,
      registerUser: registerUserStable,
      logoutUser: logoutUserStable,
      requestUserLocation: requestUserLocationStable,
      calculateDistance: calculateDistanceStable,
    }),
    [
      activeTab,
      setActiveTab,
      helpPoints,
      helpNeeds,
      supportedNeedIds,
      pointComments,
      userProfile,
      userLocation,
      setUserLocation,
      setUserBarrioLocationStable,
      setUserCustomCoordinatesStable,
      isLocatingUser,
      locationError,
      setLocationError,
      isLocationModalOpen,
      setIsLocationModalOpen,
      selectedNeed,
      setSelectedNeed,
      isReportModalOpen,
      setIsReportModalOpen,
      reportModalType,
      setReportModalType,
      isAuthModalOpen,
      setIsAuthModalOpen,
      closeAuthModalStable,
      completeAuthModalStable,
      authModalMessage,
      openAuthModalStable,
      toasts,
      notify,
      dismissToast,
      needAlertsEnabled,
      setNeedAlertsEnabled,
      cookieConsent,
      setCookieConsentStable,
      serverStatus,
      addHelpPointStable,
      addHelpNeedStable,
      addPointCommentStable,
      toggleSavePointStable,
      supportNeedStable,
      updateNeedStable,
      deleteNeedStable,
      updatePointStable,
      deletePointStable,
      updateUserProfileStable,
      registerUserStable,
      logoutUserStable,
      requestUserLocationStable,
      calculateDistanceStable,
    ],
  );

  return (
    <AppContext.Provider value={appValue}>
      <MapUIContext.Provider value={mapUiValue}>
        {children}
      </MapUIContext.Provider>
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

/** Estado de la vista del mapa (T12): separado para no re-renderizar el resto. */
export const useMapUI = () => {
  const context = useContext(MapUIContext);
  if (!context) {
    throw new Error('useMapUI must be used within an AppProvider');
  }
  return context;
};
