import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { containsSymlink } from '../src/library-install.js';

describe('containsSymlink', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'pixflow-contains-symlink-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('accepts a plain nested tree', async () => {
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await writeFile(path.join(root, 'assets', 'logo.svg'), '<svg/>');
    expect(await containsSymlink(root)).toBe(false);
  });

  it('detects a nested symlink without following it', async () => {
    await mkdir(path.join(root, 'nested'), { recursive: true });
    const target = path.join(root, 'secret');
    await mkdir(target);
    await symlink(
      target,
      path.join(root, 'nested', 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(await containsSymlink(root)).toBe(true);
  });
});
