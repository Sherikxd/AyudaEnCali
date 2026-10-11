import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  CommentResponse,
  DeleteResponse,
  HelpNeed,
  HelpPoint,
  NeedPatch,
  NeedResponse,
  PointComment,
  PointPatch,
  PointResponse,
  SupportAction,
  SupportResponse,
  UserProfile,
  UserRole,
  UserCoordinates,
} from '../types';
import { INITIAL_USER_PROFILE } from '../data/initialData';
import { CALI_BARRIOS_DATA } from '../data/caliLocations';
import { apiFetch, ApiError } from '../services/api';
import { newId } from '../utils/id';
import { logger } from '../utils/logger';
import {
  isServerUnreachable,
  isUnauthorized,
  withoutIdentity,
  type SyncKind,
} from './appConstants';
import type { NotifyFn } from './appTypes';

export interface EntityActionsDeps {
  helpPoints: HelpPoint[];
  helpNeeds: HelpNeed[];
  pointComments: PointComment[];
  supportedNeedIds: string[];
  userProfile: UserProfile;
  setHelpPoints: Dispatch<SetStateAction<HelpPoint[]>>;
  setHelpNeeds: Dispatch<SetStateAction<HelpNeed[]>>;
  setPointComments: Dispatch<SetStateAction<PointComment[]>>;
  setSupportedNeedIds: Dispatch<SetStateAction<string[]>>;
  setUserProfile: Dispatch<SetStateAction<UserProfile>>;
  setSelectedPoint: Dispatch<SetStateAction<HelpPoint | null>>;
  setSelectedNeed: Dispatch<SetStateAction<HelpNeed | null>>;
  setUserLocation: Dispatch<SetStateAction<UserCoordinates | null>>;
  setMapCenter: Dispatch<SetStateAction<[number, number]>>;
  setMapZoom: Dispatch<SetStateAction<number>>;
  notify: NotifyFn;
  queueWrite: (build: (resumes: number) => void, resumes: number) => void;
  discardQueuedWrite: () => void;
  inflightIdsRef: RefObject<Set<string>>;
  authCallback: (() => void) | null;
  setAuthCallback: Dispatch<SetStateAction<(() => void) | null>>;
  setIsAuthModalOpen: Dispatch<SetStateAction<boolean>>;
  ensureIdentity: (build: (resumes: number) => void, resumes: number, message: string) => boolean;
  handleUnauthorized: (message: string) => void;
  handlePublishError: (
    error: unknown,
    what: string,
    failed?: { kind: SyncKind; id: string },
  ) => void;
  notifyLifecycleError: (error: unknown, what: string) => void;
  setReachable: (reachable: boolean) => void;
  confirmPoint: (localId: string, confirmed?: HelpPoint) => void;
  confirmNeed: (localId: string, confirmed?: HelpNeed) => void;
  confirmComment: (localId: string, confirmed?: PointComment) => void;
  /** `undefined` mientras Clerk aún no ha resuelto la sesión. */
  clerkUserId: string | null | undefined;
  getToken: () => Promise<string | null>;
  isSignedIn: boolean | undefined;
  signOut: () => Promise<void>;
}

/**
 * Acciones sobre las entidades de la app: publicar, editar y borrar puntos,
 * necesidades y comentarios; apoyos, perfil local y sesión. Todas pasan por
 * `ensureIdentity` (T8) y traducen los fallos con los ayudantes del gate.
 */
export function useEntityActions(deps: EntityActionsDeps): {
  registerUser: (data: {
    name: string;
    email: string;
    phone: string;
    barrio: string;
    role: UserRole;
    organization?: string;
  }) => void;
  logoutUser: () => void;
  addHelpPoint: (
    pointData: Omit<HelpPoint, 'id' | 'createdAt' | 'updatedAt' | 'verified' | 'pending'>,
    resumes?: number,
  ) => Promise<void>;
  addHelpNeed: (
    needData: Omit<HelpNeed, 'id' | 'createdAt' | 'supportersCount' | 'pending'>,
    resumes?: number,
  ) => Promise<void>;
  addPointComment: (pointId: string, commentText: string, resumes?: number) => Promise<boolean>;
  updateNeed: (needId: string, patch: NeedPatch, resumes?: number) => Promise<boolean>;
  deleteNeed: (needId: string, resumes?: number) => Promise<boolean>;
  updatePoint: (pointId: string, patch: PointPatch, resumes?: number) => Promise<boolean>;
  deletePoint: (pointId: string, resumes?: number) => Promise<boolean>;
  toggleSavePoint: (pointId: string) => void;
  supportNeed: (needId: string, action: SupportAction, resumes?: number) => Promise<void>;
  updateUserProfile: (updated: Partial<UserProfile>) => void;
} {
  const {
    helpPoints,
    helpNeeds,
    pointComments,
    supportedNeedIds,
    userProfile,
    setHelpPoints,
    setHelpNeeds,
    setPointComments,
    setSupportedNeedIds,
    setUserProfile,
    setSelectedPoint,
    setSelectedNeed,
    setUserLocation,
    setMapCenter,
    setMapZoom,
    notify,
    queueWrite,
    discardQueuedWrite,
    inflightIdsRef,
    authCallback,
    setAuthCallback,
    setIsAuthModalOpen,
    ensureIdentity,
    handleUnauthorized,
    handlePublishError,
    notifyLifecycleError,
    setReachable,
    confirmPoint,
    confirmNeed,
    confirmComment,
    clerkUserId,
    getToken,
    isSignedIn,
    signOut,
  } = deps;

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
    // Cancelar la sesión también deshace cualquier escritura guardada.
    discardQueuedWrite();
    setAuthCallback(null);
    setIsAuthModalOpen(false);
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
  const updateNeed = async (needId: string, patch: NeedPatch, resumes = 0): Promise<boolean> => {
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

    const applyPatch = (item: HelpNeed): HelpNeed =>
      item.id === needId ? { ...item, ...patch } : item;
    setHelpNeeds((prev) => prev.map(applyPatch));
    setSelectedNeed((prev) => (prev && prev.id === needId ? { ...prev, ...patch } : prev));

    if (previous.pending) {
      notify(
        'Cambio aplicado en tu dispositivo: se sincronizará con el servidor en cuanto vuelva la conexión.',
        'info',
      );
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
      setHelpNeeds((prev) =>
        prev.some((item) => item.id === needId) ? prev : [previous, ...prev],
      );
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
      setHelpNeeds((prev) =>
        prev.some((item) => item.id === needId) ? prev : [previous, ...prev],
      );
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
  const updatePoint = async (pointId: string, patch: PointPatch, resumes = 0): Promise<boolean> => {
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

    setHelpPoints((prev) =>
      prev.map((item) => (item.id === pointId ? { ...item, ...patch } : item)),
    );
    setSelectedPoint((prev) => (prev && prev.id === pointId ? { ...prev, ...patch } : prev));

    if (previous.pending) {
      notify(
        'Cambio aplicado en tu dispositivo: se sincronizará con el servidor en cuanto vuelva la conexión.',
        'info',
      );
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
      setHelpPoints((prev) =>
        prev.some((item) => item.id === pointId) ? prev : [previous, ...prev],
      );
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
        handleUnauthorized(
          'Tu sesión caducó: se deshizo tu apoyo. Vuelve a entrar para apoyar de nuevo.',
        );
        queueWrite((more) => void supportNeed(needId, action, more), resumes + 1);
      } else {
        if (isServerUnreachable(error)) setReachable(false);
        notify(
          'No pudimos registrar tu apoyo: se deshizo el cambio. Inténtalo de nuevo.',
          'warning',
        );
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

  return {
    registerUser,
    logoutUser,
    addHelpPoint,
    addHelpNeed,
    addPointComment,
    updateNeed,
    deleteNeed,
    updatePoint,
    deletePoint,
    toggleSavePoint,
    supportNeed,
    updateUserProfile,
  };
}
