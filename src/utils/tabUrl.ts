/**
 * Pestaña ↔ URL (T38 · SEO-05/12).
 *
 * La SPA **no tiene enrutador** (decisión 2026-09-29, intacta): cada pestaña
 * se identifica por un hash de la raíz —`#mapa`, `#tablon`, `#asistente`,
 * `#perfil`— y nunca por una ruta (`/mapa`), porque una ruta de servidor
 * rompería la 404 real (`public/404.html`) y exigiría rewrites del área de
 * infra.
 *
 * El hash se escribe con `history.pushState` y no con `location.hash`: así no
 * se dispara el anclaje del navegador (no hay ningún elemento con ese id) y
 * cada cambio deja una entrada que el back/forward puede recorrer. El
 * back/forward se escucha con `popstate`/`hashchange` en `AppContext`.
 */

/** Las cuatro pestañas de la app (la misma clave que usa `PAGE_META`). */
export type TabKey = 'map' | 'blog' | 'chat' | 'profile';

/** Pestaña que se abre sin hash y la que recupera el historial vacío. */
export const DEFAULT_TAB: TabKey = 'map';

/** Hash que representa a cada pestaña. */
export const TAB_HASHES: Record<TabKey, string> = {
  map: '#mapa',
  blog: '#tablon',
  chat: '#asistente',
  profile: '#perfil',
};

const HASH_TABS = new Map<string, TabKey>(
  (Object.entries(TAB_HASHES) as Array<[TabKey, string]>).map(([tab, hash]) => [hash, tab]),
);

/** Pestaña de ese hash, o `null` si no es de una pestaña (`#preguntas-frecuentes`). */
export function tabFromHash(hash: string): TabKey | null {
  return HASH_TABS.get(hash) ?? null;
}

/** Hash de una pestaña (listo para el `href` de un `<a>`). */
export function hashForTab(tab: TabKey): string {
  return TAB_HASHES[tab];
}

/**
 * Hash con el que arranca la app: el de la pestaña que pide la URL o, si no
 * pide ninguna, el de la pestaña por defecto («sin hash → `map`, como hoy»).
 */
export function initialTabFromHash(hash: string): TabKey {
  return tabFromHash(hash) ?? DEFAULT_TAB;
}
