import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const testFiles = (await readdir('tests')).filter((name) => /\.test\.tsx?$/.test(name)).sort();
if (!testFiles.length) throw new Error('No test files found');

await import('./build-server.mjs');
await build({
  entryPoints: testFiles.map((name) => path.join('tests', name)),
  bundle: true,
  loader: { '.svg': 'dataurl' },
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outdir: '.test-output',
  outExtension: { '.js': '.mjs' },
});
await copyFile('.server-build/worker.mjs', '.test-output/worker.mjs');
const result = spawnSync(
  process.execPath,
  [
    '--test',
    ...testFiles.map((name) => path.join('.test-output', name.replace(/\.tsx?$/, '.mjs'))),
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
