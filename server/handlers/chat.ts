import { GoogleGenAI } from '@google/genai';
import type { ApiHandler } from '../http.js';
import { effectiveMethod, notFoundResult } from '../http.js';
import { chatLimiter } from '../limiters.js';
import { localReply } from '../chatFallback.js';
import { ensureContextFresh } from '../context.js';
import { haversineKm, type GeoPoint } from '../geo.js';
import { errorMessage, logger } from '../logger.js';
import { memory } from '../store.js';
import { LIMITS, validateChat } from '../validation.js';
import type { HelpNeedWithAuthor } from '../entities.js';
import type { ChatResponse, HelpPoint } from '../../src/types/index.js';

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

/** Máximo de puntos y de necesidades que entran en el prompt (FEAT-07). */
const MAX_PROMPT_POINTS = 12;
const MAX_PROMPT_NEEDS = 8;

/** Foco geográfico de la pregunta: barrio declarado y/o coordenadas reales. */
interface PromptFocus {
  barrio?: string;
  coords?: GeoPoint | null;
}

const normBarrio = (value: string): string => value.trim().toLowerCase();

/** Proyección compacta de un punto para el prompt (FEAT-07). */
function pointCard(point: HelpPoint, focus: PromptFocus): Record<string, unknown> {
  const card: Record<string, unknown> = {
    name: point.name,
    barrio: point.barrio,
    address: point.address,
    phone: point.phone,
    category: point.category,
    schedule: point.schedule,
  };
  if (focus.coords) {
    const km = haversineKm(focus.coords, point);
    if (Number.isFinite(km)) card.distanceKm = Number(km.toFixed(1));
  }
  return card;
}

/**
 * Qué puntos entran en el prompt: primero los del barrio consultado y, si
 * hay coordenadas, los más cercanos primero. Sustituye al `slice(0, 20)`
 * ciego, que metía datos de barrios lejanos y devolvía respuestas genéricas.
 */
function selectPointsForPrompt(focus: PromptFocus): HelpPoint[] {
  const scored = memory.points.map((point) => ({
    point,
    distance: focus.coords ? haversineKm(focus.coords, point) : Number.NaN,
    sameBarrio: focus.barrio ? normBarrio(point.barrio) === normBarrio(focus.barrio) : false,
  }));

  scored.sort((a, b) => {
    if (focus.coords && Number.isFinite(a.distance) && Number.isFinite(b.distance)) {
      return a.distance - b.distance; // proximidad manda cuando hay GPS
    }
    if (a.sameBarrio !== b.sameBarrio) return a.sameBarrio ? -1 : 1;
    return 0;
  });

  return scored.slice(0, MAX_PROMPT_POINTS).map((entry) => entry.point);
}

/** Mismo criterio para las necesidades: nunca se listan las archivadas. */
function selectNeedsForPrompt(focus: PromptFocus): HelpNeedWithAuthor[] {
  const active = memory.needs.filter((need) => need.status !== 'archivada');
  const scored = active.map((need) => ({
    need,
    sameBarrio: focus.barrio ? normBarrio(need.barrio) === normBarrio(focus.barrio) : false,
  }));
  scored.sort((a, b) => (a.sameBarrio === b.sameBarrio ? 0 : a.sameBarrio ? -1 : 1));
  return scored.slice(0, MAX_PROMPT_NEEDS).map((entry) => entry.need);
}

/** Instrucciones del sistema para CaliSolidaria IA (FEAT-07: contexto real). */
export function buildSystemInstruction(focus: PromptFocus): string {
  const points = selectPointsForPrompt(focus).map((point) => pointCard(point, focus));
  const needs = selectNeedsForPrompt(focus).map((need) => ({
    title: need.title,
    barrio: need.barrio,
    status: need.status,
    urgency: need.urgency,
    items: need.items,
    contactPhone: need.contactPhone,
  }));

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
- Cuando el usuario pregunte por recursos cerca, revisa la lista de puntos proporcionada y destaca los más cercanos a su ubicación (${focus.barrio || 'Cali general'}): si un punto trae "distanceKm", menciona esa distancia.
- Si el usuario comparte una necesidad de emergencia vital o riesgo inminente, recuerda siempre las líneas de emergencia oficiales de Cali:
  * Emergencias Cali: 123
  * Cruz Roja Seccional Valle: 132 / (602) 518 4200
  * Bomberos Cali: 119 / (602) 660 1111
  * Defensa Civil Valle: 144
  * Centro Regulador de Urgencias CRUE Valle: 125 / (602) 620 6819
  * Unidad Municipal de Asistencia Técnica Agropecuaria y Zoonosis: (602) 441 1525
- Presenta nombres, teléfonos y direcciones exactas con viñetas limpias sin formato recargado.
- Nunca inventes datos: si no hay información suficiente, indícalo y sugiere verificar con los contactos listados.

PUNTOS CERCA DEL USUARIO (ordenados por proximidad cuando hay coordenadas):
${JSON.stringify(points, null, 2)}

NECESIDADES ACTIVAS DEL TABLÓN:
${JSON.stringify(needs, null, 2)}`;
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

  const { message, barrio, coords, history } = parsed.value;

  // Contexto al día ANTES de armar las instrucciones: sin este paso el
  // asistente anunciaría la semilla (3 necesidades, 5 puntos) aunque la BD
  // tenga datos reales o esté recién poblada (P1 de la T12).
  await ensureContextFresh();

  const systemInstruction = buildSystemInstruction({ barrio, coords });

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

  // Respaldo local (T5): una única copia en `server/chatFallback.ts`, con
  // `source: 'local'` para que el cliente sepa que no fue Gemini.
  return { status: 200, body: { reply: localReply(message), source: 'local' as const } };
};
