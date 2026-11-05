import { build } from 'esbuild';
await build({
  entryPoints: ['server/index.ts', 'server/app.ts', 'server/worker.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  outdir: '.server-build',
  outExtension: { '.js': '.mjs' },
  sourcemap: true,
});
