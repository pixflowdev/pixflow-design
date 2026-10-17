import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRIDGE_BUNDLED_WORKFLOW_PATHS, resolveBridgeWorkflowSources } from '../runtime-manifest.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');

describe('Pixflow Design Bridge runtime manifest', () => {
  it('keeps the complete packaged workflow contract while Free CLI source installs stay independent', async () => {
    expect(BRIDGE_BUNDLED_WORKFLOW_PATHS).toEqual(expect.arrayContaining(['plugins/_official/examples/web-clone', 'skills/web-clone']));
    expect(BRIDGE_BUNDLED_WORKFLOW_PATHS).not.toContain('skills/build-in-bricks-html-first');
    const root = await mkdtemp(path.join(tmpdir(), 'pixflow-free-bridge-workflows-'));
    try {
      await mkdir(path.join(root, 'plugins/_official/examples/web-clone'), { recursive: true });
      expect(resolveBridgeWorkflowSources(root).map(item => item.relativePath)).toEqual(['plugins/_official/examples/web-clone']);
      expect(() => resolveBridgeWorkflowSources(root, { requirePro: true })).toThrow(/PIXFLOW_DESIGN_PRO_ROOT/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('assembles the private workflow only from explicit Pro source and supports installed release archives', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pixflow-pro-bridge-workflows-'));
    try {
      const core = path.join(root, 'core');
      const pro = path.join(root, 'private');
      await mkdir(path.join(core, 'plugins/_official/examples/web-clone'), { recursive: true });
      await mkdir(path.join(pro, 'skills/web-clone'), { recursive: true });
      await writeFile(path.join(pro, 'pixflow-pro.json'), '{"buildContract":1}');
      const sources = resolveBridgeWorkflowSources(core, { proRoot: pro, requirePro: true });
      expect(sources).toHaveLength(2);
      expect(sources.find(item => item.relativePath === 'skills/web-clone')?.source).toBe(path.join(pro, 'skills/web-clone'));
      await mkdir(path.join(core, 'skills/web-clone'), { recursive: true });
      expect(resolveBridgeWorkflowSources(core, { requirePro: true })).toHaveLength(2);
      await writeFile(path.join(pro, 'pixflow-pro.json'), '{"buildContract":2}');
      expect(() => resolveBridgeWorkflowSources(core, { proRoot: pro })).toThrow(/Unsupported Pro build contract/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('uses the same source resolver for source installs and complete release packaging', async () => {
    const [installer, packager] = await Promise.all([
      readFile(path.join(repositoryRoot, 'tools/pixflow-design-bridge/install.mjs'), 'utf8'),
      readFile(path.join(repositoryRoot, 'scripts/build-pixflow-design-bridge-package.mjs'), 'utf8'),
    ]);
    expect(installer).toContain('resolveBridgeWorkflowSources');
    expect(packager).toContain('resolveBridgeWorkflowSources');
    expect(packager).toContain('requirePro: true');
  });
});
