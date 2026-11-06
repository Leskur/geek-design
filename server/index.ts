import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app';
import { byteLimit } from './bytes';
import { acquireDataDirLock } from './lock';
const dataDir = path.resolve(process.env.SKETCHPEEK_DATA_DIR || 'data');
const lock = acquireDataDirLock(dataDir);
let shuttingDown = false;
try {
  const { app } = await createApp({
    dataDir,
    logger: true,
    publicOrigin: process.env.SKETCHPEEK_PUBLIC_ORIGIN,
    staticDir: path.resolve('dist'),
    maxFileSize: byteLimit('SKETCHPEEK_MAX_FILE_SIZE', process.env.SKETCHPEEK_MAX_FILE_SIZE),
  });
  async function stop() {
    if (shuttingDown) return;
    shuttingDown = true;
    await app.close();
    lock.release();
  }
  process.on('SIGINT', () => {
    void stop();
  });
  process.on('SIGTERM', () => {
    void stop();
  });
  await app.listen({
    host: process.env.SKETCHPEEK_HOST || '127.0.0.1',
    port: Number(process.env.SKETCHPEEK_PORT || 5174),
  });
  console.log(`SketchPeek 数据目录：${dataDir}`);
} catch (e) {
  lock.release();
  throw e;
}
