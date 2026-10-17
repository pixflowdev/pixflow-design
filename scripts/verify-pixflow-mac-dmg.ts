import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, lstatSync, rmdirSync, openSync, readSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Inspect the delivered app, including nested Electron helpers and native modules.
const [input, target] = process.argv.slice(2);
if (process.platform !== 'darwin' || !input || !target || !['arm64', 'x64'].includes(target)) {
  throw new Error('Usage on macOS: node verify-pixflow-mac-dmg.ts <dmg> <arm64|x64>');
}
const mount = mkdtempSync(join(tmpdir(), 'pixflow-dmg-check-'));
let mounted = false;
let binaries = 0;
let sqlite = 0;
function inspect(directory: string): void {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) { inspect(path); continue; }
    if (!stat.isFile()) continue;
    const fd = openSync(path, 'r');
    const magic = Buffer.alloc(4);
    try { readSync(fd, magic, 0, 4, 0); } finally { closeSync(fd); }
    if (![0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca].includes(magic.readUInt32BE())) continue;
    execFileSync('/usr/bin/lipo', [path, '-verify_arch', target === 'x64' ? 'x86_64' : 'arm64']);
    binaries++;
    if (name === 'better_sqlite3.node') sqlite++;
  }
}
try {
  execFileSync('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, resolve(input)]);
  mounted = true;
  const app = join(mount, 'Pixflow Design Bridge.app');
  inspect(app);
  if (!binaries || !sqlite) throw new Error('App is missing native executable or SQLite evidence');
  console.log(JSON.stringify({ target, binaries, sqlite, verified: true }));
} finally {
  if (mounted) execFileSync('/usr/bin/hdiutil', ['detach', mount]);
  rmdirSync(mount);
}
