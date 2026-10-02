/**
 * Metadatos de la SPA. Al no haber enrutador, el navegador no recarga la
 * página al cambiar de pestaña: aquí se actualiza `<title>` y las etiquetas
 * de descripción/vista previa para que compartir o buscar la app muestre el
 * título de la vista que la persona tiene abierta.
 *
 * T36 (SEO-13): la sincronización cubre también `og:url`, `og:image`,
 * `twitter:image` y la `<link rel="canonical">`.
 *
 * Los hashes son estados de la SPA, no páginas independientes: no crean
 * destinos indexables ni cambian la URL que recibe el servidor. Por eso la
 * canónica y `og:url` siempre apuntan a la raíz, aunque el título del
 * navegador refleje la vista abierta.
 */

import { CDN_IMAGES } from '../config/images';
import type { TabKey } from './tabUrl';

/** Host canónico del sitio (el dominio raíz redirige a `www`). */
export const SITE_URL = 'https://www.ayudaencali.lat/';

export interface PageMeta {
  title: string;
  description: string;
  canonicalPath?: string;
}

/** Título y descripción de cada pestaña, para el navegador y las vistas al compartir. */
export const PAGE_META: Record<TabKey, PageMeta> = {
  map: {
    title: 'Centros de acopio y albergues en Cali | AyudaEnCali',
    description:
      'Mapa en vivo de emergencias en Cali: centros de acopio, albergues, veterinarias y salud por barrio. Filtra por categoría o localízate con GPS.',
  },
  blog: {
    title: 'Tablón de necesidades y ayudas en Cali | AyudaEnCali',
    description:
      'Publica y consulta necesidades solidarias de albergues, veterinarias y centros de acopio en Cali: insumos urgentes, prioridades y apoyos de la comunidad.',
  },
  chat: {
    title: 'Asistente IA de emergencias en Cali | AyudaEnCali',
    description:
      'Pregunta al asistente de AyudaEnCali por centros de ayuda, teléfonos de emergencia y qué hacer ante una crisis en Santiago de Cali.',
  },
  profile: {
    title: 'Tu perfil comunitario | AyudaEnCali',
    description:
      'Gestiona tu cuenta comunitaria en Cali: barrio, rol, reportes publicados, puntos guardados y configuración de privacidad.',
  },
};

export const FAQ_PAGE_META: PageMeta = {
  title: 'Preguntas frecuentes sobre ayuda y emergencias en Cali | AyudaEnCali',
  description:
    'Respuestas sobre reportes, cuentas, necesidades, privacidad y líneas de emergencia de Santiago de Cali.',
  canonicalPath: '/preguntas-frecuentes/',
};

/** Escribe el contenido en la primera metaetiqueta que cumpla el selector. */
const setMetaContent = (selector: string, content: string): void => {
  const tag = document.querySelector<HTMLMetaElement>(selector);
  if (tag) tag.setAttribute('content', content);
};

/** Apunta el primer `<link>` que cumpla el selector a una URL. */
const setLinkHref = (selector: string, href: string): void => {
  const tag = document.querySelector<HTMLLinkElement>(selector);
  if (tag) tag.setAttribute('href', href);
};

/** Sincroniza `<title>`, descripción, OG, Twitter y la canónica de la URL. */
export function updatePageMeta(meta: PageMeta): void {
  const pageUrl = new URL(meta.canonicalPath ?? '/', SITE_URL).toString();
  document.title = meta.title;
  setMetaContent('meta[name="description"]', meta.description);
  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.description);
  setMetaContent('meta[property="og:url"]', pageUrl);
  setMetaContent('meta[property="og:image"]', CDN_IMAGES.og);
  setMetaContent('meta[name="twitter:image"]', CDN_IMAGES.og);
  setLinkHref('link[rel="canonical"]', pageUrl);
}
