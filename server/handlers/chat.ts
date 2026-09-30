import { GoogleGenAI } from '@google/genai';
import type { ApiHandler } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { chatLimiter } from '../limiters.js';
import { ensureContextFresh } from '../context.js';
import { errorMessage, logger } from '../logger.js';
import { memory } from '../store.js';
import { LIMITS, validateChat } from '../validation.js';
import type { ChatResponse } from '../../src/types/index.js';

/* -------------------------------------------------------------------------- */
/* Cliente de Gemini (solo desde variables de entorno)                          */
/* -------------------------------------------------------------------------- */

function initGemini(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('GEMINI_API_KEY no configurada: el asistente usará el directorio local.');
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}
const ai = initGemini();

/** Modelo de Gemini configurable: permite migrar sin tocar código. */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Errores transitorios del proveedor (saturación puntual). */
function isTransientGeminiError(message: string): boolean {
  return /"(UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|INTERNAL)"/.test(message) || /\b(503|429)\b/.test(message);
}

/**
 * Genera la respuesta del modelo con un reintento para fallos transitorios.
 * Devuelve `null` cuando el modelo no está disponible para usar el respaldo.
 */
async function generateWithGemini(
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  systemInstruction: string,
): Promise<string | null> {
  if (!ai) return null;

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: { systemInstruction, temperature: 0.4 },
      });
      return response.text?.slice(0, LIMITS.long * 4) ?? null;
    } catch (error) {
      const message = errorMessage(error);
      if (attempt < 1 && isTransientGeminiError(message)) {
        await sleep(500);
        continue;
      }
      logger.warn(`Gemini no respondió (${message}): se usa el directorio local.`);
      return null;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Respuestas del asistente                                                     */
/* -------------------------------------------------------------------------- */

/** Instrucciones del sistema para CaliSolidaria IA. */
function buildSystemInstruction(barrio?: string): string {
  return `Eres "CaliSolidaria IA", el asistente inteligente oficial de la plataforma AyudaEnCali en la ciudad de Santiago de Cali, Colombia.
Tu misión es orientar a ciudadanos y voluntarios sobre:
1. Centros de acopio y camiones de recolección de donaciones (víveres, ropa, agua, enlatados).
2. Clínicas veterinarias de urgencia, albergues de animales y rescate de mascotas (perros, gatos).
3. Albergues y refugios comunitarios para personas y familias vulnerables.
4. Emergencias médicas, hospitales de Cali (HUV, Imbanaco, centros de salud), primeros auxilios y puestos de socorro.
5. Necesidades urgentes reportadas en barrios de Cali (Siloé, Aguablanca, Meléndez, San Antonio, Terrón Colorado, etc.).
6. Guiar al usuario para registrar un nuevo centro o necesidad en la plataforma.

DIRECTRICES CLAVE:
- Responde siempre en español, con tono solidario, claro, empático y 100% útil.
- Usa lenguaje caleño respetuoso y formal cuando sea apropiado (menciona barrios reales de Cali como San Antonio, Granada, Tequendama, San Fernando, Menga, Meléndez, Ciudad Jardín, El Vallado, etc.).
- Cuando el usuario pregunte por recursos cerca, revisa la lista de puntos proporcionada y destaca los más cercanos a su ubicación (${barrio || 'Cali general'}).
- Si el usuario comparte una necesidad de emergencia vital o riesgo inminente, recuerda siempre las líneas de emergencia oficiales de Cali:
  * Emergencias Cali: 123
  * Cruz Roja Seccional Valle: 132 / (602) 518 4200
  * Bomberos Cali: 119 / (602) 660 1111
  * Defensa Civil Valle: 144
  * Centro Regulador de Urgencias CRUE Valle: 125 / (602) 620 6819
  * Unidad Municipal de Asistencia Técnica Agropecuaria y Zoonosis: (602) 441 1525
- Presenta nombres, teléfonos y direcciones exactas con viñetas limpias sin formato recargado.
- Nunca inventes datos: si no hay información suficiente, indícalo y sugiere verificar con los contactos listados.

DATOS ACTUALES DE PUNTOS EN LA PLATAFORMA AYUDAENCALI:
${JSON.stringify(memory.points.slice(0, 20), null, 2)}

NECESIDADES URGENTES ACTIVAS:
${JSON.stringify(memory.needs.slice(0, 15), null, 2)}`;
}

/** Respuesta local cuando Gemini no está disponible o falla. */
function buildLocalReply(message: string): string {
  const query = message.toLowerCase();

  if (['veterinaria', 'perro', 'gato', 'mascota', 'animal'].some((kw) => query.includes(kw))) {
    const vets = memory.points.filter((p) => p.category === 'veterinaria');
    return (
      `🐾 **Puntos de Atención Veterinaria y Rescate Animal en Cali:**\n\n` +
      vets
        .map(
          (v) =>
            `• **${v.name}** (${v.barrio})\n  📍 ${v.address}\n  📞 ${v.phone} | Contacto: ${v.contactPerson}\n  ℹ️ ${v.description}\n`,
        )
        .join('\n') +
      `\nPara urgencias de fauna silvestre o Zoonosis Cali comunícate al (602) 441 1525.`
    );
  }

  if (['acopio', 'donar', 'camion', 'comida', 'víveres'].some((kw) => query.includes(kw))) {
    const acopios = memory.points.filter((p) => p.category === 'acopio');
    return (
      `🚚 **Centros de Acopio y Puntos de Recolección en Cali:**\n\n` +
      acopios
        .map(
          (a) =>
            `• **${a.name}** (${a.barrio})\n  📍 ${a.address}\n  📞 ${a.phone}\n  📦 Recibiendo: ${a.urgentItems.join(', ') || 'Víveres y agua'}\n  ⏰ ${a.schedule}\n`,
        )
        .join('\n') +
      `\nPuedes llevar tus donaciones directamente o coordinar recolección con sus encargados.`
    );
  }

  if (['albergue', 'refugio', 'dormir', 'hospedaje'].some((kw) => query.includes(kw))) {
    const albergues = memory.points.filter((p) => p.category === 'albergue');
    return (
      `🏠 **Albergues y Refugios Comunitarios en Cali:**\n\n` +
      albergues
        .map(
          (a) =>
            `• **${a.name}** (${a.barrio})\n  📍 ${a.address}\n  👥 Capacidad disponible: ${a.capacity || 'Consulta directa'}\n  ℹ️ ${a.description}\n`,
        )
        .join('\n')
    );
  }

  if (['salud', 'hospital', 'medico', 'herido', 'urgencia'].some((kw) => query.includes(kw))) {
    const salud = memory.points.filter((p) => p.category === 'salud');
    return (
      `🏥 **Puntos de Emergencia Médica y Salud en Cali:**\n\n` +
      salud
        .map(
          (s) =>
            `• **${s.name}** (${s.barrio})\n  📍 ${s.address}\n  ⏰ Atención: ${s.schedule}\n`,
        )
        .join('\n') +
      `\n🚨 **Líneas Vitales de Cali:**\n• Línea de Emergencia: 123\n• Ambulancias CRUE Valle: 125\n• Cruz Roja Valle: 132`
    );
  }

  if (['registrar', 'nuevo', 'agregar', 'crear'].some((kw) => query.includes(kw))) {
    return `¡Claro! En AyudaEnCali puedes registrar un nuevo centro o necesidad de dos maneras:\n\n1. En la pestaña **Mapa**, presiona el botón **"+ Reportar Punto"** arriba a la derecha, o haz clic en la ubicación del mapa.\n2. En la pestaña **Tablón de Ayudas**, puedes publicar una necesidad urgente para que los voluntarios y centros la vean de inmediato.\n\n¿Deseas que te ayude a registrarlo ahora mismo? Cuéntame el nombre, barrio y tipo de ayuda.`;
  }

  return (
    `¡Hola! Soy el asistente de **AyudaEnCali**. En este momento tenemos registrados **${memory.points.length} puntos activos** en diferentes comunas de Cali:\n\n` +
    `• 🚚 **Centros de Acopio y Camiones**: Recolección de víveres, agua y cobijas.\n` +
    `• 🐾 **Veterinarias y Refugios Animales**: Atención médica y rescate de mascotas.\n` +
    `• 🏠 **Albergues Temporales**: Alojamiento seguro para familias.\n` +
    `• 🏥 **Salud y Emergencias**: Hospitales (HUV, Imbanaco) y primeros auxilios.\n\n` +
    `Dime en qué barrio estás (ej. San Antonio, Granada, Siloé, Tequendama, Valle del Lili) o qué recurso necesitas para indicarte el más cercano.`
  );
}

/**
 * `POST /api/chat` — asistente CaliSolidaria IA.
 *
 * No exige sesión (orientación pública), pero sí límite de tasa: cada
 * pregunta que llega a Gemini cuesta tokens. Si el modelo no responde se
 * cae al directorio local. El contexto (puntos y necesidades) se refresca
 * desde Supabase antes de responder (`server/context.ts`).
 */
export const chatHandler: ApiHandler = async (input, res) => {
  if (effectiveMethod(input.method) !== 'POST') return notFoundResult(input);

  if (chatLimiter.enforce(input.clientIp, res)) return null;

  const parsed = validateChat(input.body);
  if (!parsed.ok) {
    res.status(400).json({ error: 'Mensaje inválido.', details: parsed.errors });
    return null;
  }

  const { message, barrio, history } = parsed.value;

  // Contexto al día ANTES de armar las instrucciones: sin este paso el
  // asistente anunciaría la semilla (3 necesidades, 5 puntos) aunque la BD
  // tenga datos reales o esté recién poblada (P1 de la T12).
  await ensureContextFresh();

  const systemInstruction = buildSystemInstruction(barrio);

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = history.map(
    (item) => ({
      // Gemini distingue "user" y "model": el historial usa "assistant".
      role: item.sender === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.text }],
    }),
  );
  contents.push({ role: 'user', parts: [{ text: message }] });

  const replyText = await generateWithGemini(contents, systemInstruction);
  if (replyText) {
    const payload: ChatResponse = { reply: replyText, source: 'gemini' };
    return { status: 200, body: payload };
  }

  return { status: 200, body: { reply: buildLocalReply(message) } };
};
