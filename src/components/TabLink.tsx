import React from 'react';
import { useApp } from '../context/AppContext';
import { hashForTab, type TabKey } from '../utils/tabUrl';

interface TabLinkProps {
  tab: TabKey;
  children: React.ReactNode;
  className?: string;
  /**
   * `false` en enlaces que no navegan a «la vista actual» (p. ej. el logo):
   * así solo la navegación real lleva `aria-current` (T36).
   */
  ariaCurrent?: boolean;
}

/**
 * Enlace de pestaña (T38): con JavaScript, un `<a href="#…">` permite
 * compartir el estado de la SPA y cambia la vista sin recargar ni anclar
 * (`pushState`). El hash no representa una página independiente; sin
 * JavaScript, `index.html` conserva el contenido público básico.
 *
 * `aria-current` lo lleva él para que nunca se desincronice de la pestaña
 * activa (T36).
 */
export const TabLink: React.FC<TabLinkProps> = ({ tab, children, className, ariaCurrent = true }) => {
  const { activeTab, setActiveTab } = useApp();

  return (
    <a
      href={hashForTab(tab)}
      aria-current={ariaCurrent && activeTab === tab ? 'page' : undefined}
      onClick={(event) => {
        // Con modificadores (⌘/Ctrl/Mayús) manda el navegador: abrir en otra
        // pestaña con este mismo hash es exactamente lo que se espera.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        setActiveTab(tab);
      }}
      className={className}
    >
      {children}
    </a>
  );
};
