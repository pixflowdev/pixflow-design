import os from 'node:os';
import path from 'node:path';

/**
 * Resolve legacy managed homes to Codex's native authentication home.
 * Keep this compatibility export name for installed launchers. Codex owns
 * OAuth refresh, keyring selection and configuration; the Bridge must not
 * fork its credentials into site-local snapshots. The Codex App executable
 * takes priority over standalone CLIs to keep native runtime state compatible.
 */
export async function isolateBridgeCodexHome(
  config,
  siteDataDir,
  {
    sourceCodexHome = process.env.PIXFLOW_DESIGN_CODEX_AUTH_SOURCE_HOME
      || process.env.CODEX_HOME
      || path.join(os.homedir(), '.codex'),
  } = {},
) {
  const next = config && typeof config === 'object' && !Array.isArray(config)
    ? structuredClone(config)
    : {};
  const agentCliEnv = next.agentCliEnv && typeof next.agentCliEnv === 'object' && !Array.isArray(next.agentCliEnv)
    ? { ...next.agentCliEnv }
    : {};
  const codex = agentCliEnv.codex && typeof agentCliEnv.codex === 'object' && !Array.isArray(agentCliEnv.codex)
    ? { ...agentCliEnv.codex }
    : {};
  const configuredCodexHome = typeof codex.CODEX_HOME === 'string'
    ? codex.CODEX_HOME.trim()
    : '';

  // Preserve custom homes, but migrate both historical managed layouts.
  if (configuredCodexHome && !isPixflowManagedCodexHome(configuredCodexHome, siteDataDir)) {
    return next;
  }

  codex.CODEX_HOME = sourceCodexHome && !isPixflowManagedCodexHome(sourceCodexHome, siteDataDir)
    ? path.resolve(sourceCodexHome) : path.join(os.homedir(), '.codex');
  agentCliEnv.codex = codex;
  next.agentCliEnv = agentCliEnv;

  return next;
}

function isPixflowManagedCodexHome(configuredCodexHome, siteDataDir) {
  const configured = path.resolve(configuredCodexHome);
  const managed = path.resolve(siteDataDir, 'codex-home');
  if (configured === managed) return true;

  const normalizedConfigured = configured.replace(/\\/g, '/').toLowerCase();
  return /\/pixflow design bridge\/(?:namespaces\/[^/]+\/)?data\/sites\/[^/]+\/codex-home$/.test(normalizedConfigured);
}
