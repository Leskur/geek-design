import { defineConfig } from 'vite';

function normalizeBase(value: string | undefined) {
  if (!value || value === '/') return '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export default defineConfig({
  base: normalizeBase(process.env.VITE_BASE),
  server: { proxy: { '/api': { target: 'http://127.0.0.1:5174' } } },
  build: {
    rollupOptions: {
      output: { manualChunks: { 'vector-engine': ['paper'], archive: ['@zip.js/zip.js'] } },
    },
  },
});
