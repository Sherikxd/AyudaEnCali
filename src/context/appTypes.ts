import type { Dispatch, SetStateAction } from 'react';
import type {
  HelpNeed,
  HelpPoint,
  NeedPatch,
  PointComment,
  PointPatch,
  SupportAction,
  ToastAction,
  ToastItem,
  ToastKind,
  UserRole,
  UserCoordinates,
  UserProfile,
} from '../types';
import type { CookieConsent } from '../utils/consent';
import type { TabKey } from '../utils/tabUrl';

/**
 * Contratos de los dos contextos de la app (T12 · FAL-09).
 *
 * Viven fuera de `AppContext.tsx` para que el fichero del provider se quede
 * en la composición pura: `AppContext.tsx` sigue exportando `ServerStatus`,
 * `AppProvider`, `useApp` y `useMapUI`, con exactamente estos mismos tipos.
 */

export interface ServerStatus {
  supabaseConnected: boolean;
  supabaseUrl: string | null;
  supabaseTablesReady: boolean | null;
  supabaseHint: string | null;
  cartoConfigured: boolean;
  hasGeminiKey: boolean;
}

export interface AppContextType {
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

/**
 * Estado de la vista del mapa, separado del resto del contexto
 * (T12 · FAL-09): centrar el mapa o seleccionar un punto actualiza
 * **solo** a los consumidores de este contexto (MapView, ReportModal y
 * los botones de «ver en el mapa» del chat y el perfil), en vez de
 * re-renderizar tablón, cabecera y modales de paso.
 */
export interface MapUIContextType {
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

/** Espejo de las tres listas locales, para trabajar con el estado vigente. */
export interface ListsMirror {
  points: HelpPoint[];
  needs: HelpNeed[];
  comments: PointComment[];
}

/** Avisos visibles, con la misma firma expuesta por el contexto. */
export type NotifyFn = (message: string, kind?: ToastKind, actions?: ToastAction[]) => number;

/** Setters de listas, compartidos por sync, cola y acciones. */
export type ListSetters = {
  setHelpPoints: Dispatch<SetStateAction<HelpPoint[]>>;
  setHelpNeeds: Dispatch<SetStateAction<HelpNeed[]>>;
  setPointComments: Dispatch<SetStateAction<PointComment[]>>;
};
