import { useState, type Dispatch, type SetStateAction } from 'react';

export interface AuthModalApi {
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: Dispatch<SetStateAction<boolean>>;
  authModalMessage: string;
  /** Callback del registro: lo dispara `registerUser` y lo limpia el cierre. */
  authCallback: (() => void) | null;
  setAuthCallback: Dispatch<SetStateAction<(() => void) | null>>;
  openAuthModal: (message?: string, onSuccess?: () => void) => void;
  completeAuthModal: () => void;
}

export interface AuthModalDeps {
  /** Pone a cero el enfriamiento de los avisos de identidad (401 / cola). */
  resetIdentityPrompt: () => void;
}

/**
 * Modal de registro (`AuthModal`): estado + las dos maneras de cerrarlo que
 * **no** son cancelación. La cancelación (`closeAuthModal`) vive en
 * `AppContext.tsx`: `scripts/test-authmodal.mjs` exige leerla literalmente
 * en ese fichero, con `setAuthCallback(null)` y `setIsAuthModalOpen(false)`
 * en su primer bloque.
 */
export function useAuthModal(deps: AuthModalDeps): AuthModalApi {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('');
  const [authCallback, setAuthCallback] = useState<(() => void) | null>(null);

  const openAuthModal = (message?: string, onSuccess?: () => void) => {
    setAuthModalMessage(
      message || 'Para realizar esta acción necesitas crear una cuenta comunitaria.',
    );
    setAuthCallback(() => onSuccess || null);
    setIsAuthModalOpen(true);
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
    deps.resetIdentityPrompt();
  };

  return {
    isAuthModalOpen,
    setIsAuthModalOpen,
    authModalMessage,
    authCallback,
    setAuthCallback,
    openAuthModal,
    completeAuthModal,
  };
}
