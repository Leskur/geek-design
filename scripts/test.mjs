import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

async function emptyDirectory(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

async function removeDataDirectories() {
  let entries;
  try {
    entries = await readdir('.test-output', { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => rm(path.join('.test-output', entry.name), { recursive: true, force: true })),
  );
}

const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const testFiles = (await readdir('tests')).filter((name) => /\.test\.tsx?$/.test(name)).sort();
if (!testFiles.length) throw new Error('No test files found');

await emptyDirectory('.test-output');
await import('./build-server.mjs');
await build({
  entryPoints: testFiles.map((name) => path.join('tests', name)),
  bundle: true,
  loader: { '.svg': 'dataurl' },
  platform: 'node',
  format: 'esm',
  packages: 'external',
  define: { __APP_VERSION__: JSON.stringify(version) },
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
await removeDataDirectories();
process.exitCode = result.status ?? 1;
