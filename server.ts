/**
 * Entrada de **local / Docker / Cloud Run** (y de `npm run dev`).
 *
 * Toda la API y la lógica compartida viven en `server/app.ts`, que es también
 * lo que empaqueta Vercel (`api/index.ts` la exporta como default). Este
 * fichero añade solo lo que tiene sentido en un proceso con `listen`:
 * Vite en desarrollo, los estáticos de `dist/` en producción, la 404 de
 * página y el apagado ordenado.
 *
 * ⚠️ `createViteServer` debe seguir importándose **aquí** y jamás en
 * `server/app.ts`: Vercel empaqueta ese módulo y no debe arrastrar `vite`
 * (peso del bundle y fallo de build).
 */
import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

import { errorHandler } from './server/middleware';
import { enableViteDevCsp } from './server/http';
import { errorMessage, logger } from './server/logger';
import { closeRedis } from './server/redis';
import { maybeVerifySchema } from './server/supabase';
import app from './server/app';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------- Assets estáticos / Vite ----------------------- */

async function startServer(): Promise<void> {
  // Verifica el esquema de Supabase antes de aceptar tráfico; el tope de 5 s
  // evita retrasar el arranque si la red falla.
  await Promise.race([maybeVerifySchema(true), sleep(5_000)]);

  if (!isProduction) {
    // En desarrollo Vite devuelve el shell para cualquier ruta; se interceptan
    // antes las rutas de página inexistentes para servir la misma 404 que en
    // producción. Los archivos y módulos pasan intactos (tienen extensión o
    // pertenecen a los prefijos de Vite: /@, /__ , /src, /node_modules).
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path === '/preguntas-frecuentes') {
        res.redirect(308, '/preguntas-frecuentes/');
        return;
      }
      if (req.path === '/preguntas-frecuentes/') return next();
      if (req.path === '/' || path.extname(req.path) !== '') return next();
      if (/^\/(@|__|api|src|node_modules|images)/.test(req.path)) return next();
      if (!req.accepts('html')) return next();
      res
        .status(404)
        .set('Cache-Control', 'no-cache, must-revalidate')
        .sendFile(path.join(__dirname, 'public', '404.html'));
    });

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    // T32: el shell que Vite sirve aquí lleva el `<script type="module">`
    // inline de react-refresh, que la CSP estricta de producción bloquearía.
    // Se relaja SOLO en este proceso (humo y producción siguen con la copia
    // textual de `vercel.json`; ver `relaxCspForViteDev` en `server/http.ts`).
    enableViteDevCsp();
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');

    app.get('/preguntas-frecuentes', (req, res, next) => {
      if (req.path !== '/preguntas-frecuentes') return next();
      res.redirect(308, '/preguntas-frecuentes/');
    });

    // Assets con hash en el nombre: un año de caché e inmutables (si el
    // contenido cambia, cambia el nombre del archivo).
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '365d' }),
    );

    // El resto (imágenes, favicon, 404.html): una semana. El HTML nunca se
    // cachea para que cada visita reciba el shell más reciente.
    app.use(
      express.static(distDir, {
        maxAge: '7d',
        setHeaders: (fileRes, filePath) => {
          if (filePath.endsWith('.html')) {
            fileRes.setHeader('Cache-Control', 'no-cache, must-revalidate');
          }
        },
      }),
    );

    app.get('/preguntas-frecuentes/', (_req, res) => {
      res
        .set('Cache-Control', 'no-cache, must-revalidate')
        .sendFile(path.join(distDir, 'index.html'));
    });

    // La app no tiene enrutador: toda URL distinta de «/» que no sea un archivo
    // es una página inexistente → 404 personalizada (no el shell de la SPA).
    app.get('*', (_req: Request, res: Response) => {
      res.status(404).set('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(distDir, '404.html'), (error) => {
        if (error && !res.headersSent) {
          res.status(404).type('text/plain').send('404 — página no encontrada');
        }
      });
    });
  }

  // `server/app.ts` ya registra el middleware de errores al final de la API;
  // este segundo registro cubre los estáticos y la 404, que se montan después.
  app.use(errorHandler);

  const server = app.listen(PORT, () => {
    logger.info(`AyudaEnCali escuchando en http://localhost:${PORT} (${isProduction ? 'producción' : 'desarrollo'})`);
  });

  // Cierre ordenado: permite que los despliegues (Cloud Run) terminen sin
  // cortar peticiones en curso.
  const shutdown = (signal: string) => {
    logger.info(`Se recibió ${signal}, cerrando el servidor...`);
    server.close(() => process.exit(0));
    // La conexión con Redis se suelta en paralelo: si tarda, el timeout de
    // abajo termina el proceso igualmente.
    void closeRedis();
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((error) => {
  logger.error('No se pudo iniciar el servidor:', errorMessage(error));
  process.exit(1);
});
