import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { filterGeneratedWritesPreservingUserEdits } from '../src/design-systems.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('generated design-system preservation', () => {
  it('writes missing files but preserves legacy/user-owned files without a fingerprint', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-ds-preserve-'));
    roots.push(root);
    await mkdir(root, { recursive: true });
    const existing = path.join(root, 'README.md');
    const missing = path.join(root, 'tokens.css');
    await writeFile(existing, 'user content', 'utf8');

    const filtered = await filterGeneratedWritesPreservingUserEdits(root, [
      { targetPath: existing, content: 'generated replacement' },
      { targetPath: missing, content: ':root {}' },
    ], {});

    expect(filtered.writes.map((write) => path.basename(write.targetPath))).toEqual(['tokens.css']);
    expect(await readFile(existing, 'utf8')).toBe('user content');
  });
});
