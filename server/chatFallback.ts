/**
 * Respaldo local del asistente (T5 · FAL-10).
 *
 * Antes esta lógica vivía duplicada en `server/handlers/chat.ts` como
 * `buildLocalReply` y en el cliente (`src/services/geminiService.ts`), con
 * timeouts distintos (30 s vs 15 s) y resultados distintos para la misma
 * pregunta. Desde T5/T14 hay **una sola copia**: la API la sirve con
 * `source: 'local'` y el cliente muestra literalmente ese texto; si la API
 * no responde, el cliente avisa en lugar de inventar una respuesta.
 *
 * No hace llamadas de red: responde con lo que haya en la caché de datos
 * (`memory.points` / `memory.needs`, ya refrescados por `server/context.ts`).
 */
import { memory } from './store.js';
import type { HelpNeed, HelpPoint } from '../src/types/index.js';

/** Datos con los que se arma la respuesta (por defecto, la caché actual). */
export interface LocalReplyData {
  points?: readonly HelpPoint[];
  needs?: readonly HelpNeed[];
  barrio?: string;
  locationProvided?: boolean;
  coordinatesProvided?: boolean;
  distanceByPointId?: ReadonlyMap<string, number>;
}

function pointDistance(point: HelpPoint, data: LocalReplyData): string {
  const distance = data.distanceByPointId?.get(point.id);
  return distance === undefined ? '' : ` · aprox. ${distance.toFixed(1)} km en línea recta`;
}

function pointAvailability(point: HelpPoint): string {
  return point.status === 'alta_demanda' ? ' · alta demanda' : '';
}

function noPointsMessage(category: string, data: LocalReplyData): string {
  const scope = data.coordinatesProvided
    ? ' en un radio de 25 km'
    : data.barrio
      ? ` en ${data.barrio} (filtro declarado)`
      : data.locationProvided
        ? ' en el área indicada'
        : ' en el directorio';
  return `No encontré puntos verificados y disponibles de ${category}${scope}. Si es una emergencia, llama al 123.`;
}

/**
 * Respuesta de directorio cuando Gemini no está configurado o no responde.
 *
 * Elige la rama por palabras clave de la pregunta y lista los puntos
 * reales de esa categoría con sus datos de contacto.
 */
export function localReply(message: string, data: LocalReplyData = {}): string {
  const points = (data.points ?? memory.points).filter(
    (point) => point.verified && point.status !== 'cerrado' && !point.pending,
  );
  const needs = (data.needs ?? memory.needs).filter(
    (need) => need.status === 'activa' || need.status === 'en_proceso',
  );
  const query = message.toLowerCase();

  if (['veterinaria', 'perro', 'gato', 'mascota', 'animal'].some((kw) => query.includes(kw))) {
    const vets = points.filter((p) => p.category === 'veterinaria');
    if (vets.length === 0) return noPointsMessage('atención veterinaria', data);
    return (
      `🐾 **Puntos verificados de atención veterinaria:**\n\n` +
      vets
        .map((v) => `• **${v.name}** (${v.barrio})${pointDistance(v, data)}${pointAvailability(v)}\n  📍 ${v.address}\n  📞 ${v.phone} | Contacto: ${v.contactPerson}\n  ⏰ ${v.schedule}`)
        .join('\n\n') +
      `\n\nPara urgencias de fauna silvestre o Zoonosis Cali comunícate al (602) 441 1525.`
    );
  }

  if (['acopio', 'donar', 'camion', 'comida', 'víveres'].some((kw) => query.includes(kw))) {
    const acopios = points.filter((p) => p.category === 'acopio');
    if (acopios.length === 0) return noPointsMessage('centros de acopio', data);
    return (
      `🚚 **Puntos verificados de acopio y recolección:**\n\n` +
      acopios
        .map((a) => `• **${a.name}** (${a.barrio})${pointDistance(a, data)}${pointAvailability(a)}\n  📍 ${a.address}\n  📞 ${a.phone}\n  📦 Recibiendo: ${a.urgentItems.join(', ') || 'Consulta disponibilidad'}\n  ⏰ ${a.schedule}`)
        .join('\n\n') +
      `\n\nConfirma disponibilidad antes de desplazarte.`
    );
  }

  if (['albergue', 'refugio', 'dormir', 'hospedaje'].some((kw) => query.includes(kw))) {
    const albergues = points.filter((p) => p.category === 'albergue');
    if (albergues.length === 0) return noPointsMessage('albergues', data);
    return (
      `🏠 **Albergues verificados:**\n\n` +
      albergues
        .map((a) => `• **${a.name}** (${a.barrio})${pointDistance(a, data)}${pointAvailability(a)}\n  📍 ${a.address}\n  👥 Capacidad: ${a.capacity || 'Consulta directamente'}\n  ⏰ ${a.schedule}`)
        .join('\n\n') +
      `\n\nConfirma directamente la disponibilidad antes de desplazarte.`
    );
  }

  if (['salud', 'hospital', 'medico', 'herido', 'urgencia'].some((kw) => query.includes(kw))) {
    const salud = points.filter((p) => p.category === 'salud');
    const listed = salud.length
      ? salud
          .map((s) => `• **${s.name}** (${s.barrio})${pointDistance(s, data)}${pointAvailability(s)}\n  📍 ${s.address}\n  ⏰ Atención: ${s.schedule}`)
          .join('\n\n')
      : noPointsMessage('puntos de salud', data);
    return (
      `🏥 **Directorio de salud:**\n\n${listed}` +
      `\n\n🚨 **Líneas de emergencia:**\n• Emergencias: 123\n• CRUE Valle: 125\n• Cruz Roja Valle: 132`
    );
  }

  if (['registrar', 'nuevo', 'agregar', 'crear'].some((kw) => query.includes(kw))) {
    return `¡Claro! En AyudaEnCali puedes registrar un nuevo centro o necesidad de dos maneras:\n\n1. En la pestaña **Mapa**, presiona el botón **"+ Reportar Punto"** arriba a la derecha, o haz clic en la ubicación del mapa.\n2. En la pestaña **Tablón de Ayudas**, puedes publicar una necesidad urgente para que los voluntarios y centros la vean de inmediato.\n\n¿Deseas que te ayude a registrarlo ahora mismo? Cuéntame el nombre, barrio y tipo de ayuda.`;
  }

  if (['necesidad', 'necesidades', 'tablon', 'solicitud'].some((kw) => query.includes(kw))) {
    if (needs.length === 0) {
      return data.barrio
        ? `No hay necesidades activas del tablón que coincidan con ${data.barrio} en los datos disponibles.`
        : 'No hay necesidades activas del tablón en los datos disponibles.';
    }
    const heading = data.barrio
      ? `Necesidades activas reportadas en ${data.barrio} (coincidencia textual; sin geolocalización)`
      : 'Necesidades activas reportadas en Cali (sin geolocalización precisa)';
    return `${heading}:\n\n${needs
      .map((need) => `• **${need.title}** (${need.barrio}) — ${need.urgency}, ${need.status}. Requerido: ${need.items.join(', ') || 'consulta el reporte'}. Contacto reportado: ${need.contactPhone || 'no indicado'}. Verifica el reporte antes de enviar dinero o datos personales.`)
      .join('\n\n')}`;
  }

  const pointScope = data.coordinatesProvided
    ? ' cercanos por coordenadas aproximadas'
    : data.barrio
      ? ` en ${data.barrio} (filtro declarado)`
      : data.locationProvided
        ? ' en el área indicada'
        : ' del directorio';
  const pointSummary = points.slice(0, 5).length
    ? points
        .slice(0, 5)
        .map((point) => `• **${point.name}** (${point.barrio})${pointDistance(point, data)}${pointAvailability(point)} — ${point.category}`)
        .join('\n')
    : data.locationProvided
      ? `No encontré puntos verificados y disponibles${data.coordinatesProvided ? ' en un radio de 25 km' : data.barrio ? ` en ${data.barrio} (filtro declarado)` : ' en el área indicada'} en el directorio.`
      : 'Aún no hay puntos verificados y disponibles para mostrar.';
  const needSummary = needs.slice(0, 5).length
    ? needs
        .slice(0, 5)
        .map((need) => `• **${need.title}** (${need.barrio}) — ${need.urgency}, ${need.status}`)
        .join('\n')
    : 'No hay necesidades activas disponibles.';
  return (
    `Soy el asistente comunitario de **AyudaEnCali**.\n\n` +
    `**Puntos de ayuda${pointScope}:**\n${pointSummary}\n\n` +
    `**Necesidades activas${data.barrio ? ` en ${data.barrio}` : ' reportadas en Cali (sin geolocalización precisa)'}:**\n${needSummary}\n\n` +
    `Confirma horarios y disponibilidad directamente. Si se trata de una emergencia, llama al 123.`
  );
}
