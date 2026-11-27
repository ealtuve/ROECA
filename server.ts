import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchOfficialBcvRate } from './src/server/bcvService.ts';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const distPath = path.join(__dirname, 'dist');
  const hasDistBuild = fs.existsSync(path.join(distPath, 'index.html'));
  const isDevScript = process.env.npm_lifecycle_event === 'dev';
  const isProd =
    !isDevScript &&
    hasDistBuild &&
    (process.env.NODE_ENV === 'production' ||
      Boolean(process.env.K_SERVICE) ||
      process.env.npm_lifecycle_event === 'start');

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Stateless CORS-free proxy for live BCV official exchange rate
  app.get('/api/bcv-live', async (_req, res) => {
    try {
      const data = await fetchOfficialBcvRate();
      if (!data) {
        return res.status(503).json({
          success: false,
          error: 'No se pudo consultar el servicio externo del BCV en este momento.',
        });
      }
      return res.json({ success: true, ...data });
    } catch {
      return res.status(500).json({
        success: false,
        error: 'Error al consultar la tasa BCV.',
      });
    }
  });

  if (!isProd) {
    // In dev mode, flush any previously registered SW so preview always loads fresh UI edits
    app.get('/sw.js', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.send(
        `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});`
      );
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(distPath, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('sw.js') || filePath.endsWith('index.html') || filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Distribuidora ROECA server running on http://0.0.0.0:${PORT} (mode=${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
