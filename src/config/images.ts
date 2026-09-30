/**
 * URLs de las imágenes servidas desde **Cloudinary** (CDN).
 *
 * El *cloud name* no es un secreto: viaja en cada URL de entrega pública
 * (`https://res.cloudinary.com/<cloud>/image/upload/...`). Los secretos de la
 * cuenta (`API key` / `API secret`) viven únicamente en `.env` y solo los usa
 * el script de subida (`npm run cdn:upload`).
 *
 * Toda URL lleva transformaciones para que el CDN entregue el formato y el
 * tamaño que hace falta en vez del archivo original:
 * - `f_auto` → AVIF/WebP donde el navegador lo soporta (JPEG de reserva).
 * - `q_auto` → compresión automática.
 * - `w_*` → ancho máximo, para no descargar más píxeles de los necesarios.
 */

const CLOUD_NAME = 'z2t43npi';
const DELIVERY = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;

/** Compone una URL de entrega con sus transformaciones y su `public_id`. */
const deliver = (transformations: string, publicId: string): string =>
  `${DELIVERY}/${transformations}/${publicId}`;

export const CDN_IMAGES = {
  /** Fondo panorámico del héroe del tablón (hasta 1600 px de ancho). */
  blogHero: deliver('f_auto,q_auto,w_1600', 'ayudaencali/cali_relief_banner'),
  /** Imagen de las tarjetas del tablón (hasta 900 px de ancho). */
  volunteerBoxes: deliver('f_auto,q_auto,w_900', 'ayudaencali/volunteer_aid_boxes'),
  vetAnimalCare: deliver('f_auto,q_auto,w_900', 'ayudaencali/vet_animal_care'),
  /**
   * Vista previa social (Open Graph / Twitter): JPEG obligatorio y recorte
   * exacto 1200×630, porque los rastreadores de WhatsApp, X y Facebook no
   * interpretan AVIF/WebP.
   */
  og: deliver('c_fill,w_1200,h_630,f_jpg,q_auto', 'ayudaencali/og_ayudaencali'),
} as const;

/**
 * Correspondencia local → CDN de los archivos de `public/images/`. La usa el
 * script `cdn:upload` para subirlos y reescribir las filas ya guardadas en la
 * base de datos (`image_url`).
 */
export const LOCAL_TO_CDN: ReadonlyArray<{ file: string; publicId: string; source: string }> = [
  { file: 'cali_relief_banner_1790469947561.jpg', publicId: 'ayudaencali/cali_relief_banner', source: 'blogHero' },
  { file: 'volunteer_aid_boxes_1790469956879.jpg', publicId: 'ayudaencali/volunteer_aid_boxes', source: 'volunteerBoxes' },
  { file: 'vet_animal_care_1790469966961.jpg', publicId: 'ayudaencali/vet_animal_care', source: 'vetAnimalCare' },
  { file: 'og-ayudaencali.jpg', publicId: 'ayudaencali/og_ayudaencali', source: 'og' },
];
