import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Discover app-managed downloads only; never read Desktop credentials or run its GUI executable. */
export function claudeDesktopCandidates(options: {
  platform: NodeJS.Platform; home: string; scoped: boolean; env?: NodeJS.ProcessEnv;
}): string[] {
  const { platform, home, scoped, env = process.env } = options;
  const local = !scoped && env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const roaming = !scoped && env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const bases = platform === 'win32' ? [
    path.join(local, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Roaming', 'Claude', 'claude-code'),
    path.join(roaming, 'Claude', 'claude-code'),
  ] : platform === 'darwin' ? [path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code')] : [];
  const candidates: { file: string; version: number[]; modified: number }[] = [];
  for (const base of bases) {
    try {
      for (const version of readdirSync(base, { withFileTypes: true })) {
        if (!version.isDirectory() || !/^\d+\.\d+\.\d+$/.test(version.name)) continue;
        for (const hash of readdirSync(path.join(base, version.name), { withFileTypes: true })) {
          if (!hash.isDirectory() || !/^[a-zA-Z0-9_-]+$/.test(hash.name)) continue;
          const file = path.join(base, version.name, hash.name, platform === 'win32' ? 'claude.exe' : 'claude');
          try {
            const info = statSync(file);
            if (info.isFile() && info.size > 0) candidates.push({ file, version: version.name.split('.').map(Number), modified: info.mtimeMs });
          } catch { /* An app update may still be downloading this version. */ }
        }
      }
    } catch { /* Desktop is optional, including on restricted profiles. */ }
  }
  return candidates.sort((a, b) => b.version[0]! - a.version[0]! || b.version[1]! - a.version[1]!
    || b.version[2]! - a.version[2]! || b.modified - a.modified || a.file.localeCompare(b.file)).map(item => item.file);
}
