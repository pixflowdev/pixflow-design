import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { directWorkspaceRoot, isManagedDirectWorkspace } from '../../src/pixflow/direct-workspace-path.js';

describe('direct workspace paths', () => {
  const home = 'C:\\Users\\tim';
  const data = home + '\\AppData\\Roaming\\Pixflow Design Bridge\\namespaces\\release-stable-win\\data\\sites\\' + 'a'.repeat(64) + '\\od';
  it('leaves room for Claude transcript suffixes and native Windows command execution', () => {
    const root = directWorkspaceRoot(data, 'win32', home);
    const cwd = path.win32.join(root, 'run-ABC123');
    const transcript = path.win32.join(home, '.claude', 'projects', cwd.replace(/[^a-z0-9]/gi, '-'), 'a'.repeat(36), 'tool-results');
    expect(transcript.length).toBeLessThan(200);
    expect(root).not.toContain('AppData');
  });
  it('isolates sites and namespaces while surviving restarts and casing changes', () => {
    const root = directWorkspaceRoot(data, 'win32', home);
    expect(directWorkspaceRoot(data.toUpperCase(), 'win32', home)).toBe(root);
    expect(directWorkspaceRoot(data + '-other', 'win32', home)).not.toBe(root);
    expect(directWorkspaceRoot(data.replace('stable', 'beta'), 'win32', home)).not.toBe(root);
    expect(directWorkspaceRoot('/tmp/site', 'linux')).toBe(path.join('/tmp/site', 'direct-site-runs'));
  });
  it('only permits generated immediate children for cleanup', () => {
    const root = path.resolve('fixture-runs');
    expect(isManagedDirectWorkspace(path.join(root, 'run-ABC123'), [root])).toBe(true);
    for (const entry of [root, path.join(root, 'run-ABC123', 'nested'), path.resolve('run-elsewhere'), path.join(root, 'run-')]) {
      expect(isManagedDirectWorkspace(entry, [root])).toBe(false);
    }
  });
});
