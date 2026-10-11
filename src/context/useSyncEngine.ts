import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type {
  CommentResponse,
  HelpNeed,
  HelpPoint,
  NeedResponse,
  PointComment,
  PointResponse,
  UserProfile,
} from '../types';
import { apiFetch } from '../services/api';
import { logger } from '../utils/logger';
import {
  MAX_SYNC_ATTEMPTS,
  isPermanentRejection,
  isServerUnreachable,
  isUnauthorized,
  pendingLabel,
  withoutIdentity,
} from './appConstants';
import type { ListsMirror, NotifyFn } from './appTypes';
import { useStableCallback } from './useStableCallback';

export interface SyncEngineDeps {
  helpPoints: HelpPoint[];
  helpNeeds: HelpNeed[];
  pointComments: PointComment[];
  setHelpPoints: Dispatch<SetStateAction<HelpPoint[]>>;
  setHelpNeeds: Dispatch<SetStateAction<HelpNeed[]>>;
  setPointComments: Dispatch<SetStateAction<PointComment[]>>;
  setUserProfile: Dispatch<SetStateAction<UserProfile>>;
  listsRef: RefObject<ListsMirror>;
  pendingCount: number;
  failedCount: number;
  markFailed: (kind: 'point' | 'need' | 'comment', id: string, reason: string) => void;
  setSelectedPoint: Dispatch<SetStateAction<HelpPoint | null>>;
  setSelectedNeed: Dispatch<SetStateAction<HelpNeed | null>>;
  notify: NotifyFn;
  dismissToast: (id: number) => void;
  setReachable: (reachable: boolean) => void;
  serverReachable: boolean;
  /** `undefined` mientras Clerk aún no ha resuelto la sesión. */
  isSignedIn: boolean | undefined;
  clerkUserId: string | null | undefined;
  getToken: () => Promise<string | null>;
  openAuthModal: (message?: string, onSuccess?: () => void) => void;
  openSignIn: () => void;
  identityRef: RefObject<{
    isSignedIn: boolean | undefined;
    clerkUserId: string | null | undefined;
    isRegistered: boolean;
  }>;
  lastIdentityPromptRef: RefObject<number>;
  inflightIdsRef: RefObject<Set<string>>;
  syncAttemptsRef: RefObject<Map<string, number>>;
  handleUnauthorized: (message: string) => void;
}

export interface SyncEngineApi {
  /** Adopción de la respuesta del servidor al confirmar una escritura. */
  confirmPoint: (localId: string, confirmed?: HelpPoint) => void;
  confirmNeed: (localId: string, confirmed?: HelpNeed) => void;
  confirmComment: (localId: string, confirmed?: PointComment) => void;
}

/**
 * Sincronización de lo local con el servidor: adopción de confirmaciones,
 * reenvío automático de lo `pending`, avisos de «sigue sin confirmarse» y
 * el aviso accionable de los rechazados permanentes (BUG-02).
 */
export function useSyncEngine(deps: SyncEngineDeps): SyncEngineApi {
  const {
    helpPoints,
    helpNeeds,
    pointComments,
    setHelpPoints,
    setHelpNeeds,
    setPointComments,
    setUserProfile,
    listsRef,
    pendingCount,
    failedCount,
    markFailed,
    setSelectedPoint,
    setSelectedNeed,
    notify,
    dismissToast,
    setReachable,
    serverReachable,
    isSignedIn,
    clerkUserId,
    getToken,
    openAuthModal,
    openSignIn,
    identityRef,
    lastIdentityPromptRef,
    inflightIdsRef,
    syncAttemptsRef,
    handleUnauthorized,
  } = deps;

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
        ids.has(item.id) ? { ...item, syncFailed: undefined, syncError: undefined } : item,
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
    setPointComments((prev) =>
      prev.filter(
        (comment) => !idSet.has(comment.id) && !removedPointIds.includes(comment.pointId),
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

  // Acciones del aviso con identidad estable: el efecto de abajo solo se
  // reejecuta cuando cambian `failedCount` o `confirmingDiscard`, y al
  // pulsar un botón se ejecuta la copia vigente del último render.
  const retryFailedWritesStable = useStableCallback(retryFailedWrites);
  const discardFailedWritesStable = useStableCallback(discardFailedWrites);

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

    const rejected = [
      ...listsRef.current.points,
      ...listsRef.current.needs,
      ...listsRef.current.comments,
    ].filter((item) => item.syncFailed === true);

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
              discardFailedWritesStable();
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
            retryFailedWritesStable();
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
  }, [
    failedCount,
    confirmingDiscard,
    notify,
    dismissToast,
    listsRef,
    retryFailedWritesStable,
    discardFailedWritesStable,
  ]);

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
      kind: 'point' | 'need' | 'comment',
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

  return { confirmPoint, confirmNeed, confirmComment };
}
