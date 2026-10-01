/**
 * App Express compartida por local, Docker y Cloud Run:
 *
 *  - `server.ts` → importa este módulo y añade Vite/estáticos + `app.listen`.
 *
 * Es solo el **adaptador Express** de los núcleos de ruta: el enrutado y el
 * parseo de cuerpos viven aquí, mientras que status y cuerpo los decide cada
 * núcleo de `server/handlers/*.ts` (framework-agnóstico). Las funciones de
 * Vercel (`api/*.ts`) usan esos mismos núcleos con su propio adaptador
 * (`server/vercel.ts`), de modo que ambas rutas de despliegue responden
 * idéntico.
 *
 * ⚠️ Aquí **no** puede aparecer `vite` (ni `express.static`): el bundler de
 * Vercel empaqueta la cadena de imports de las funciones `api/*.ts`, que
 * arrastra este fichero, y Vite pesa y fallaría en el build. `createViteServer`
 * vive por eso solo en `server.ts`, que Vercel no ejecuta.
 */
import './bootstrap.js'; // entorno primero: dotenv + initSupabase()
import express, { type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';

import { apiNotFound, errorHandler, securityHeaders } from './middleware.js';
import { clientIp, type ApiHandler, type ApiRequest } from './http.js';
import { healthHandler } from './handlers/health.js';
import { configHandler } from './handlers/config.js';
import { sqlHandler } from './handlers/sql.js';
import { pointsHandler } from './handlers/points.js';
import { needsHandler } from './handlers/needs.js';
import { needsSupportHandler } from './handlers/needsSupport.js';
import { supportMineHandler } from './handlers/supportMine.js';
import { commentsHandler } from './handlers/comments.js';
import { chatHandler } from './handlers/chat.js';

const isProduction = process.env.NODE_ENV === 'production';

const app = express();

app.disable('x-powered-by');
// Detrás de un proxy (Cloud Run / Vercel / Nginx) se necesita para conocer la
// IP real del cliente, que es la clave del limitador de tasa. Con `1` Express
// confía en **un solo salto**: `req.ip` devuelve la dirección que vio el
// proxy más próximo (la última de `X-Forwarded-For`), inalterable por quien
// hace la petición. Las plataformas declaran `NODE_ENV=production`, así que
// aquí se activa solo; en desarrollo `req.ip` es el socket y una cabecera
// `X-Forwarded-For` mandada a mano no cambia la clave (FAL-06).
if (isProduction) app.set('trust proxy', 1);

app.use(securityHeaders);
// Gzip para texto (JS/CSS/HTML/JSON): el bundle principal baja de ~400 kB a
// ~120 kB. Se coloca antes de rutas y estáticos para cubrir también la API.
// En Vercel se omite: el borde ya comprime y ahorraría CPU (el plan Hobby
// reparte 4 CPU-h de función al mes).
if (!process.env.VERCEL) app.use(compression());
app.use(express.json({ limit: '1mb' }));

/**
 * Traduce una petición de Express al `ApiRequest` de los núcleos.
 *
 * El router se monta en `/api`, así que `req.path` es relativo al montaje
 * (igual que en `apiNotFound`): de ahí los mensajes
 * `Ruta no encontrada: GET /points` y el id de `/needs/:id/support`.
 */
function toApiRequest(req: Request): ApiRequest {
  return {
    method: req.method,
    path: req.path,
    headers: req.headers,
    query: req.query,
    body: req.body,
    clientIp: clientIp(req),
  };
}

/**
 * Monta un núcleo de ruta en el router: Express resuelve enrutado, límite de
 * cuerpo y errores; el núcleo decide status y cuerpo. Si un núcleo asíncrono
 * rechaza, la promesa sube al `errorHandler` (500 sin stack trace), que es lo
 * que hacía `asyncHandler`.
 */
function mount(router: express.Router, route: string, core: ApiHandler): void {
  router.all(route, (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(core(toApiRequest(req), res))
      .then((result) => {
        // `result === null` → el núcleo ya respondió (401, 429, 400…).
        if (result && !res.headersSent) res.status(result.status).json(result.body);
      })
      .catch(next);
  });
}

const api = express.Router();

/* ------------------------------ Config / salud ---------------------------- */
mount(api, '/health', healthHandler);
mount(api, '/config', configHandler);
mount(api, '/supabase/sql', sqlHandler);

/* -------------------------- Puntos / necesidades -------------------------- */
mount(api, '/points', pointsHandler);
mount(api, '/needs', needsHandler);
mount(api, '/needs/:id/support', needsSupportHandler);
// Ciclo de vida (T2): `PATCH/DELETE /needs/:id` y `PUT/DELETE /points/:id`.
// Se registran tras la ruta más específica (`/needs/:id/support`) y el
// núcleo responde 404 con el mismo cuerpo para los métodos que no gestiona
// (p. ej. `GET /needs/:id`), de modo que la respuesta no cambia respecto a
// antes de montarlas. En Vercel llegan por los rewrites de `vercel.json`.
mount(api, '/needs/:id', needsHandler);
mount(api, '/points/:id', pointsHandler);
mount(api, '/support/mine', supportMineHandler);

/* ------------------------ Comentarios / asistente ------------------------- */
mount(api, '/comments', commentsHandler);
mount(api, '/chat', chatHandler);

app.use('/api', api);

/* ------------------------- 404 y manejo de errores ------------------------- */

app.use('/api', apiNotFound);

// Al **final** de la cadena: cualquier error que suba de las rutas acaba aquí
// y nunca se filtra un stack trace al cliente. (`server.ts` vuelve a
// registrarla tras los estáticos, que se montan después.)
app.use(errorHandler);

// Entrada de `server.ts` (local/Docker/Cloud Run). El nombre también se
// exporta para que `server.ts` pueda tiparlo sin `any`.
export { app };
export default app;
