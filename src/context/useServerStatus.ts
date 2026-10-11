import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {
  CommentsResponse,
  ConfigResponse,
  HelpNeed,
  HelpPoint,
  NeedsResponse,
  PointComment,
  PointsResponse,
} from '../types';
import { apiFetch } from '../services/api';
import { mergeById } from '../utils/sync';
import { logger } from '../utils/logger';
import { SEED_IDS } from './appConstants';
import type { NotifyFn, ServerStatus } from './appTypes';

export interface ServerStatusApi {
  serverStatus: ServerStatus;
  /** ¿Ha respondido el servidor últimamente? Gobierna el reenvío de lo pendiente. */
  serverReachable: boolean;
  /** Identidad estable: registra el estado y avisa solo en cada transición. */
  setReachable: (reachable: boolean) => void;
}

export interface ServerStatusDeps {
  notify: NotifyFn;
  setHelpPoints: Dispatch<SetStateAction<HelpPoint[]>>;
  setHelpNeeds: Dispatch<SetStateAction<HelpNeed[]>>;
  setPointComments: Dispatch<SetStateAction<PointComment[]>>;
  pendingCount: number;
}

/**
 * Salud del servidor (`GET /api/config`) y primer sync de listas, con un
 * sondeo de 60 s: la sincronización solo se repite mientras falle o haya
 * algo pendiente de confirmar, así si el servidor estaba caído la app se
 * recupera sola sin recargar la página.
 */
export function useServerStatus(deps: ServerStatusDeps): ServerStatusApi {
  const { notify, setHelpPoints, setHelpNeeds, setPointComments, pendingCount } = deps;

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

  useEffect(() => {
    pendingCountRef.current = pendingCount;
  }, [pendingCount]);

  /**
   * Registra si el servidor está respondiendo (para el sync y los reenvíos).
   * Cuando el estado cambia se avisa con un toast: «se cayó» o «volvió»,
   * una sola vez por transición para no repetir el mensaje cada minuto.
   *
   * Identidad estable (`notify` también la tiene): así puede figurar como
   * dependencia del efecto de sync sin reintentarlo en cada render.
   */
  const setReachable = useCallback(
    (reachable: boolean) => {
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
    },
    [notify],
  );

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
    // `setReachable` y los setters de listas tienen identidad estable, así
    // que incluirlos no reejecuta el efecto: el sondeo sigue montándose una
    // sola vez.
  }, [setReachable, setHelpPoints, setHelpNeeds, setPointComments]);

  return { serverStatus, serverReachable, setReachable };
}
