import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { apiNotFound, asyncHandler, errorHandler, securityHeaders } from './server/middleware';
import { createRateLimiter } from './server/rateLimit';
import { errorMessage, logger } from './server/logger';
import { getAuthenticatedUser, respondUnauthorized } from './server/auth';
import { INITIAL_COMMENTS, INITIAL_HELP_NEEDS, INITIAL_HELP_POINTS } from './server/seedData';
import { SUPABASE_SQL } from './server/schema';
import {
  getSupabaseClient,
  getSupabaseStatus,
  initSupabase,
  mapNeedRow,
  mapPointRow,
  maybeVerifySchema,
  toNeedRow,
  toPointRow,
  withSupabaseRetry,
} from './server/supabase';
import type { HelpNeedRow, HelpPointRow } from './server/supabase';
import {
  LIMITS,
  sanitizeParam,
  validateChat,
  validateComment,
  validateNeed,
  validatePoint,
} from './server/validation';
import type {
  ChatResponse,
  ConfigResponse,
  HelpNeed,
  HelpPoint,
  MySupportsResponse,
  PointComment,
  SupportAction,
  SupportResponse,
} from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

/** Tope de elementos que se mantienen en memoria como caché de respaldo. */
const MAX_CACHED_ITEMS = 500;

/* -------------------------------------------------------------------------- */
/* Clientes externos (solo desde variables de entorno)                         */
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
initSupabase();

/* -------------------------------------------------------------------------- */
/* Caché en memoria (respaldo si Supabase no responde)                         */
/* -------------------------------------------------------------------------- */

let memoryPoints: HelpPoint[] = [...INITIAL_HELP_POINTS];
let memoryNeeds: HelpNeed[] = [...INITIAL_HELP_NEEDS];
let memoryComments: PointComment[] = [...INITIAL_COMMENTS];

/**
 * Apoyos ("likes") por necesidad en memoria: `needId -> conjunto de userId`.
 *
 * Es el espejo local de la tabla `need_supporters` y respalda los casos en
 * los que Supabase no está disponible. Sin base de datos solo existe en este
 * proceso (se pierde al reiniciar, igual que el resto de la caché).
 */
const memoryNeedSupporters = new Map<string, Set<string>>();

function getSupporterSet(needId: string): Set<string> {
  let set = memoryNeedSupporters.get(needId);
  if (!set) {
    set = new Set();
    memoryNeedSupporters.set(needId, set);
  }
  return set;
}

function pushInCache<T>(list: T[], item: T): T[] {
  return [item, ...list].slice(0, MAX_CACHED_ITEMS);
}

/* -------------------------------------------------------------------------- */
/* App                                                                         */
/* -------------------------------------------------------------------------- */

const app = express();

app.disable('x-powered-by');
// Detrás de un proxy (Cloud Run / Nginx) se necesita para conocer la IP real
// del cliente, que es la clave del limitador de tasa.
if (isProduction) app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));

const writeLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  message: 'Demasiadas escrituras, espera un minuto antes de volver a intentar.',
});

const chatLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 15,
  message: 'Has hecho muchas preguntas seguidas. Espera unos segundos antes de continuar.',
});

/* ------------------------------ Config / salud ---------------------------- */

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/config', async (_req: Request, res: Response) => {
  await maybeVerifySchema();

  const supabaseState = getSupabaseStatus();
  const config: ConfigResponse = {
    status: 'ok',
    appName: 'AyudaEnCali',
    supabaseConnected: supabaseState.configured,
    supabaseUrl: supabaseState.host,
    supabaseTablesReady: supabaseState.tablesReady,
    supabaseHint: supabaseState.hint,
    cartoConfigured: Boolean(process.env.CARTO_API_KEY),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    // Clave pública de Clerk: se lee aquí en **tiempo de ejecución** para que
    // baste con definirla en el entorno del despliegue (Cloud Run, Vercel…),
    // sin recompilar el bundle. Es pública por diseño (viaja al navegador);
    // la secreta (CLERK_SECRET_KEY) jamás sale del servidor.
    clerkPublishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || null,
    time: new Date().toISOString(),
  };
  res.json(config);
});

app.get('/api/supabase/sql', (_req: Request, res: Response) => {
  res.json({ sql: SUPABASE_SQL });
});

/* --------------------------------- Puntos --------------------------------- */

app.get(
  '/api/points',
  asyncHandler(async (_req: Request, res: Response) => {
    await maybeVerifySchema();
    const client = getSupabaseClient();

    if (client) {
      const { data, error } = await withSupabaseRetry<HelpPointRow[]>('Supabase help_points', () =>
        client.from('help_points').select('*').order('created_at', { ascending: false }),
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        const points = data.map(mapPointRow);
        memoryPoints = points;
        res.json({ points, source: 'supabase' });
        return;
      }
    }

    res.json({ points: memoryPoints, source: 'memory_cache' });
  }),
);

app.post(
  '/api/points',
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = validatePoint(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'Datos de punto inválidos.', details: parsed.errors });
      return;
    }

    const now = new Date().toISOString();
    const point: HelpPoint = {
      ...parsed.value,
      id: parsed.value.id ?? `cali-point-${Date.now()}`,
      verified: true,
      createdAt: now,
      updatedAt: now,
    };

    memoryPoints = pushInCache(memoryPoints, point);

    await maybeVerifySchema();
    const client = getSupabaseClient();
    if (client) {
      await withSupabaseRetry('Supabase insert help_points', () =>
        client.from('help_points').insert([toPointRow(point)]),
      );
    }

    res.status(201).json({ point });
  }),
);

/* -------------------------------- Necesidades ----------------------------- */

app.get(
  '/api/needs',
  asyncHandler(async (_req: Request, res: Response) => {
    await maybeVerifySchema();
    const client = getSupabaseClient();

    if (client) {
      const { data, error } = await withSupabaseRetry<HelpNeedRow[]>('Supabase help_needs', () =>
        client.from('help_needs').select('*').order('created_at', { ascending: false }),
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        const needs = data.map(mapNeedRow);
        memoryNeeds = needs;
        res.json({ needs, source: 'supabase' });
        return;
      }
    }

    res.json({ needs: memoryNeeds, source: 'memory_cache' });
  }),
);

app.post(
  '/api/needs',
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = validateNeed(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'Datos de necesidad inválidos.', details: parsed.errors });
      return;
    }

    const need: HelpNeed = {
      ...parsed.value,
      id: parsed.value.id ?? `cali-need-${Date.now()}`,
      status: 'activa',
      supportersCount: 1,
      createdAt: new Date().toISOString(),
    };

    memoryNeeds = pushInCache(memoryNeeds, need);

    await maybeVerifySchema();
    const client = getSupabaseClient();
    if (client) {
      await withSupabaseRetry('Supabase insert help_needs', () =>
        client.from('help_needs').insert([toNeedRow(need)]),
      );
    }

    res.status(201).json({ need });
  }),
);

/** Acciones aceptadas por `POST /api/needs/:id/support`. */
const SUPPORT_ACTIONS: ReadonlySet<string> = new Set<string>(['add', 'remove']);

/**
 * Apoyos de la cuenta que hace la petición (el "corazón relleno" del tablón).
 * Exige sesión de Clerk verificada: responde 401 en caso contrario.
 */
app.get(
  '/api/support/mine',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      respondUnauthorized(res, 'Debes iniciar sesión para ver tus apoyos.');
      return;
    }

    const needIds = new Set<string>();

    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await withSupabaseRetry<{ need_id: string }[]>(
        'Supabase select need_supporters',
        () =>
          client
            .from('need_supporters')
            .select('need_id')
            .eq('user_id', user.userId)
            .limit(500),
      );
      if (!error && Array.isArray(data)) {
        for (const row of data) needIds.add(row.need_id);
      }
    }

    // Añade los apoyos que solo viven en memoria (sin BD o tabla sin crear).
    for (const [needId, supporters] of memoryNeedSupporters) {
      if (supporters.has(user.userId)) needIds.add(needId);
    }

    const payload: MySupportsResponse = { needIds: [...needIds] };
    res.json(payload);
  }),
);

/**
 * Apoyar (like) o retirar el apoyo de una necesidad.
 *
 * Reglas de la dinámica:
 *  - Solo quien tiene **cuenta** puede apoyar (token de Clerk verificado
 *    criptográficamente en el servidor: `401` sin sesión).
 *  - Un usuario = un apoyo por necesidad: repetir `add` es idempotente y
 *    `remove` retira el apoyo sin dejar el contador en negativo.
 *  - La fuente de verdad es `need_supporters` (PK compuesta `need_id,user_id`);
 *    `supporters_count` solo cambia cuando se inserta o borra una fila.
 */
app.post(
  '/api/needs/:id/support',
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      respondUnauthorized(res, 'Debes iniciar sesión para apoyar una necesidad.');
      return;
    }

    const body = (req.body ?? {}) as { action?: unknown };
    const action = typeof body.action === 'string' && SUPPORT_ACTIONS.has(body.action)
      ? (body.action as SupportAction)
      : null;
    if (!action) {
      res.status(400).json({ error: 'Acción no válida: usa "add" o "remove".', details: ['action'] });
      return;
    }
    const wantAdd = action === 'add';

    const id = sanitizeParam(req.params.id);
    let need = memoryNeeds.find((item) => item.id === id);

    // La caché local puede estar desactualizada: preguntamos a la base.
    if (!need) {
      const client = getSupabaseClient();
      if (client) {
        const { data, error } = await withSupabaseRetry<HelpNeedRow[]>('Supabase select help_needs', () =>
          client.from('help_needs').select('*').eq('id', id).limit(1),
        );
        if (!error && Array.isArray(data) && data[0]) {
          need = mapNeedRow(data[0]);
          memoryNeeds = pushInCache(memoryNeeds, need);
        }
      }
    }

    if (!need) {
      res.status(404).json({ error: 'Necesidad no encontrada.' });
      return;
    }

    const target: HelpNeed = need;
    const supporters = getSupporterSet(target.id);
    const client = getSupabaseClient();

    let handledInDb = false;
    let delta = 0;

    if (client) {
      if (wantAdd) {
        // `ignoreDuplicates` sobre la PK (need_id, user_id): insertar dos
        // veces no crea filas duplicadas ni vuelve a sumar el contador.
        const { data, error } = await withSupabaseRetry<{ need_id: string }[]>(
          'Supabase insert need_supporters',
          () =>
            client
              .from('need_supporters')
              .upsert(
                { need_id: target.id, user_id: user.userId },
                { onConflict: 'need_id,user_id', ignoreDuplicates: true },
              )
              .select('need_id'),
        );
        if (!error) {
          handledInDb = true;
          supporters.add(user.userId);
          if (Array.isArray(data) && data.length > 0) delta = 1;
        }
      } else {
        const { data, error } = await withSupabaseRetry<{ need_id: string }[]>(
          'Supabase delete need_supporters',
          () =>
            client
              .from('need_supporters')
              .delete()
              .eq('need_id', target.id)
              .eq('user_id', user.userId)
              .select('need_id'),
        );
        if (!error) {
          handledInDb = true;
          supporters.delete(user.userId);
          if (Array.isArray(data) && data.length > 0) delta = -1;
        }
      }

      if (handledInDb && delta !== 0) {
        target.supportersCount = Math.max(0, target.supportersCount + delta);
        await withSupabaseRetry('Supabase update help_needs', () =>
          client.from('help_needs').update({ supporters_count: target.supportersCount }).eq('id', id),
        );
      }
    }

    if (!handledInDb) {
      // Sin base de datos (o `need_supporters` aún sin crear): toggle local
      // idempotente, el mismo comportamiento que con la tabla disponible.
      if (wantAdd && !supporters.has(user.userId)) {
        supporters.add(user.userId);
        target.supportersCount += 1;
      } else if (!wantAdd && supporters.has(user.userId)) {
        supporters.delete(user.userId);
        target.supportersCount = Math.max(0, target.supportersCount - 1);
      }
    }

    const payload: SupportResponse = {
      success: true,
      count: target.supportersCount,
      supported: supporters.has(user.userId),
    };
    res.json(payload);
  }),
);

/* -------------------------------- Comentarios ----------------------------- */

app.get('/api/comments', (req: Request, res: Response) => {
  const pointId = typeof req.query.pointId === 'string' ? sanitizeParam(req.query.pointId) : '';
  const comments = pointId ? memoryComments.filter((c) => c.pointId === pointId) : memoryComments;
  res.json({ comments });
});

app.post(
  '/api/comments',
  writeLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = validateComment(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'Comentario inválido.', details: parsed.errors });
      return;
    }

    const comment: PointComment = {
      id: `comm-${Date.now()}`,
      ...parsed.value,
      createdAt: new Date().toISOString(),
    };

    memoryComments = pushInCache(memoryComments, comment);
    res.status(201).json({ comment });
  }),
);

/* ---------------------------------- Chat ---------------------------------- */

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
${JSON.stringify(memoryPoints.slice(0, 20), null, 2)}

NECESIDADES URGENTES ACTIVAS:
${JSON.stringify(memoryNeeds.slice(0, 15), null, 2)}`;
}

/** Respuesta local cuando Gemini no está disponible o falla. */
function buildLocalReply(message: string): string {
  const query = message.toLowerCase();

  if (['veterinaria', 'perro', 'gato', 'mascota', 'animal'].some((kw) => query.includes(kw))) {
    const vets = memoryPoints.filter((p) => p.category === 'veterinaria');
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
    const acopios = memoryPoints.filter((p) => p.category === 'acopio');
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
    const albergues = memoryPoints.filter((p) => p.category === 'albergue');
    return (
      `🏠 **Albergues y Refugios Comunitarios en Cali:**\n\n` +
      albergues
        .map(
          (a) =>
            `• **${a.name}** (${a.barrio})\n  📍 ${a.address}\n  📞 ${a.phone}\n  👥 Capacidad disponible: ${a.capacity || 'Consulta directa'}\n  ℹ️ ${a.description}\n`,
        )
        .join('\n')
    );
  }

  if (['salud', 'hospital', 'medico', 'herido', 'urgencia'].some((kw) => query.includes(kw))) {
    const salud = memoryPoints.filter((p) => p.category === 'salud');
    return (
      `🏥 **Puntos de Emergencia Médica y Salud en Cali:**\n\n` +
      salud
        .map(
          (s) =>
            `• **${s.name}** (${s.barrio})\n  📍 ${s.address}\n  📞 ${s.phone}\n  ⏰ Atención: ${s.schedule}\n`,
        )
        .join('\n') +
      `\n🚨 **Líneas Vitales de Cali:**\n• Línea de Emergencia: 123\n• Ambulancias CRUE Valle: 125\n• Cruz Roja Valle: 132`
    );
  }

  if (['registrar', 'nuevo', 'agregar', 'crear'].some((kw) => query.includes(kw))) {
    return `¡Claro! En AyudaEnCali puedes registrar un nuevo centro o necesidad de dos maneras:\n\n1. En la pestaña **Mapa**, presiona el botón **"+ Reportar Punto"** arriba a la derecha, o haz clic en la ubicación del mapa.\n2. En la pestaña **Tablón de Ayudas**, puedes publicar una necesidad urgente para que los voluntarios y centros la vean de inmediato.\n\n¿Deseas que te ayude a registrarlo ahora mismo? Cuéntame el nombre, barrio y tipo de ayuda.`;
  }

  return (
    `¡Hola! Soy el asistente de **AyudaEnCali**. En este momento tenemos registrados **${memoryPoints.length} puntos activos** en diferentes comunas de Cali:\n\n` +
    `• 🚚 **Centros de Acopio y Camiones**: Recolección de víveres, agua y cobijas.\n` +
    `• 🐾 **Veterinarias y Refugios Animales**: Atención médica y rescate de mascotas.\n` +
    `• 🏠 **Albergues Temporales**: Alojamiento seguro para familias.\n` +
    `• 🏥 **Salud y Emergencias**: Hospitales (HUV, Imbanaco) y primeros auxilios.\n\n` +
    `Dime en qué barrio estás (ej. San Antonio, Granada, Siloé, Tequendama, Valle del Lili) o qué recurso necesitas para indicarte el más cercano.`
  );
}

app.post(
  '/api/chat',
  chatLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = validateChat(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'Mensaje inválido.', details: parsed.errors });
      return;
    }

    const { message, barrio, history } = parsed.value;
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
      res.json(payload);
      return;
    }

    res.json({ reply: buildLocalReply(message) });
  }),
);

/* ------------------------- 404 y manejo de errores ------------------------- */

app.use('/api', apiNotFound);

/* -------------------------- Assets estáticos / Vite ----------------------- */

async function startServer(): Promise<void> {
  // Verifica el esquema de Supabase antes de aceptar tráfico; el tope de 5 s
  // evita retrasar el arranque si la red falla.
  await Promise.race([maybeVerifySchema(true), sleep(5_000)]);

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(errorHandler);

  const server = app.listen(PORT, () => {
    logger.info(`AyudaEnCali escuchando en http://localhost:${PORT} (${isProduction ? 'producción' : 'desarrollo'})`);
  });

  // Cierre ordenado: permite que los despliegues (Cloud Run) terminen sin
  // cortar peticiones en curso.
  const shutdown = (signal: string) => {
    logger.info(`Se recibió ${signal}, cerrando el servidor...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((error) => {
  logger.error('No se pudo iniciar el servidor:', errorMessage(error));
  process.exit(1);
});
