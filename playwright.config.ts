import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: {
    reducedMotion: 'reduce', // star field holds still: software GL in CI would otherwise starve the frame loop
    baseURL: 'http://localhost:4173',
    // PW_CHROMIUM_PATH lets you reuse an already installed Chromium.
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: { command: 'npm run build && npm run preview', port: 4173, timeout: 180_000, reuseExistingServer: true },
});
