import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { syncManagedCodexAuth } from '../../src/runtimes/codex-auth-sync.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pixflow-codex-auth-sync-'));
  roots.push(root);
  const siteKey = 'site-key-123';
  const siteDataDir = join(root, 'Pixflow Design Bridge', 'namespaces', 'release-stable-win', 'data', 'sites', siteKey);
  const sourceCodexHome = join(root, 'host', '.codex');
  const legacyCodexHome = join(root, 'Pixflow Design Bridge', 'data', 'sites', siteKey, 'codex-home');
  mkdirSync(sourceCodexHome, { recursive: true });
  mkdirSync(legacyCodexHome, { recursive: true });
  return { root, siteDataDir, sourceCodexHome, legacyCodexHome };
}

describe('managed Codex authentication synchronisation', () => {
  it('uses the native host authentication store rather than copying an OAuth token into a separate home', () => {
    const { siteDataDir, sourceCodexHome } = fixture();
    writeFileSync(join(sourceCodexHome, 'config.toml'), 'cli_auth_credentials_store = "keyring"');
    const env: NodeJS.ProcessEnv = {
      PIXFLOW_DESIGN_SITE_DATA_DIR: siteDataDir,
      PIXFLOW_DESIGN_CODEX_AUTH_SOURCE_HOME: sourceCodexHome,
    };
    syncManagedCodexAuth(env);
    expect(env.CODEX_HOME).toBe(sourceCodexHome);
    expect(existsSync(join(siteDataDir, 'codex-home'))).toBe(false);
  });
  it('updates Windows mixed-case environment keys without leaving competing homes', () => {
    const { siteDataDir, sourceCodexHome } = fixture();
    const env: NodeJS.ProcessEnv = {
      PIXFLOW_DESIGN_SITE_DATA_DIR: siteDataDir,
      PIXFLOW_DESIGN_CODEX_AUTH_SOURCE_HOME: sourceCodexHome,
      Codex_Home: join(siteDataDir, 'codex-home'),
    };
    syncManagedCodexAuth(env);
    expect(env.Codex_Home).toBe(sourceCodexHome);
    expect(env.CODEX_HOME).toBeUndefined();
  });
  it('leaves authentication outside Pixflow-managed runtimes unchanged', () => {
    const env: NodeJS.ProcessEnv = { CODEX_HOME: '/custom' };
    syncManagedCodexAuth(env);
    expect(env).toEqual({ CODEX_HOME: '/custom' });
  });
  it('migrates saved authentication from a different installed Bridge site in dev launches', () => {
    const { root, siteDataDir, sourceCodexHome } = fixture();
    const env: NodeJS.ProcessEnv = {
      PIXFLOW_DESIGN_SITE_KEY: 'new-selected-site',
      OD_DATA_DIR: siteDataDir,
      PIXFLOW_DESIGN_CODEX_AUTH_SOURCE_HOME: sourceCodexHome,
      CODEX_HOME: join(root, 'Pixflow Design Bridge', 'namespaces', 'release-stable-win', 'data', 'sites', 'another-site', 'codex-home'),
    };
    syncManagedCodexAuth(env);
    expect(env.CODEX_HOME).toBe(sourceCodexHome);
  });
  it('migrates a legacy Pixflow home and uses the current native host home', async () => {
    const { siteDataDir, sourceCodexHome, legacyCodexHome } = fixture();
    writeFileSync(join(sourceCodexHome, 'auth.json'), 'current-account');
    writeFileSync(join(legacyCodexHome, 'auth.json'), 'revoked-account');

    const env: NodeJS.ProcessEnv = {
      PIXFLOW_DESIGN_SITE_DATA_DIR: siteDataDir,
      PIXFLOW_DESIGN_CODEX_AUTH_SOURCE_HOME: sourceCodexHome,
      CODEX_HOME: legacyCodexHome,
    };
    syncManagedCodexAuth(env);

    expect(env.CODEX_HOME).toBe(sourceCodexHome);
    expect(await import('node:fs/promises').then(({ readFile }) => readFile(join(legacyCodexHome, 'auth.json'), 'utf8'))).toBe('revoked-account');
  });

  it('keeps a genuinely custom Codex home unchanged', () => {
    const { siteDataDir, sourceCodexHome, root } = fixture();
    const customCodexHome = join(root, 'custom-codex-home');
    mkdirSync(customCodexHome, { recursive: true });
    writeFileSync(join(sourceCodexHome, 'auth.json'), 'current-account');

    const env: NodeJS.ProcessEnv = {
      PIXFLOW_DESIGN_SITE_DATA_DIR: siteDataDir,
      PIXFLOW_DESIGN_CODEX_AUTH_SOURCE_HOME: sourceCodexHome,
      CODEX_HOME: customCodexHome,
    };
    syncManagedCodexAuth(env);

    expect(env.CODEX_HOME).toBe(customCodexHome);
  });

  it('ignores isolated token timestamps and leaves credential stores untouched', async () => {
    const { siteDataDir, sourceCodexHome } = fixture();
    const targetCodexHome = join(siteDataDir, 'codex-home');
    mkdirSync(targetCodexHome, { recursive: true });
    const sourceAuth = join(sourceCodexHome, 'auth.json');
    const targetAuth = join(targetCodexHome, 'auth.json');
    writeFileSync(sourceAuth, 'new-account');
    writeFileSync(targetAuth, 'old-account');
    const now = Date.now() / 1000;
    utimesSync(sourceAuth, now - 10, now - 10);
    utimesSync(targetAuth, now - 20, now - 20);

    const env: NodeJS.ProcessEnv = {
      PIXFLOW_DESIGN_SITE_DATA_DIR: siteDataDir,
      PIXFLOW_DESIGN_CODEX_AUTH_SOURCE_HOME: sourceCodexHome,
      CODEX_HOME: targetCodexHome,
    };
    syncManagedCodexAuth(env);
    expect(env.CODEX_HOME).toBe(sourceCodexHome);
    expect(await import('node:fs/promises').then(({ readFile }) => readFile(targetAuth, 'utf8'))).toBe('old-account');

    writeFileSync(targetAuth, 'refreshed-isolated-account');
    utimesSync(targetAuth, now + 20, now + 20);
    syncManagedCodexAuth(env);
    expect(await import('node:fs/promises').then(({ readFile }) => readFile(targetAuth, 'utf8'))).toBe('refreshed-isolated-account');
  });
});
