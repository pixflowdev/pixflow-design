import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { normalizeStandaloneLayout } from '../src/standalone-layout.js';

it('preserves all traced dependencies while restoring the installer layout for paired source builds', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'pixflow-standalone-layout-'));
  try {
    const output = join(fixture, 'standalone');
    const core = join(output, 'checkout-parent/core');
    await mkdir(join(core, 'apps/web'), { recursive: true });
    await mkdir(join(core, 'node_modules/dependency'), { recursive: true });
    await writeFile(join(core, 'apps/web/server.js'), 'compiled server');
    await writeFile(join(core, 'node_modules/dependency/index.js'), 'traced dependency');
    await normalizeStandaloneLayout(output);
    expect(await readFile(join(output, 'apps/web/server.js'), 'utf8')).toBe('compiled server');
    expect(await readFile(join(output, 'node_modules/dependency/index.js'), 'utf8')).toBe('traced dependency');
    await normalizeStandaloneLayout(output); // Existing and cached layouts are unchanged.
    expect((await readdir(fixture)).sort()).toEqual(['standalone']);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

it('refuses additional traced roots without deleting or moving any files', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'pixflow-standalone-extra-'));
  try {
    await mkdir(join(fixture, 'core/apps/web'), { recursive: true });
    await writeFile(join(fixture, 'core/apps/web/server.js'), 'server');
    await writeFile(join(fixture, 'external-trace'), 'required external data');
    await expect(normalizeStandaloneLayout(fixture)).rejects.toThrow('additional or missing traced roots');
    expect(await readFile(join(fixture, 'core/apps/web/server.js'), 'utf8')).toBe('server');
    expect(await readFile(join(fixture, 'external-trace'), 'utf8')).toBe('required external data');
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

it('runs the generated CommonJS server while retaining the ESM cache handler package scope', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'pixflow-standalone-module-'));
  try {
    const app = join(fixture, 'apps/web');
    await mkdir(join(app, 'dist/sidecar'), { recursive: true });
    await writeFile(join(app, 'package.json'), '{"type":"module"}');
    const original = "const path = require('path'); console.log(path.basename(__dirname));";
    await writeFile(join(app, 'server.js'), original);
    await writeFile(join(app, 'dist/sidecar/cache.js'), 'export default "esm-handler";');
    await normalizeStandaloneLayout(fixture);
    expect(execFileSync(process.execPath, [join(app, 'server.js')], { encoding: 'utf8' }).trim()).toBe('web');
    expect(await readFile(join(app, 'server.cjs'), 'utf8')).toBe(original);
    expect(JSON.parse(await readFile(join(app, 'package.json'), 'utf8')).type).toBe('module');
    expect(execFileSync(process.execPath, ['--input-type=module', '-e', 'import handler from "./dist/sidecar/cache.js"; console.log(handler);'], { cwd: app, encoding: 'utf8' }).trim()).toBe('esm-handler');
    await normalizeStandaloneLayout(fixture);
    expect(await readFile(join(app, 'server.cjs'), 'utf8')).toBe(original);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

it('rejects a linked output root before touching its target', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'pixflow-standalone-linked-'));
  try {
    const target = join(fixture, 'target');
    await mkdir(join(target, 'core/apps/web'), { recursive: true });
    await writeFile(join(target, 'core/apps/web/server.js'), 'preserved');
    const output = join(fixture, 'standalone');
    await symlink(target, output, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(normalizeStandaloneLayout(output)).rejects.toThrow('real directory');
    expect(await readFile(join(target, 'core/apps/web/server.js'), 'utf8')).toBe('preserved');
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
