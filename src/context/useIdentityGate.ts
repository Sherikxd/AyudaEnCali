import { useEffect, useRef, type RefObject } from 'react';
import { ApiError } from '../services/api';
import { logger } from '../utils/logger';
import {
  IDENTITY_MESSAGE,
  IDENTITY_PROMPT_COOLDOWN_MS,
  isPermanentRejection,
  isServerUnreachable,
  isUnauthorized,
  type SyncKind,
} from './appConstants';
import type { NotifyFn } from './appTypes';

export interface IdentityGateApi {
  /**
   * Espejo de la identidad vigente (mismo patrón que `serverReachableRef`).
   * La cola `pendingWrite` guarda un `build` que cierra sobre el render en
   * que se encoló; al reanudarse, `ensureIdentity` debe juzgar con la sesión
   * ACTUAL o la escritura se re-encolaría para siempre en vez de ejecutarse
   * (T8 · lo cubre el L6 de `scripts/test-nucleos.mjs`).
   */
  identityRef: RefObject<{
    isSignedIn: boolean | undefined;
    clerkUserId: string | null | undefined;
    isRegistered: boolean;
  }>;
  promptForIdentity: (message: string) => void;
  ensureIdentity: (build: (resumes: number) => void, resumes: number, message: string) => boolean;
  handleUnauthorized: (message: string) => void;
  handlePublishError: (
    error: unknown,
    what: string,
    failed?: { kind: SyncKind; id: string },
  ) => void;
  notifyLifecycleError: (error: unknown, what: string) => void;
}

export interface IdentityGateDeps {
  /** `undefined` mientras Clerk aún no ha resuelto la sesión. */
  isSignedIn: boolean | undefined;
  clerkUserId: string | null | undefined;
  isRegistered: boolean;
  openAuthModal: (message?: string, onSuccess?: () => void) => void;
  openSignIn: () => void;
  notify: NotifyFn;
  setReachable: (reachable: boolean) => void;
  lastIdentityPromptRef: RefObject<number>;
  /** Encola la escritura cuando todavía no hay sesión de Clerk (T8). */
  queueWrite: (build: (resumes: number) => void, resumes: number) => void;
  markFailed: (kind: SyncKind, id: string, reason: string) => void;
}

/**
 * Única puerta de entrada de las escrituras (T8): sin sesión de Clerk no se
 * escribe ni en el servidor ni en el dispositivo. Aquí viven el aviso de
 * identidad, su enfriamiento y la traducción de errores de publicación a
 * avisos visibles.
 */
export function useIdentityGate(deps: IdentityGateDeps): IdentityGateApi {
  const {
    isSignedIn,
    clerkUserId,
    isRegistered,
    openAuthModal,
    openSignIn,
    notify,
    setReachable,
    lastIdentityPromptRef,
    queueWrite,
    markFailed,
  } = deps;

  const identityRef = useRef({ isSignedIn, clerkUserId, isRegistered });
  // El espejo se actualiza en un efecto (nunca durante el render, que es lo
  // que prohíbe `react(refs)`): todas las lecturas (`ensureIdentity`, la cola
  // y el sync) ocurren en manejadores o efectos posteriores al commit.
  useEffect(() => {
    identityRef.current = { isSignedIn, clerkUserId, isRegistered };
  }, [isSignedIn, clerkUserId, isRegistered]);

  /**
   * Abre el flujo de identidad correspondiente, con enfriamento corto para
   * que los reintentos automáticos no apilen ventanas encima del usuario.
   */
  const promptForIdentity = (message: string) => {
    const now = Date.now();
    if (now - lastIdentityPromptRef.current < IDENTITY_PROMPT_COOLDOWN_MS) return;
    lastIdentityPromptRef.current = now;
    if (!isRegistered) openAuthModal(message);
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

  /**
   * El servidor rechazó o no contestó al publicar: el ítem queda local.
   *
   * Rechazo permanente (BUG-02): no prometemos «se reintentará» si el
   * servidor ya dijo que no. El ítem queda en `failed` y el aviso
   * accionable (reintentar / descartar) lo saca el efecto de rechazados.
   */
  const handlePublishError = (
    error: unknown,
    what: string,
    failed?: { kind: SyncKind; id: string },
  ) => {
    if (isUnauthorized(error)) {
      handleUnauthorized(`Tu sesión caducó: vuelve a entrar para completar ${what}.`);
      return;
    }
    if (isServerUnreachable(error)) setReachable(false);
    logger.warn(`No se pudo publicar ${what}:`, error);
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
      notify(
        `Sin conexión con el servidor: no se pudo ${what}. Inténtalo de nuevo en unos segundos.`,
        'error',
      );
      return;
    }
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      notify(error.message, 'error');
      return;
    }
    logger.warn(`No se pudo ${what}:`, error);
    notify(`No se pudo ${what}. Inténtalo de nuevo.`, 'error');
  };

  return {
    identityRef,
    promptForIdentity,
    ensureIdentity,
    handleUnauthorized,
    handlePublishError,
    notifyLifecycleError,
  };
}
