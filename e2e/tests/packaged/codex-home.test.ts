import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function loadHelper() {
  const helperPath = join(process.cwd(), '..', 'tools', 'pixflow-design-bridge', 'codex-home.mjs');
  return import(pathToFileURL(helperPath).href) as Promise<{
    isolateBridgeCodexHome: (
      config: Record<string, unknown>,
      siteDataDir: string,
      options: { sourceCodexHome: string },
    ) => Promise<Record<string, any>>;
  }>;
}

describe('Pixflow bridge Codex home isolation', () => {
  it('[P0] disables unrelated Codex desktop plugins for deterministic bridge runs', async () => {
    const bridgePath = join(process.cwd(), '..', 'tools', 'pixflow-design-bridge', 'pixflow-design-bridge.mjs');
    const bridgeSource = await readFile(bridgePath, 'utf8');

    expect(bridgeSource).toContain("OD_CODEX_DISABLE_PLUGINS: '1'");
  });

  it('[P0] isolates mutable Codex cache state while preserving authentication', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pixflow-codex-home-'));
    roots.push(root);
    const source = join(root, 'shared-codex');
    const site = join(root, 'site');
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'auth.json'), '{"tokens":"test"}', 'utf8');
    await writeFile(join(source, 'models_cache.json'), '{"schema":"desktop-only"}', 'utf8');
    await writeFile(join(source, 'config.toml'), 'model = "desktop"', 'utf8');

    const { isolateBridgeCodexHome } = await loadHelper();
    const config = await isolateBridgeCodexHome(
      { agentCliEnv: { codex: { CODEX_API_KEY: 'existing' } } },
      site,
      { sourceCodexHome: source },
    );
    const target = config.agentCliEnv.codex.CODEX_HOME as string;

    expect(target).toBe(join(site, 'codex-home'));
    expect(config.agentCliEnv.codex.CODEX_API_KEY).toBe('existing');
    expect(await readFile(join(target, 'auth.json'), 'utf8')).toContain('tokens');
    await expect(readFile(join(target, 'models_cache.json'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(target, 'config.toml'), 'utf8')).rejects.toThrow();
  });

  it('[P1] preserves an explicit user CODEX_HOME override', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pixflow-codex-home-explicit-'));
    roots.push(root);
    const { isolateBridgeCodexHome } = await loadHelper();
    const explicit = join(root, 'explicit');
    const config = await isolateBridgeCodexHome(
      { agentCliEnv: { codex: { CODEX_HOME: explicit } } },
      join(root, 'site'),
      { sourceCodexHome: join(root, 'shared') },
    );

    expect(config.agentCliEnv.codex.CODEX_HOME).toBe(explicit);
  });
});
