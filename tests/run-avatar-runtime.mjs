import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

for (const name of ['avatar-runtime', 'capture-lifecycle', 'capture-engine']) {
  const outfile = fileURLToPath(new URL(`.${name}.test.mjs`, import.meta.url));
  try {
    await build({ entryPoints: [fileURLToPath(new URL(`${name}.test.ts`, import.meta.url))], outfile,
      bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
    const result = spawnSync(process.execPath, [outfile], { encoding: 'utf8' });
    console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
    if (result.status !== 0) process.exitCode = 1;
  } finally { try { unlinkSync(outfile); } catch {} }
}
