import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
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
        // Only the app shell is precached (~2 MB), so a new deploy installs in seconds even on a phone. Precaching all
        // ~45 MB of data made every update wait for the full download, and mobile browsers kept serving the old build.
        // Data, tiles and audio are cached as they are first used, so places you have visited still work offline.
        globPatterns: ['*.{html,svg,png}', 'assets/**/*.{js,css,woff2}'],
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
