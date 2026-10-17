import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runNpmInstall } from '../src/mac/commands.js';

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('electron-builder'));
const { determinePackageManagerEnv } = builderRequire('app-builder-lib/out/node-module-collector/index.js') as {
  determinePackageManagerEnv(input: {projectDir: string; appDir: string}): {value: Promise<{pm: string}>};
};

it.skipIf(process.platform === 'win32')('collects the npm-assembled Mac app independently of its pnpm workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-mac-pm-'));
  const app = join(root, 'app');
  try {
    await mkdir(app);
    await writeFile(join(root, 'package.json'), JSON.stringify({name: 'fixture-workspace', private: true, packageManager: 'pnpm@10.33.2'}));
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - app\n');
    await writeFile(join(app, 'package.json'), JSON.stringify({name: 'fixture-app', version: '1.0.0', private: true}));
    await runNpmInstall(app);
    const env = await determinePackageManagerEnv({projectDir: app, appDir: app}).value;
    expect(env.pm).toBe('npm');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}, 30_000);
