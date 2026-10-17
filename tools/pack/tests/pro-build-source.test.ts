import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { it, expect } from 'vitest';
import { proBuildCacheRoot } from '../src/pro-build-source.js';

it('keeps Free caches independent and invalidates all Pro cache layers when paired source changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-pro-pack-cache-'));
  try {
    const pro = join(root, 'private-checkout');
    const cache = join(root, 'cache');
    await mkdir(join(pro, 'apps/web/src/pro'), { recursive: true });
    await writeFile(join(pro, 'pixflow-pro.json'), '{"buildContract":1}');
    await writeFile(join(pro, 'apps/web/src/pro/standalone.tsx'), 'export const feature = 1;');
    expect(proBuildCacheRoot(cache, undefined)).toBe(cache);
    const original = proBuildCacheRoot(cache, pro);
    expect(original).not.toBe(cache);
    expect(proBuildCacheRoot(cache, pro)).toBe(original);
    await writeFile(join(pro, 'apps/web/src/pro/standalone.tsx'), 'export const feature = 2;');
    expect(proBuildCacheRoot(cache, pro)).not.toBe(original);
    await writeFile(join(pro, 'apps/web/src/pro/standalone.tsx'), 'export const feature = 1;');
    await writeFile(join(pro, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0');
    expect(proBuildCacheRoot(cache, pro)).not.toBe(original);
    expect(proBuildCacheRoot(cache, undefined)).toBe(cache);
  } finally { await rm(root, { recursive: true, force: true }); }
});
