import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { defaultBundledRoot } from '../src/plugins/bundled.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('bundled essential guidance', () => {
  it('uses the guidance root and keeps only the hidden task router scenario', async () => {
    const root = defaultBundledRoot(repoRoot);
    expect(root).toBe(path.join(repoRoot, 'guidance'));
    const scenarios = path.join(root, 'scenarios');
    const entries = await readdir(scenarios, { withFileTypes: true });
    expect(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)).toEqual(['od-default']);
    const manifest = JSON.parse(await readFile(path.join(scenarios, 'od-default', 'open-design.json'), 'utf8'));
    expect(manifest.name).toBe('od-default');
    expect(manifest.od.kind).toBe('scenario');
    expect(manifest.od.hidden).toBe(true);
    expect(manifest.od.context?.craft).toBeUndefined();
    expect(manifest.od.pipeline.stages.flatMap((stage: { atoms: string[] }) => stage.atoms)).toEqual([]);
    expect((await readFile(path.join(scenarios, 'od-default', 'SKILL.md'), 'utf8')).length).toBeGreaterThan(0);
  });
});
