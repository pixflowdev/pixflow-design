import os from 'node:os';
import path from 'node:path';

/**
 * Use Codex's native authentication home for every Pixflow-managed launch.
 *
 * OAuth refresh and credential-store selection belong to Codex. Copying
 * auth.json into per-site homes splits that state from the desktop app's
 * configuration/keyring and can leave the Bridge using revoked credentials.
 * The selected Codex App executable already takes priority over standalone
 * installations. Keep site task data isolated, but share native authentication
 * and session storage. Explicit custom CODEX_HOME values remain authoritative.
 */
export function syncManagedCodexAuth(env: NodeJS.ProcessEnv): void {
  const siteDataDir = envValue(env, 'PIXFLOW_DESIGN_SITE_DATA_DIR')
    || (envValue(env, 'PIXFLOW_DESIGN_SITE_KEY') ? envValue(env, 'OD_DATA_DIR') : null);
  if (!siteDataDir) return;

  const configuredCodexHome = envValue(env, 'CODEX_HOME');
  if (configuredCodexHome && !isPixflowManagedCodexHome(configuredCodexHome, siteDataDir)) {
    return;
  }

  const sourceCodexHome = envValue(env, 'PIXFLOW_DESIGN_CODEX_AUTH_SOURCE_HOME')
    || path.join(os.homedir(), '.codex');
  const nativeHome = isPixflowManagedCodexHome(sourceCodexHome, siteDataDir)
    ? path.join(os.homedir(), '.codex') : sourceCodexHome;
  const homeKey = Object.keys(env).find((key) => key.toUpperCase() === 'CODEX_HOME') || 'CODEX_HOME';
  env[homeKey] = path.resolve(nativeHome);
}

function isPixflowManagedCodexHome(configuredCodexHome: string, siteDataDir: string): boolean {
  const configured = path.resolve(configuredCodexHome);
  const managed = path.resolve(siteDataDir, 'codex-home');
  if (configured === managed) return true;

  const normalizedConfigured = configured.replace(/\\/g, '/').toLowerCase();
  // Saved config may come from another selected site or installed namespace.
  // Recognize only the Bridge-owned layout, never an arbitrary custom home.
  return /\/pixflow design bridge\/(?:namespaces\/[^/]+\/)?data\/sites\/[^/]+\/codex-home$/.test(normalizedConfigured);
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | null {
  const actualKey = Object.keys(env).find((candidate) => candidate.toUpperCase() === key.toUpperCase());
  const value = actualKey == null ? undefined : env[actualKey];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
