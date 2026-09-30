/**
 * Metadatos de la SPA. Al no haber enrutador, el navegador no recarga la
 * página al cambiar de pestaña: aquí se actualiza `<title>` y las etiquetas
 * de descripción/vista previa para que compartir o buscar la app muestre el
 * título de la vista que la persona tiene abierta.
 */

export interface PageMeta {
  title: string;
  description: string;
}

type TabKey = 'map' | 'blog' | 'chat' | 'profile';

/** Título y descripción de cada pestaña. La marca se mantiene al final. */
export const PAGE_META: Record<TabKey, PageMeta> = {
  map: {
    title: 'Mapa de ayuda y emergencias en Cali | AyudaEnCali',
    description:
      'Mapa interactivo de Santiago de Cali con centros de acopio, albergues, veterinarias y salud: busca por barrio, filtra por categoría y localízate con GPS.',
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

/** Escribe el contenido en la primera metaetiqueta que cumpla el selector. */
const setMetaContent = (selector: string, content: string): void => {
  const tag = document.querySelector<HTMLMetaElement>(selector);
  if (tag) tag.setAttribute('content', content);
};

/** Sincroniza `<title>` y las metadatos de vista (description, OG, Twitter). */
export function updatePageMeta(meta: PageMeta): void {
  document.title = meta.title;
  setMetaContent('meta[name="description"]', meta.description);
  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.description);
}
