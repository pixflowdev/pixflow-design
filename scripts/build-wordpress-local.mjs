import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeCommand = process.execPath;

function run(script) {
  const result = spawnSync(nodeCommand, [script], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    const failure = result.error instanceof Error ? `: ${result.error.message}` : '';
    throw new Error(`${script} failed with exit code ${result.status ?? 'unknown'}${failure}`);
  }
}

run('./scripts/build-wordpress-web.mjs');
run('./scripts/build-wordpress-plugin.mjs');
