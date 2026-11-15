import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { chat, tts } from './api/_groq';

/** The Vercel functions in api/ (Groq assistant), served by the dev and preview servers too. Key from .env. */
function api(): Plugin {
  const routes: Record<string, (r: Request) => Promise<Response>> = { '/api/chat': chat, '/api/tts': tts };
  const mount = (server: { middlewares: { use: (f: (req: import('http').IncomingMessage, res: import('http').ServerResponse, next: () => void) => void) => void } }) => {
    server.middlewares.use(async (req, res, next) => {
      const route = routes[req.url?.split('?')[0] ?? ''];
      if (!route || req.method !== 'POST') return next();
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const out = await route(new Request('http://local' + req.url, { method: 'POST', body: Buffer.concat(chunks), headers: { 'content-type': 'application/json', host: req.headers.host ?? '', ...(req.headers.origin ? { origin: req.headers.origin } : {}) } }));
      res.statusCode = out.status;
      out.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await out.arrayBuffer()));
    });
  };
  return {
    name: 'groq-api',
    config(_, { mode }) { Object.assign(process.env, loadEnv(mode, process.cwd(), '')); },
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

export default defineConfig({
  plugins: [
    api(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Feel the Earth',
        short_name: 'Feel the Earth',
        description: 'Listen to Earth data through a movable listening window.',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // App shell, all audio and the data layers are precached (~12 MB): sound never waits on the network and the
        // data works offline from the first visit. Map tiles and atlas images (~35 MB) are cached as they are first
        // used; precaching those too made every deploy wait for the full download, so phones kept the old build.
        globPatterns: ['*.{html,svg,png}', 'assets/**/*.{js,css,woff2}', 'audio/**/*.{mp3,json}', 'data/**/*.{bin,json,geojson}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [{
          urlPattern: ({ sameOrigin, url }) => sameOrigin && /\.(png|jpg|mp3|bin|json|geojson)$/.test(url.pathname),
          handler: 'StaleWhileRevalidate', // cached copy at once, refreshed in the background
          options: { cacheName: 'data', expiration: { maxEntries: 3000 } },
        }],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
