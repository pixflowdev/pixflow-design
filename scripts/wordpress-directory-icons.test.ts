import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('Apache-era font is pinned and retains every icon name used by the application', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const vendor = join(root, 'wordpress/directory/vendor/remixicon');
  const font = await readFile(join(vendor, 'remixicon.woff2'));
  assert.equal(createHash('sha256').update(font).digest('hex'), '56fb214017445c51f775255d0a9ca74c527097d97e647c5807b7c71f44f07088');
  assert.match(await readFile(join(vendor, 'LICENSE.txt'), 'utf8'), /Apache License/);
  const css = await readFile(join(vendor, 'remixicon.css'), 'utf8');
  const current = await readFile(join(root, 'apps/web/src/styles/remixicon/remixicon.css'), 'utf8');
  const names = new Set([...css.matchAll(/\.ri-([a-z0-9-]+):/g)].map(match => match[1]!));
  const removed = [...current.matchAll(/\.ri-([a-z0-9-]+):/g)].map(match => match[1]!).filter(name => !names.has(name));
  const missing: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:tsx?|jsx?)$/.test(entry.name)) {
        const source = await readFile(path, 'utf8');
        for (const name of removed) if (source.includes(name)) missing.push(`${path}: ${name}`);
      }
    }
  }
  await visit(join(root, 'apps/web/src'));
  assert.deepEqual(missing, []);
  assert.equal((css.match(/url\(/g) ?? []).length, 1);
  assert.match(css, /url\("\/remixicon\.woff2"\)/);
});
