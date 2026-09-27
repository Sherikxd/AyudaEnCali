import { ChatMessage, ChatResponse, HelpPoint, UserCoordinates } from '../types';
import { apiFetch } from './api';
import { logger } from '../utils/logger';

export interface SendMessageParams {
  message: string;
  userLocation: UserCoordinates | null;
  /** Copia local de los puntos, usada solo por la respuesta de respaldo. */
  activePoints: HelpPoint[];
  conversationHistory: ChatMessage[];
}

/** Longitud máxima de la conversación enviada al servidor. */
const MAX_HISTORY = 8;

export async function sendChatMessage(params: SendMessageParams): Promise<string> {
  try {
    // El servidor responde con su propia copia de los datos: no hace falta
    // enviar el listado completo de puntos en cada mensaje.
    const data = await apiFetch<ChatResponse>('/api/chat', {
      method: 'POST',
      body: {
        message: params.message,
        userLocation: { barrio: params.userLocation?.barrio },
        conversationHistory: params.conversationHistory.slice(-MAX_HISTORY),
      },
      timeoutMs: 30_000,
    });

    if (!data.reply) throw new Error('Respuesta vacía del asistente');
    return data.reply;
  } catch (error) {
    logger.warn('El asistente no respondió desde el servidor, usando guion local:', error);
    return getLocalIntelligentFallback(params.message, params.activePoints);
  }
}

function getLocalIntelligentFallback(query: string, points: HelpPoint[]): string {
  const q = query.toLowerCase();

  if (q.includes('veterinaria') || q.includes('animal') || q.includes('perro') || q.includes('gato') || q.includes('mascota')) {
    const vets = points.filter((p) => p.category === 'veterinaria');
    return `🐾 **Centros de Atención Veterinaria y Refugio Animal en Cali:**\n\n` +
      vets.map((v) => `• **${v.name}** (${v.barrio})\n  📍 ${v.address}\n  📞 ${v.phone}\n  ℹ️ ${v.description}\n`).join('\n') +
      `\nLínea de Zoonosis y Bienestar Animal Cali: (602) 441 1525.`;
  }

  if (q.includes('acopio') || q.includes('donar') || q.includes('comida') || q.includes('víveres') || q.includes('camion')) {
    const acopios = points.filter((p) => p.category === 'acopio');
    return `🚚 **Centros de Acopio y Camiones de Recolección en Cali:**\n\n` +
      acopios.map((a) => `• **${a.name}** (${a.barrio})\n  📍 ${a.address}\n  📞 ${a.phone}\n  📦 Artículos urgentes: ${a.urgentItems.join(', ')}\n`).join('\n');
  }

  if (q.includes('albergue') || q.includes('refugio') || q.includes('dormir') || q.includes('techo')) {
    const shelters = points.filter((p) => p.category === 'albergue');
    return `🏠 **Albergues Temporales y Refugios en Cali:**\n\n` +
      shelters.map((s) => `• **${s.name}** (${s.barrio})\n  📍 ${s.address}\n  📞 ${s.phone}\n  👥 Capacidad: ${s.capacity || 'Disponible'}\n`).join('\n');
  }

  if (q.includes('salud') || q.includes('hospital') || q.includes('médic') || q.includes('herido') || q.includes('ambulancia')) {
    const salud = points.filter((p) => p.category === 'salud');
    return `🏥 **Centros de Salud y Hospitales en Cali:**\n\n` +
      salud.map((h) => `• **${h.name}** (${h.barrio})\n  📍 ${h.address}\n  📞 ${h.phone}\n  ⏰ ${h.schedule}\n`).join('\n') +
      `\n🚨 **Líneas de Emergencia Directas:**\n• Línea 123 (Policía / Emergencias)\n• Línea 132 (Cruz Roja Valle)\n• Línea 125 (CRUE Ambulancias)`;
  }

  return `Hola, soy el asistente de **AyudaEnCali**. Actualmente contamos con **${points.length} puntos activos** geolocalizados en el mapa de Cali.\n\n` +
    `Puedes consultarme sobre:\n` +
    `• 🐾 **Veterinarias y albergues de animales** (San Antonio, Granada, Ciudad Jardín)\n` +
    `• 🚚 **Centros de acopio y camiones de donación** (Las Banderas, Chipichape, Meléndez, Oriente)\n` +
    `• 🏠 **Albergues comunitarios** (San Bosco, Siloé)\n` +
    `• 🏥 **Centros hospitalarios y bancos de sangre** (HUV, Imbanaco, Cruz Roja)\n\n` +
    `¿En qué barrio te encuentras o qué recurso buscas?`;
}
