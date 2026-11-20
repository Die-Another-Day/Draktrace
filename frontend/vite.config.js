import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import inlineEverything from './vite-inline-plugin.js';
// npm run build        -> dist/
// npm run build:single -> dist-single/index.html (everything in ONE file)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'single' ? [inlineEverything()] : [])],
  server: { port: 5173, open: true, host: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.{js,jsx}'], globals: true, restoreMocks: true },
  build: { chunkSizeWarningLimit: 650, ...(mode === 'single' ? { outDir: 'dist-single' } : {}) },
}));
