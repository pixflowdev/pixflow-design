import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { materializePixflowBricksPromptAttachments } from '../src/pixflow-bricks-attachments.js';

describe('Pixflow Bricks floating-panel attachments', () => {
  it('copies one allowlisted project upload into the bounded per-run workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pixflow-bricks-attachment-'));
    const runtimeDataDir = join(root, 'runtime');
    const workspace = join(root, 'run');
    const projectId = '30e23574-6604-48b5-93ca-04bcce756579';
    const projectDir = join(runtimeDataDir, 'projects', projectId);
    await mkdir(projectDir, { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(join(projectDir, 'ms7d030e-pasted-text.txt'), 'Sort button diagnosis evidence.', 'utf8');

    try {
      const result = await materializePixflowBricksPromptAttachments({
        attachments: [{
          projectId,
          name: 'pasted-text.txt',
          path: 'ms7d030e-pasted-text.txt',
          mime: 'text/plain',
          size: 31,
        }],
        runtimeDataDir,
        workspace,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        projectId,
        name: 'pasted-text.txt',
        mime: 'text/plain',
        availability: 'local_copy',
      });
      expect(result[0]?.path).toContain(join(workspace, 'attachments'));
      expect((await stat(result[0]!.path)).isFile()).toBe(true);
      expect(await readFile(result[0]!.path, 'utf8')).toBe('Sort button diagnosis evidence.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('never resolves traversal, invented projects, or oversized files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pixflow-bricks-attachment-guard-'));
    const runtimeDataDir = join(root, 'runtime');
    const workspace = join(root, 'run');
    const projectId = '30e23574-6604-48b5-93ca-04bcce756579';
    const projectDir = join(runtimeDataDir, 'projects', projectId);
    await mkdir(projectDir, { recursive: true });
    await mkdir(workspace, { recursive: true });
    await writeFile(join(projectDir, 'large.txt'), 'x'.repeat(4 * 1024 * 1024 + 1), 'utf8');

    try {
      const result = await materializePixflowBricksPromptAttachments({
        attachments: [
          { projectId, name: 'outside.txt', path: '../outside.txt', mime: 'text/plain' },
          { projectId: 'invented', name: 'missing.txt', path: 'missing.txt', mime: 'text/plain' },
          { projectId, name: 'large.txt', path: 'large.txt', mime: 'text/plain' },
        ],
        runtimeDataDir,
        workspace,
      });

      expect(result).toEqual([
        expect.objectContaining({ name: 'outside.txt', path: '', availability: 'metadata_only' }),
        expect.objectContaining({ name: 'missing.txt', path: '', availability: 'metadata_only' }),
        expect.objectContaining({ name: 'large.txt', path: '', availability: 'too_large' }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
