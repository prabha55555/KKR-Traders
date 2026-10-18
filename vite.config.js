import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { checkFirebaseEnv } from './scripts/firebaseEnvCheck.mjs';

const THEME_COLOR = '#0c1022';

/**
 * Prints which Firebase project a build / dev server talks to: every customer's build must show ITS OWN project
 * (set VITE_FIREBASE_* in `.env.<customer>.local` and build with `--mode <customer>`; see docs/NEW_CUSTOMER_SETUP.md).
 * Fails the build when a customer mode has no (or only partial) VITE_FIREBASE_* settings.
 */
function firebaseProjectNotice() {
  return {
    name: 'firebase-project-notice',
    configResolved(config) {
      const project = checkFirebaseEnv(config.mode, config.env);
      config.logger.info(`  Firebase project: ${project}`);
    },
  };
}

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    firebaseProjectNotice(),
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': a new version waits until the user taps "Update" (src/app/UpdatePrompt.jsx),
      // so a half-typed bill is never lost to a surprise reload.
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo192.png', 'logo512.png'],
      manifest: {
        id: '/',
        name: 'Brightlight Billing',
        short_name: 'Brightlight',
        description:
          'Brightlight Billing — premium sales, purchase, stock and expense management by Brightlight Solutions',
        lang: 'en-IN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: THEME_COLOR,
        categories: ['business', 'finance', 'productivity'],
        icons: [
          { src: '/logo192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/logo512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/logo512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'New Sales Bill',
            short_name: 'Sales Bill',
            url: '/sales/bill',
            icons: [{ src: '/logo192.png', sizes: '192x192' }],
          },
          {
            name: 'New Purchase Bill',
            short_name: 'Purchase Bill',
            url: '/purchase/bill',
            icons: [{ src: '/logo192.png', sizes: '192x192' }],
          },
          {
            name: 'Overview',
            short_name: 'Overview',
            url: '/overview/revenue',
            icons: [{ src: '/logo192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        // The app shell is precached so the PWA opens offline; Firestore data comes from its own IndexedDB cache.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,webmanifest,woff2}'],
        // jsPDF's optional chunks (its own html2canvas, canvg `index.es`, DOMPurify) load only for doc.html() / SVG,
        // which the app never calls (platform/pdf.js renders with html2canvas-pro + addImage): not worth precaching.
        globIgnores: [
          '**/assets/html2canvas-!(pro)*.js',
          '**/assets/index.es-*.js',
          '**/assets/purify.es-*.js',
        ],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: true, port: 5173 },
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Firebase is the heaviest dependency: its own long-cached chunk keeps app updates small.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\/](@firebase|firebase)[\/]/ },
            { name: 'react', test: /node_modules[\/](react|react-dom|react-router|scheduler)[\/]/ },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
});
