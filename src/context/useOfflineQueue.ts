import { useEffect, useRef, useState, type RefObject } from 'react';
import { MAX_WRITE_RESUMES, PENDING_WRITE_TTL_MS, type PendingWrite } from './appConstants';
import { logger } from '../utils/logger';

export interface OfflineQueueApi {
  /** Escritura en espera de identidad (`null` = no hay ninguna). */
  pendingWrite: PendingWrite | null;
  /** Guarda una escritura para reanudarla cuando entre la cuenta. */
  queueWrite: (build: (resumes: number) => void, resumes: number) => void;
  /** Cancelar: descarta la escritura y reinicia los contadores asociados. */
  discardQueuedWrite: () => void;
  /** Solo reinicia el enfriamiento de los avisos de identidad. */
  resetIdentityPrompt: () => void;
  /** Instante del último aviso de identidad (frente a bucles 401). */
  lastIdentityPromptRef: RefObject<number>;
  /** Ids cuyo POST está en vuelo: el reenvío automático no debe duplicarlos. */
  inflightIdsRef: RefObject<Set<string>>;
  /** Intentos de reenvío por elemento local sin confirmar y por sesión. */
  syncAttemptsRef: RefObject<Map<string, number>>;
}

export interface OfflineQueueSession {
  /** `undefined` mientras Clerk aún no ha resuelto la sesión. */
  isSignedIn: boolean | undefined;
  clerkUserId: string | null | undefined;
}

/**
 * Cola offline (T8): si alguien intenta publicar/apoyar sin sesión de Clerk,
 * la acción se guarda y se reanuda en cuanto entre la cuenta. Mismo espíritu
 * que el `authCallback` del registro: cancelar el modal la descarta
 * (`closeAuthModal`), completar el flujo la conserva (`completeAuthModal`).
 */
export function useOfflineQueue(session: OfflineQueueSession): OfflineQueueApi {
  const { isSignedIn, clerkUserId } = session;

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

  const discardQueuedWrite = () => {
    setPendingWrite(null);
    consumedWriteRef.current = null;
    lastIdentityPromptRef.current = 0;
  };

  const resetIdentityPrompt = () => {
    lastIdentityPromptRef.current = 0;
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

  return {
    pendingWrite,
    queueWrite,
    discardQueuedWrite,
    resetIdentityPrompt,
    lastIdentityPromptRef,
    inflightIdsRef,
    syncAttemptsRef,
  };
}
