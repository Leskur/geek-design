import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  .version as string;

function normalizeBase(value: string | undefined) {
  if (!value || value === '/') return '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export default defineConfig({
  base: normalizeBase(process.env.VITE_BASE),
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:5174' } },
    watch: { ignored: ['**/data/**', '**/.server-build/**'] },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: { 'vector-engine': ['paper'], archive: ['@zip.js/zip.js'] } },
    },
  },
});
