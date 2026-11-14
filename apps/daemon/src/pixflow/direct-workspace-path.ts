import path from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

/** Keep provider-generated transcript paths short without sharing site/namespace workspaces. */
export function directWorkspaceRoot(dataDir: string, platform = process.platform, home = homedir()): string {
  if (platform !== 'win32') return path.join(dataDir, 'direct-site-runs');
  const identity = path.win32.resolve(dataDir).toLowerCase();
  const scope = createHash('sha256').update(identity).digest('hex').slice(0, 24);
  return path.win32.join(home, '.pixflow', 'runs', scope);
}

/** Only generated direct children are eligible for retention cleanup, including legacy runs. */
export function isManagedDirectWorkspace(workspace: string, roots: string[]): boolean {
  return /^run-[a-zA-Z0-9]+$/.test(path.basename(workspace)) &&
    roots.some(root => path.dirname(path.resolve(workspace)) === path.resolve(root));
}
