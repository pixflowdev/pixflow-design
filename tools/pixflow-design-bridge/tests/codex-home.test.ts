import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isolateBridgeCodexHome } from '../codex-home.mjs';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-codex-home-'));
  temporaryRoots.push(root);
  return root;
}

describe('isolateBridgeCodexHome', () => {
  it('migrates saved homes from another Bridge site after a site switch', async () => {
    const root = await temporaryRoot();
    const sourceCodexHome = join(root, 'host', '.codex');
    const oldSiteHome = join(root, 'Pixflow Design Bridge', 'namespaces', 'release-stable-win', 'data', 'sites', 'old-site', 'codex-home');
    const config = await isolateBridgeCodexHome({agentCliEnv:{codex:{CODEX_HOME:oldSiteHome}}},join(root,'new-site'),{sourceCodexHome});
    expect(config.agentCliEnv.codex.CODEX_HOME).toBe(sourceCodexHome);
  });
  it('uses the host authentication store, including its credential-store configuration', async () => {
    const root = await temporaryRoot();
    const sourceCodexHome = join(root, 'host', '.codex');
    await mkdir(sourceCodexHome, { recursive: true });
    await writeFile(join(sourceCodexHome, 'config.toml'), 'cli_auth_credentials_store = "keyring"');
    const config = await isolateBridgeCodexHome({}, join(root, 'site'), { sourceCodexHome });
    expect(config.agentCliEnv.codex.CODEX_HOME).toBe(sourceCodexHome);
  });
  it('migrates the saved managed home without modifying its credentials', async () => {
    const root = await temporaryRoot();
    const sourceCodexHome = join(root, 'source-codex-home');
    const siteDataDir = join(root, 'site');
    const targetCodexHome = join(siteDataDir, 'codex-home');
    await mkdir(sourceCodexHome, { recursive: true });
    await mkdir(targetCodexHome, { recursive: true });
    const sourceAuth = join(sourceCodexHome, 'auth.json');
    const targetAuth = join(targetCodexHome, 'auth.json');
    await writeFile(sourceAuth, 'fresh-auth', 'utf8');
    await writeFile(targetAuth, 'revoked-auth', 'utf8');
    const now = Date.now();
    await utimes(sourceAuth, new Date(now + 20_000), new Date(now + 20_000));
    await utimes(targetAuth, new Date(now - 20_000), new Date(now - 20_000));

    const config = await isolateBridgeCodexHome({
      agentCliEnv: { codex: { CODEX_HOME: targetCodexHome } },
    }, siteDataDir, { sourceCodexHome });

    expect(config.agentCliEnv.codex.CODEX_HOME).toBe(sourceCodexHome);
    expect(await readFile(targetAuth, 'utf8')).toBe('revoked-auth');
  });

  it('migrates a legacy managed home without duplicating credentials', async () => {
    const root = await temporaryRoot();
    const sourceCodexHome = join(root, 'source-codex-home');
    const siteKey = 'site-key-123';
    const siteDataDir = join(root, 'Pixflow Design Bridge', 'namespaces', 'release-stable-win', 'data', 'sites', siteKey);
    const targetCodexHome = join(siteDataDir, 'codex-home');
    const legacyCodexHome = join(root, 'Pixflow Design Bridge', 'data', 'sites', siteKey, 'codex-home');
    await mkdir(sourceCodexHome, { recursive: true });
    await mkdir(legacyCodexHome, { recursive: true });
    await writeFile(join(sourceCodexHome, 'auth.json'), 'fresh-account-auth', 'utf8');
    await writeFile(join(legacyCodexHome, 'auth.json'), 'revoked-account-auth', 'utf8');

    const config = await isolateBridgeCodexHome({
      agentCliEnv: { codex: { CODEX_HOME: legacyCodexHome } },
    }, siteDataDir, { sourceCodexHome });

    expect(config.agentCliEnv.codex.CODEX_HOME).toBe(sourceCodexHome);
    expect(await readFile(join(legacyCodexHome, 'auth.json'), 'utf8')).toBe('revoked-account-auth');
    await expect(readFile(join(targetCodexHome, 'auth.json'))).rejects.toThrow();
  });

  it('preserves an explicitly configured custom Codex home', async () => {
    const root = await temporaryRoot();
    const sourceCodexHome = join(root, 'source-codex-home');
    const siteDataDir = join(root, 'site');
    const customCodexHome = join(root, 'custom-codex-home');
    await mkdir(sourceCodexHome, { recursive: true });
    await writeFile(join(sourceCodexHome, 'auth.json'), 'fresh-auth', 'utf8');

    const config = await isolateBridgeCodexHome({
      agentCliEnv: { codex: { CODEX_HOME: customCodexHome } },
    }, siteDataDir, { sourceCodexHome });

    expect(config.agentCliEnv.codex.CODEX_HOME).toBe(customCodexHome);
    await expect(readFile(join(siteDataDir, 'codex-home', 'auth.json'), 'utf8')).rejects.toThrow();
  });

  it('does not overwrite a newer isolated token during startup reconciliation', async () => {
    const root = await temporaryRoot();
    const sourceCodexHome = join(root, 'source-codex-home');
    const siteDataDir = join(root, 'site');
    const targetCodexHome = join(siteDataDir, 'codex-home');
    await mkdir(sourceCodexHome, { recursive: true });
    await mkdir(targetCodexHome, { recursive: true });
    const sourceAuth = join(sourceCodexHome, 'auth.json');
    const targetAuth = join(targetCodexHome, 'auth.json');
    await writeFile(sourceAuth, 'host-auth', 'utf8');
    await writeFile(targetAuth, 'refreshed-isolated-auth', 'utf8');
    const now = Date.now();
    await utimes(sourceAuth, new Date(now - 20_000), new Date(now - 20_000));
    await utimes(targetAuth, new Date(now + 20_000), new Date(now + 20_000));

    await isolateBridgeCodexHome({
      agentCliEnv: { codex: { CODEX_HOME: targetCodexHome } },
    }, siteDataDir, { sourceCodexHome });

    expect(await readFile(targetAuth, 'utf8')).toBe('refreshed-isolated-auth');
  });
});
