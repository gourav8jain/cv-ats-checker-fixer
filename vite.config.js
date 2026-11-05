import { defineConfig } from 'vite';

// base './' keeps asset paths relative so the same build works on GitHub Pages
// (served from /<repo>/) and inside the Capacitor iOS/Android web view.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020', chunkSizeWarningLimit: 1500 },
  server: { host: true },
});
