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
}

/**
 * Respuesta de directorio cuando Gemini no está configurado o no responde.
 *
 * Elige la rama por palabras clave de la pregunta y lista los puntos
 * reales de esa categoría con sus datos de contacto.
 */
export function localReply(message: string, data: LocalReplyData = {}): string {
  const points = data.points ?? memory.points;
  const needs = data.needs ?? memory.needs;
  const query = message.toLowerCase();

  if (['veterinaria', 'perro', 'gato', 'mascota', 'animal'].some((kw) => query.includes(kw))) {
    const vets = points.filter((p) => p.category === 'veterinaria');
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
    const acopios = points.filter((p) => p.category === 'acopio');
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
    const albergues = points.filter((p) => p.category === 'albergue');
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
    const salud = points.filter((p) => p.category === 'salud');
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

  const pending = needs.filter((need) => need.status !== 'archivada').length;
  return (
    `¡Hola! Soy el asistente de **AyudaEnCali**. En este momento tenemos registrados **${points.length} puntos activos** y **${pending} necesidades** en diferentes comunas de Cali:\n\n` +
    `• 🚚 **Centros de Acopio y Camiones**: Recolección de víveres, agua y cobijas.\n` +
    `• 🐾 **Veterinarias y Refugios Animales**: Atención médica y rescate de mascotas.\n` +
    `• 🏠 **Albergues Temporales**: Alojamiento seguro para familias.\n` +
    `• 🏥 **Salud y Emergencias**: Hospitales (HUV, Imbanaco) y primeros auxilios.\n\n` +
    `Dime en qué barrio estás (ej. San Antonio, Granada, Siloé, Tequendama, Valle del Lili) o qué recurso necesitas para indicarte el más cercano.`
  );
}
