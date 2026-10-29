import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeDesktopCandidates } from '../../src/runtimes/claude-desktop.js';
import { inspectAgentExecutableResolution } from '../../src/runtimes/executables.js';
import { claudeAgentDef } from '../../src/runtimes/defs/claude.js';
import { withEnvSnapshot } from './helpers/test-helpers.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root() { const dir = mkdtempSync(join(tmpdir(), 'pixflow-claude-discovery-')); roots.push(dir); return dir; }
function runtime(base: string, version: string, hash = 'abc123') {
  const dir = join(base, version, hash); mkdirSync(dir, { recursive: true });
  const file = join(dir, 'claude.exe'); writeFileSync(file, 'fixture'); chmodSync(file, 0o755); return file;
}
test('discovers the Windows Store app runtime without requiring a PATH CLI', () => {
  const home = root();
  const base = join(home, 'AppData/Local/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude/claude-code');
  const old = runtime(base, '2.1.9'); const latest = runtime(base, '2.1.309');
  mkdirSync(join(base, '2.1.400', 'partial'), { recursive: true });
  expect(claudeDesktopCandidates({ platform: 'win32', home, scoped: true })).toEqual([latest, old]);
});
test('scoped discovery never searches host application data', () => {
  expect(claudeDesktopCandidates({ platform: 'win32', home: root(), scoped: true,
    env: { APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA } })).toEqual([]);
});
test('missing app runtime leaves the CLI fallback available', () => {
  expect(claudeDesktopCandidates({ platform: 'linux', home: root(), scoped: true })).toEqual([]);
});

test('discovers macOS Desktop downloads independently of Windows environment', () => {
  const home = root(); const dir = join(home, 'Library/Application Support/Claude/claude-code/2.1.309/abc');
  mkdirSync(dir, { recursive: true }); const file = join(dir, 'claude'); writeFileSync(file, 'fixture'); chmodSync(file, 0o755);
  expect(claudeDesktopCandidates({ platform: 'darwin', home, scoped: true })).toEqual([file]);
});

test.skipIf(process.platform !== 'win32')('shared resolver prefers Desktop and falls back when its download is absent', () => {
  const home = root();
  const cli = runtime(join(home, 'standalone'), '2.1.162');
  withEnvSnapshot(['OD_AGENT_HOME', 'OD_SANDBOX_MODE', 'OD_DATA_DIR'], () => {
    process.env.OD_AGENT_HOME = home; delete process.env.OD_SANDBOX_MODE; delete process.env.OD_DATA_DIR;
    expect(inspectAgentExecutableResolution(claudeAgentDef, { CLAUDE_BIN: cli }).selectedPath).toBe(cli);
    const app = runtime(join(home, 'AppData/Roaming/Claude/claude-code'), '2.1.309');
    expect(inspectAgentExecutableResolution(claudeAgentDef, { CLAUDE_BIN: cli }).selectedPath).toBe(app);
    rmSync(app);
    expect(inspectAgentExecutableResolution(claudeAgentDef, { CLAUDE_BIN: cli }).selectedPath).toBe(cli);
  });
});
