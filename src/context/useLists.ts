import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { HelpNeed, HelpPoint, MySupportsResponse, PointComment, UserProfile } from '../types';
import {
  INITIAL_HELP_NEEDS,
  INITIAL_HELP_POINTS,
  INITIAL_POINT_COMMENTS,
  INITIAL_USER_PROFILE,
} from '../data/initialData';
import { apiFetch } from '../services/api';
import { loadJSON, saveJSON } from '../utils/storage';
import { countFailed, countPending } from '../utils/sync';
import { logger } from '../utils/logger';
import { STORAGE_KEYS, type SyncKind } from './appConstants';
import type { ListsMirror, ListSetters } from './appTypes';

export interface ListsApi extends ListSetters {
  helpPoints: HelpPoint[];
  helpNeeds: HelpNeed[];
  pointComments: PointComment[];
  supportedNeedIds: string[];
  setSupportedNeedIds: Dispatch<SetStateAction<string[]>>;
  userProfile: UserProfile;
  setUserProfile: Dispatch<SetStateAction<UserProfile>>;
  /** Espejo de las tres listas (BUG-02): estado vigente para avisos y cola. */
  listsRef: RefObject<ListsMirror>;
  /** Locales aún sin confirmar y rechazados de forma permanente. */
  pendingCount: number;
  failedCount: number;
  /** Marca un elemento de una lista como rechazado, sin tocar su payload. */
  markFailed: (kind: SyncKind, id: string, reason: string) => void;
}

export interface ListsSession {
  /** `undefined` mientras Clerk aún no ha resuelto la sesión. */
  isSignedIn: boolean | undefined;
  clerkUserId: string | null | undefined;
  getToken: () => Promise<string | null>;
}

/** Marca un elemento concreto de una lista como rechazado, sin tocar su payload. */
const markItemFailed = <T extends { id: string; syncFailed?: boolean; syncError?: string }>(
  setList: Dispatch<SetStateAction<T[]>>,
  id: string,
  reason: string,
): void => {
  setList((prev) =>
    prev.map((item) => (item.id === id ? { ...item, syncFailed: true, syncError: reason } : item)),
  );
};

/**
 * Listas locales (puntos, necesidades, comentarios), el perfil, los apoyos de
 * la cuenta y su persistencia en `localStorage`. Es la fuente de verdad de
 * los datos que después sincronizan, reintentan y mutan el resto de hooks.
 */
export function useLists(session: ListsSession): ListsApi {
  const { isSignedIn, clerkUserId, getToken } = session;

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

  /**
   * Cambio de sesión (entrada, salida o cuenta distinta): se vacían los
   * apoyos para que nunca se mezclen los «likes» de dos personas. Es un
   * ajuste de estado durante el render (patrón oficial de React «adjusting
   * state when a prop changes»): el listado sale limpio en el mismo frame y
   * sin el render extra que prohíbe `react(set-state-in-effect)`.
   */
  const sessionKey = isSignedIn && clerkUserId ? clerkUserId : null;
  const [prevSessionKey, setPrevSessionKey] = useState<string | null>(sessionKey);
  if (prevSessionKey !== sessionKey) {
    setPrevSessionKey(sessionKey);
    setSupportedNeedIds([]);
  }

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

  /**
   * Espejo de las tres listas locales (BUG-02): las acciones que se guardan
   * dentro de un aviso (`ToastAction`) se crean en el render en que se
   * muestra y se ejecutan más tarde; leen este ref para trabajar siempre con
   * el estado vigente y no con una copia congelada. Mismo patrón que
   * `identityRef` / `serverReachableRef`.
   */
  const listsRef = useRef<ListsMirror>({
    points: helpPoints,
    needs: helpNeeds,
    comments: pointComments,
  });
  // El espejo se actualiza en un efecto (nunca durante el render, que es lo
  // que prohíbe `react(refs)`): sus lecturas (avisos y sync) ocurren siempre
  // después del commit, cuando el espejo ya está al día.
  useEffect(() => {
    listsRef.current = { points: helpPoints, needs: helpNeeds, comments: pointComments };
  }, [helpPoints, helpNeeds, pointComments]);

  // Locales aún sin confirmar por el servidor (T6): alimenta el contador que
  // decide cuándo reintentar el sync y avisa a la persona usuaria. Los
  // rechazados de forma permanente (`syncFailed`, BUG-02) **no** cuentan aquí:
  // ya no se reenvían solos y se avisan aparte, con acciones.
  const pendingCount =
    countPending(helpPoints) + countPending(helpNeeds) + countPending(pointComments);
  const failedCount = countFailed(helpPoints) + countFailed(helpNeeds) + countFailed(pointComments);

  /** `markItemFailed` resolviendo a qué lista pertenece el id. */
  const markFailed = (kind: SyncKind, id: string, reason: string): void => {
    if (kind === 'point') markItemFailed<HelpPoint>(setHelpPoints, id, reason);
    else if (kind === 'need') markItemFailed<HelpNeed>(setHelpNeeds, id, reason);
    else markItemFailed<PointComment>(setPointComments, id, reason);
  };

  // Carga los apoyos de la cuenta al entrar en la sesión; al salir se
  // vacían en el ajuste de render de arriba.
  useEffect(() => {
    if (!isSignedIn || !clerkUserId) return undefined;

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

  // Persistencia local: un único efecto por clave para evitar escrituras
  // duplicadas y mantener la lógica de guardado en un solo lugar.
  useEffect(() => saveJSON(STORAGE_KEYS.POINTS, helpPoints), [helpPoints]);
  useEffect(() => saveJSON(STORAGE_KEYS.NEEDS, helpNeeds), [helpNeeds]);
  useEffect(() => saveJSON(STORAGE_KEYS.COMMENTS, pointComments), [pointComments]);
  useEffect(() => saveJSON(STORAGE_KEYS.PROFILE, userProfile), [userProfile]);

  return {
    helpPoints,
    setHelpPoints,
    helpNeeds,
    setHelpNeeds,
    pointComments,
    setPointComments,
    supportedNeedIds,
    setSupportedNeedIds,
    userProfile,
    setUserProfile,
    listsRef,
    pendingCount,
    failedCount,
    markFailed,
  };
}
