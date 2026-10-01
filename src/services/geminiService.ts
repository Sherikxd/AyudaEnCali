import { ChatMessage, ChatResponse, UserCoordinates } from '../types';
import { apiFetch } from './api';

export interface SendMessageParams {
  message: string;
  userLocation: UserCoordinates | null;
  conversationHistory: ChatMessage[];
}

/** Longitud máxima de la conversación enviada al servidor. */
const MAX_HISTORY = 8;

/**
 * Consulta al asistente (`POST /api/chat`).
 *
 * **Un solo fallback (T14 · FAL-10):** el que decide la respuesta local es
 * el servidor (`source: 'local'` en `server/chatFallback.ts`); este módulo
 * solo la reenvía. Si la API no contesta se propaga el error y
 * `ChatView` avisa con un aviso visible: aquí ya no se inventa texto.
 *
 * El timeout es el del cliente por defecto (15 s, `src/services/api.ts`):
 * antes había un segundo timeout de 30 s que no coincidía con el del
 * servidor y dejaba la petición colgada el doble de tiempo.
 */
export async function sendChatMessage(params: SendMessageParams): Promise<string> {
  const data = await apiFetch<ChatResponse>('/api/chat', {
    method: 'POST',
    body: {
      message: params.message,
      // Coordenadas reales si las hay: el servidor ordena por proximidad
      // (FEAT-07) y solo usa el barrio como filtro de respaldo.
      userLocation: {
        barrio: params.userLocation?.barrio,
        lat: params.userLocation?.lat,
        lng: params.userLocation?.lng,
      },
      conversationHistory: params.conversationHistory.slice(-MAX_HISTORY),
    },
  });

  if (!data.reply) throw new Error('Respuesta vacía del asistente');
  return data.reply;
}
