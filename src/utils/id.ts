/**
 * Fábrica única de identificadores locales (T9 · FAL-04).
 *
 * Antes cada sitio generaba su id con `Date.now()`: un doble clic, dos
 * pestañas o dos dispositivos en el mismo milisegundo producían la misma
 * clave y la cola offline perdía escrituras en silencio (dos reportes con el
 * mismo id se fusionan como uno solo).
 *
 * `crypto.randomUUID()` (navegadores modernos y Node ≥ 20, el mínimo del
 * proyecto) garantiza unicidad. Se conserva el prefijo legible por dos
 * motivos:
 *
 *  - sigue distinguiendo de un vistazo los ids generados aquí (`cali-point-…`)
 *    y respeta el patrón que ya usa el servidor (`server/handlers/points.ts`):
 *    `cali-point-${randomUUID()}`.
 *  - cumple el formato que el servidor acepta en `optionalId`
 *    (`/^[A-Za-z0-9_-]{4,80}$/`, `server/validation.ts:110-114`): 48
 *    caracteres para `cali-point-<uuid>`, dentro del límite de 80.
 *
 * Los ids semilla (`cali-acopio-1`, `need-1`, `comm-1`…) **no** colisionan:
 * son literales exactos y se comparan como conjunto en `SEED_IDS`
 * (`src/context/AppContext.tsx`).
 */
export const newId = (prefix?: string): string => {
  const uuid = generateUuid();
  return prefix ? `${prefix}-${uuid}` : uuid;
};

/** UUID v4. Si `crypto.randomUUID` no existiera (contexto no seguro), se recurre a un relleno con la misma forma. */
const generateUuid = (): string => {
  const webcrypto: Crypto | undefined = typeof crypto === 'undefined' ? undefined : crypto;
  if (webcrypto && typeof webcrypto.randomUUID === 'function') return webcrypto.randomUUID();

  if (webcrypto?.getRandomValues) {
    const bytes = webcrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Último recurso (solo contextos sin Web Crypto): 122 bits de azar en vez
  // del milisegundo compartido que causaba las colisiones.
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  const a = hex();
  const b = hex();
  const c = hex();
  const d = hex();
  return `${a}-${b}-4${c.slice(1)}-a${d.slice(1)}-${hex()}`;
};
