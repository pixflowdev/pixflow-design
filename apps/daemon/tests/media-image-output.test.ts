import { access, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { enforceImageOnlyProjectOutput } from '../src/projects.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('image-only project output cleanup', () => {
  it('removes HTML/preview companions and keeps one newly generated image', async () => {
    const root = await os.tmpdir();
    const tempRoot = await mkdtemp(path.join(root, 'od-image-output-'));
    tempRoots.push(tempRoot);
    const projectDir = path.join(tempRoot, 'image-project');
    const pluginAssetsDir = path.join(projectDir, 'plugin-assets', 'od-media-generation');
    await mkdir(pluginAssetsDir, { recursive: true });

    const indexPath = path.join(projectDir, 'index.html');
    const critiquePath = path.join(projectDir, 'critique.json');
    const indexManifestPath = path.join(projectDir, 'index.html.artifact.json');
    const notesPath = path.join(projectDir, 'notes.txt');
    const firstImagePath = path.join(projectDir, 'extra.png');
    const generatedImagePath = path.join(projectDir, 'image.jpg');
    const pluginAssetPath = path.join(pluginAssetsDir, 'plugin-manifest.json');
    await Promise.all([
      writeFile(indexPath, '<html></html>'),
      writeFile(critiquePath, '{}'),
      writeFile(indexManifestPath, '{}'),
      writeFile(notesPath, 'keep existing non-web note'),
      writeFile(firstImagePath, 'first'),
      writeFile(generatedImagePath, 'generated'),
      writeFile(pluginAssetPath, '{}'),
    ]);

    const now = Date.now();
    await Promise.all([
      utimes(indexPath, new Date(now - 10_000), new Date(now - 10_000)),
      utimes(critiquePath, new Date(now - 10_000), new Date(now - 10_000)),
      utimes(indexManifestPath, new Date(now - 10_000), new Date(now - 10_000)),
      utimes(notesPath, new Date(now - 10_000), new Date(now - 10_000)),
    ]);
    await utimes(firstImagePath, new Date(now), new Date(now));
    await utimes(generatedImagePath, new Date(now + 20), new Date(now + 20));
    const result = await enforceImageOnlyProjectOutput(tempRoot, 'image-project', {
      runStartTimeMs: now - 100,
      existingFileNames: ['index.html', 'critique.json', 'notes.txt'] as any,
    });

    expect(result.keptImage).toBe('image.jpg');
    expect(result.removed).toEqual(expect.arrayContaining(['index.html', 'critique.json', 'extra.png']));
    expect(await exists(indexPath)).toBe(false);
    expect(await exists(critiquePath)).toBe(false);
    expect(await exists(indexManifestPath)).toBe(false);
    expect(await exists(firstImagePath)).toBe(false);
    expect(await exists(generatedImagePath)).toBe(true);
    expect(await exists(notesPath)).toBe(true);
    expect(await exists(pluginAssetPath)).toBe(true);
  });
});
