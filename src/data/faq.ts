/**
 * Fuente única de verdad del **FAQ** de AyudaEnCali (T35).
 *
 * Las preguntas y respuestas viven aquí como **datos tipados** (nada de JSX)
 * para que tres consumidores distintos las rendericen sin duplicar texto:
 *
 * 1. `src/components/FaqModal.tsx` — el modal de ayuda contextual.
 * 2. `src/components/FaqSection.tsx` — la sección siempre presente en el DOM
 *    (indexable, `/#preguntas-frecuentes`).
 * 3. El bloque `FAQPage` de JSON-LD de `index.html` (estático, en el `<head>`),
 *    que se genera con {@link buildFaqPageJsonLd}.
 *
 * ## Regla de sincronía (importante)
 *
 * `index.html` **no** puede importar TypeScript (Vite no transforma datos
 * dentro del HTML), así que el JSON-LD es estático y hay que regenerarlo
 * cuando cambie este fichero:
 *
 * ```bash
 * node --input-type=module --import tsx -e "const m = await import('./src/data/faq.ts'); console.log(JSON.stringify(m.buildFaqPageJsonLd(), null, 2))"
 * ```
 *
 * y sustituir con esa salida el contenido del
 * `<script type="application/ld+json">` con `@type: FAQPage`. El texto plano de
 * cada respuesta sale de {@link faqItemToText} y **debe** coincidir carácter a
 * carácter con lo que se ve en pantalla (por eso la respuesta se modela como
 * bloques y no como `ReactNode`).
 */

/** Un fragmento de respuesta con su marca opcional. */
export interface FaqSpan {
  text: string;
  /** `strong` → negrita, `em` → cursiva, `code` → monoespaciada. */
  mark?: 'strong' | 'em' | 'code';
}

/** Párrafo del FAQ. */
export interface FaqParagraph {
  kind: 'p';
  spans: readonly FaqSpan[];
}

/** Lista con viñetas del FAQ. */
export interface FaqList {
  kind: 'ul';
  items: readonly (readonly FaqSpan[])[];
}

export type FaqBlock = FaqParagraph | FaqList;

export interface FaqItem {
  /** Ancla interna (p. ej. la sección de cookies desde el banner). */
  id: string;
  question: string;
  blocks: readonly FaqBlock[];
}

/* ------------------------------------------------------------------ *
 * Constructores breves para que los datos de abajo se lean como texto. *
 * ------------------------------------------------------------------ */

const t = (text: string): FaqSpan => ({ text });
const b = (text: string): FaqSpan => ({ text, mark: 'strong' });
const em = (text: string): FaqSpan => ({ text, mark: 'em' });
const co = (text: string): FaqSpan => ({ text, mark: 'code' });

const p = (...spans: readonly FaqSpan[]): FaqParagraph => ({ kind: 'p', spans });
const ul = (...items: readonly (readonly FaqSpan[])[]): FaqList => ({ kind: 'ul', items });

/* ------------------------------------------------------------------ *
 * Las preguntas.                                                      *
 * ------------------------------------------------------------------ */

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: 'que-es',
    question: '¿Qué es AyudaEnCali?',
    blocks: [
      p(
        t(
          'Es una plataforma comunitaria de emergencias para Santiago de Cali: mapa interactivo con centros de acopio, albergues, veterinarias y servicios de salud; un tablón donde la gente publica necesidades solidarias; y un asistente de IA que responde con esos mismos datos.',
        ),
      ),
      p(
        t(
          'La mantenemos entre vecinos: cualquiera puede reportar un punto o una necesidad y así mantener el mapa actualizado.',
        ),
      ),
    ],
  },
  {
    id: 'cuentas',
    question: '¿Necesito una cuenta? ¿Cuál es la diferencia entre registrarme e ingresar?',
    blocks: [
      p(t('Para '), b('reportar, comentar o publicar necesidades'), t(' sí. Hay dos caminos:')),
      ul(
        [
          b('Cuenta comunitaria:'),
          t(
            ' rellenas el formulario con tu nombre, correo, teléfono, barrio y rol (ciudadano, voluntario o coordinador). Sirve para identificar quién reporta.',
          ),
        ],
        [
          b('Ingresar con tu cuenta existente:'),
          t(' si ya tienes cuenta, pulsa '),
          em('«¿Ya tienes cuenta? Ingresa con tu cuenta»'),
          t(
            ' en el mismo formulario. Esa sesión es la identidad válida para los apoyos y se sincroniza con tu perfil local.',
          ),
        ],
      ),
      p(t('Consultar el mapa, el tablón y el asistente no requiere cuenta.')),
    ],
  },
  {
    id: 'reportar',
    question: '¿Cómo publico un centro de ayuda o una necesidad?',
    blocks: [
      ul(
        [
          b('Punto en el mapa:'),
          t(' botón naranja '),
          em('«Reportar Ayuda»'),
          t(' en la parte superior (o el botón '),
          em('+'),
          t(
            ' central en móvil). Elige la categoría —acopio, veterinaria, albergue o salud— y la ubicación.',
          ),
        ],
        [
          b('Necesidad en el tablón:'),
          t(' en la pestaña '),
          em('Tablón'),
          t(', botón '),
          em('«Publicar Necesidad»'),
          t('. Describe insumos, barrio y contacto.'),
        ],
      ),
      p(t('Los dos pasos piden cuenta comunitaria antes de abrir el formulario.')),
    ],
  },
  {
    id: 'apoyos',
    question: '¿Cómo funcionan los apoyos (el corazón)?',
    blocks: [
      p(
        t('Cada persona con sesión iniciada puede dar '),
        b('un solo apoyo por necesidad'),
        t(
          ': pulsas el corazón y se suma; si lo vuelves a pulsar, se retira. El contador nunca baja de cero.',
        ),
      ),
      p(
        t(
          'Sin sesión, al pulsar se abre el inicio de sesión de la app; no se registra ningún apoyo anónimo.',
        ),
      ),
    ],
  },
  {
    id: 'asistente',
    question: '¿Qué hace el asistente IA y de dónde saca la información?',
    blocks: [
      p(
        t(
          'El asistente responde dudas sobre centros de ayuda, teléfonos de emergencia y qué hacer ante una crisis en Cali. Usa los puntos y necesidades publicados en esta misma plataforma.',
        ),
      ),
      p(
        t(
          'Si el proveedor de IA no está disponible, responde con un directorio local: el chat nunca queda caído. No sustituye a los servicios de emergencia: para urgencias llama al ',
        ),
        b('123'),
        t('.'),
      ),
    ],
  },
  {
    id: 'datos',
    question: '¿Qué pasa si la base de datos o mi conexión fallan?',
    blocks: [
      p(
        t(
          'La app guarda los datos en varios niveles: Supabase (PostgreSQL) cuando hay conexión, una caché en memoria y ',
        ),
        co('localStorage'),
        t(
          ' como respaldo. Si un servicio cae, la interfaz sigue funcionando con lo último que cargó.',
        ),
      ),
      p(
        t(
          'Tampoco enviamos tu ubicación a terceros: el mapa pide el GPS solo cuando tú lo activas.',
        ),
      ),
    ],
  },
  {
    id: 'cookies',
    question: 'Cookies y privacidad: ¿qué se guarda en mi equipo?',
    blocks: [
      p(
        b('Siempre (esenciales):'),
        t(
          ' la sesión de acceso y seguridad, y este propio consentimiento para no volver a preguntarte.',
        ),
      ),
      p(
        b('Solo si lo aceptas (opcionales):'),
        t(
          ' recursos de terceros, hoy las tipografías de Google, que pueden registrar tu IP conforme a la política de dicho proveedor. Si eliges «Solo esenciales», no se pide nada a terceros y la app usa las fuentes del sistema.',
        ),
      ),
      p(
        t(
          'Tu perfil comunitario (nombre, correo, teléfono, barrio) solo se guarda cuando tú creas la cuenta y no se publica en el mapa. Puedes cambiar esta elección aquí mismo.',
        ),
      ),
    ],
  },
  {
    id: 'contacto',
    question: '¿Qué hago en una emergencia real?',
    blocks: [
      p(
        t('Llama primero a los servicios de emergencia: '),
        b('123'),
        t(
          ' (Bomberos, Ambulancia y Policía). Esta plataforma sirve para coordinar ayuda comunitaria, no reemplaza a esos servicios.',
        ),
      ),
      p(
        t('Desde el encabezado tienes el botón '),
        em('«Línea 123»'),
        t(' que marca directo desde tu teléfono.'),
      ),
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Preguntas PAA añadidas en T37. Solo llevan datos que existen en el  *
 * repo: `CALI_EMERGENCY_NUMBERS` (src/data/initialData.ts), las       *
 * necesidades publicadas en el tablón y las categorías del mapa.      *
 * ------------------------------------------------------------------ */

export const FAQ_PAA_ITEMS: readonly FaqItem[] = [
  {
    id: 'numeros-emergencia',
    question: '¿Qué números de emergencia debo guardar en Cali?',
    blocks: [
      p(t('Estas son las líneas de emergencia de Cali que usa la app:')),
      ul(
        [b('123'), t(' — Emergencias unificadas: Policía, Ambulancia y Bomberos.')],
        [b('119'), t(' — Cuerpo de Bomberos de Cali: incendios, rescates e inundaciones.')],
        [b('132'), t(' — Cruz Roja Seccional Valle: urgencias médicas y socorro.')],
        [b('144'), t(' — Defensa Civil Valle: desastres naturales y apoyo civil.')],
        [b('125'), t(' — CRUE Valle (Ambulancias): Centro Regulador de Urgencias Médicas.')],
        [b('(602) 441 1525'), t(' — Zoonosis y Bienestar Animal Cali: fauna y rescates de animales de calle.')],
      ),
      p(
        t(
          'En una emergencia real llama primero al 123: esta plataforma coordina ayuda comunitaria y no reemplaza a esos servicios.',
        ),
      ),
    ],
  },
  {
    id: 'llevar-al-albergue',
    question: '¿Qué llevar a un albergue?',
    blocks: [
      p(
        t(
          'Las necesidades cambian según el albergue: mira el tablón de la app, donde cada albergue publica lo que pide. En los reportes activos de Cali se repiten:',
        ),
      ),
      ul(
        [t('colchonetas y cobijas térmicas o secas')],
        [t('agua potable en pacas')],
        [t('kits de aseo')],
        [t('alimentos no perecederos')],
      ),
      p(
        t(
          'Antes de salir, revisa el tablón y confirma con el contacto del reporte: así no llevas cosas que ya no necesitan.',
        ),
      ),
    ],
  },
  {
    id: 'donar-en-cali',
    question: '¿Dónde donar en Cali?',
    blocks: [
      p(
        t('Abre el mapa y filtra por la categoría '),
        em('Centros de Acopio'),
        t(
          ': verás los puntos de donación activos con dirección, barrio y teléfono. Para saber qué necesitan, consulta el tablón: cada publicación lista los insumos urgentes.',
        ),
      ),
      p(
        t(
          'Consulta siempre con el contacto del punto antes de salir: los puntos son comunitarios y su horario cambia.',
        ),
      ),
    ],
  },
  {
    id: 'mascotas-emergencia',
    question: '¿Qué hago con mi mascota en una emergencia?',
    blocks: [
      p(
        b('(602) 441 1525'),
        t(
          ' — Zoonosis y Bienestar Animal Cali atiende fauna y rescates de animales de calle.',
        ),
      ),
      p(
        t('En el mapa, la categoría '),
        em('Veterinarias'),
        t(
          ' lista clínicas y urgencias veterinarias de Cali con dirección y teléfono; consulta antes si el albergue donde vas acepta mascotas.',
        ),
      ),
    ],
  },
  {
    id: 'salud-cercana',
    question: '¿Dónde está el centro de salud más cercano en Cali?',
    blocks: [
      p(
        t('En el mapa activa '),
        em('Cerca de mí'),
        t(' y elige la categoría '),
        em('Emergencias Médicas'),
        t(
          ': los puntos de salud se ordenan por distancia desde tu barrio o desde tu GPS.',
        ),
      ),
      p(
        t('Revisa la dirección y el teléfono en la ficha de cada punto antes de salir.'),
      ),
    ],
  },
];

/** El FAQ completo: 8 preguntas originales + 5 preguntas PAA (T37). */
export const ALL_FAQ_ITEMS: readonly FaqItem[] = [...FAQ_ITEMS, ...FAQ_PAA_ITEMS];

/* ------------------------------------------------------------------ *
 * Texto plano (para JSON-LD) y generador del bloque FAQPage.          *
 * ------------------------------------------------------------------ */

const spansToText = (spans: readonly FaqSpan[]): string =>
  spans.map((span) => span.text).join('');

const blockToText = (block: FaqBlock): string =>
  block.kind === 'p'
    ? spansToText(block.spans)
    : block.items.map(spansToText).join('\n');

/**
 * Texto plano de una respuesta, idéntico al que se lee en pantalla: los
 * bloques se separan con salto de línea (como en el DOM) y las viñetas
 * también. Es la cadena que va en `acceptedAnswer.text` del JSON-LD.
 */
export const faqItemToText = (item: FaqItem): string =>
  item.blocks.map(blockToText).join('\n');

export interface FaqQuestionJsonLd {
  '@type': 'Question';
  name: string;
  acceptedAnswer: { '@type': 'Answer'; text: string };
}

export interface FaqPageJsonLd {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  inLanguage: 'es-CO';
  mainEntity: FaqQuestionJsonLd[];
}

/**
 * Construye el bloque `FAQPage` de JSON-LD a partir de este mismo fichero.
 * Es la salida que debe vivir en `index.html` (ver la regla de sincronía
 * documentada arriba).
 */
export const buildFaqPageJsonLd = (
  items: readonly FaqItem[] = ALL_FAQ_ITEMS,
): FaqPageJsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  inLanguage: 'es-CO',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faqItemToText(item),
    },
  })),
});
