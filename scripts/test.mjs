import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {copyFile} from 'node:fs/promises';
await import('./build-server.mjs');
await build({entryPoints:['tests/team-fonts.test.ts','tests/editing.test.ts','tests/ai-export.test.tsx','tests/thumbnails.test.ts','tests/overview.test.ts','tests/deletion.test.ts','tests/engine.test.ts','tests/interaction.test.ts','tests/server.test.ts','tests/routes.test.ts','tests/teams.test.ts','tests/workbench.test.ts','tests/public-ids.test.ts','tests/view-states.test.tsx'],bundle:true,loader:{'.svg':'dataurl'},platform:'node',format:'esm',packages:'external',outdir:'.test-output',outExtension:{'.js':'.mjs'}});
await copyFile('.server-build/worker.mjs','.test-output/worker.mjs');
await copyFile('.server-build/thumbnail-worker.mjs','.test-output/thumbnail-worker.mjs');
const result=spawnSync(process.execPath,['--test','.test-output/team-fonts.test.mjs','.test-output/editing.test.mjs','.test-output/ai-export.test.mjs','.test-output/thumbnails.test.mjs','.test-output/overview.test.mjs','.test-output/deletion.test.mjs','.test-output/engine.test.mjs','.test-output/interaction.test.mjs','.test-output/server.test.mjs','.test-output/routes.test.mjs','.test-output/teams.test.mjs','.test-output/workbench.test.mjs','.test-output/public-ids.test.mjs','.test-output/view-states.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
