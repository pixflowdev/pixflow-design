import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveSiteContext } from '../site-context.mjs';

export function defaultInstallRoot() {
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || os.homedir(), 'Pixflow Design Bridge');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Pixflow Design Bridge');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'pixflow-design-bridge');
}

export function resolveSyncContext(options = {}) {
  const installRoot = path.resolve(String(options.installRoot || process.env.PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT || defaultInstallRoot()));
  const dataDir = path.resolve(String(options.dataDir || process.env.PIXFLOW_DESIGN_BRIDGE_DATA_DIR || path.join(installRoot, 'data')));
  // Pixflow-owned: sync state and local projects are site-scoped when the
  // bridge is running for a specific WordPress installation.
  const siteContext = resolveSiteContext({
    dataDir,
    flags: {
      'site-key': options.siteKey,
      'site-data-dir': options.siteDataDir,
      'site-origin': options.siteOrigin,
      'site-url': options.siteUrl,
      'site-label': options.siteLabel,
    },
  });
  const odDataDir = path.resolve(String(options.odDataDir || process.env.PIXFLOW_DESIGN_OD_DATA_DIR || siteContext?.odDataDir || path.join(dataDir, 'od')));
  const projectsRoot = path.join(odDataDir, 'projects');
  const syncRoot = path.resolve(String(options.syncRoot || process.env.PIXFLOW_DESIGN_SYNC_ROOT || siteContext?.syncRoot || path.join(dataDir, 'sync')));

  return {
    installRoot,
    dataDir,
    odDataDir,
    site: siteContext,
    projectsRoot,
    syncRoot,
    queueRoot: path.join(syncRoot, 'queue'),
    cacheRoot: path.join(syncRoot, 'cache'),
    statePath: path.join(syncRoot, 'projects.json'),
  };
}

export function assertSafeProjectId(projectId) {
  const value = String(projectId || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,160}$/.test(value)) {
    throw new Error('Invalid Pixflow project id.');
  }
  return value;
}

export function projectDir(context, projectId) {
  return path.join(context.projectsRoot, assertSafeProjectId(projectId));
}

export async function ensureSyncDirs(context) {
  await fs.mkdir(context.projectsRoot, { recursive: true });
  await fs.mkdir(context.queueRoot, { recursive: true });
  await fs.mkdir(context.cacheRoot, { recursive: true });
}

export async function readSyncState(context) {
  try {
    const decoded = JSON.parse(await fs.readFile(context.statePath, 'utf8'));
    return decoded && typeof decoded === 'object' && !Array.isArray(decoded)
      ? decoded
      : { schema: 1, projects: {} };
  } catch {
    return { schema: 1, projects: {} };
  }
}

export async function writeSyncState(context, state) {
  await fs.mkdir(path.dirname(context.statePath), { recursive: true });
  await fs.writeFile(context.statePath, `${JSON.stringify({
    schema: 1,
    projects: state.projects && typeof state.projects === 'object' ? state.projects : {},
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
}
