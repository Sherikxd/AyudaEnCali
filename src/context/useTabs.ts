import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_TAB,
  hashForTab,
  initialTabFromHash,
  tabFromHash,
  type TabKey,
} from '../utils/tabUrl';

/**
 * Pestaña activa + URL (T38): el hash de la pestaña vive en la URL para
 * poder compartirlo y para que «atrás» vuelva a la pestaña anterior.
 */
export function useTabs() {
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

  return { activeTab, setActiveTab };
}
