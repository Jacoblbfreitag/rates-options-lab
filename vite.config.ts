/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` must match the GitHub repo name so the site works on GitHub Pages
// (https://<user>.github.io/rates-options-lab/).
export default defineConfig({
  base: '/rates-options-lab/',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    // Plotly is big (~1.5 MB gzipped); keep it in its own cached chunk.
    chunkSizeWarningLimit: 6000,
    rollupOptions: { output: { manualChunks: { plotly: ['plotly.js-dist-min'] } } },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
