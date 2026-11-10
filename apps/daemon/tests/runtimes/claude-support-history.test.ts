import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { ClaudeSupportHistory } from '../../src/runtimes/claude-support-history.js';
import { ClaudeSignIn } from '../../src/runtimes/claude-sign-in.js';

test('last Pixflow-owned login failure survives a fresh Bridge instance and is site scoped', () => {
  const dir = mkdtempSync(join(tmpdir(),'pixflow-support-'));
  const deps = { resolve: () => null, launch: () => { throw Error(); }, verify: async () => false, stop: async () => {}, timeoutMs: 500 };
  try {
    const login = new ClaudeSignIn(deps, new ClaudeSupportHistory(dir));
    login.start('SITE-SENSITIVE-A');
    const restarted = new ClaudeSignIn(deps, new ClaudeSupportHistory(dir));
    expect(restarted.diagnostics('SITE-SENSITIVE-A')).toMatchObject({ state:'previous-session', storage:'private-file',
      milestones:[{stage:'start-requested'},{stage:'no-supported-login-runtime'}] });
    expect(restarted.diagnostics('other').milestones).toEqual([]);
    expect(readFileSync(join(dir,'pixflow-claude-support.json'),'utf8')).not.toContain('SITE-SENSITIVE');
    const history = new ClaudeSupportHistory(dir);
    for (let i=0; i<135; i++) history.append('other','desktop',{at:new Date().toISOString(),stage:'launch-failed'});
    expect(JSON.parse(readFileSync(join(dir,'pixflow-claude-support.json'),'utf8'))).toHaveLength(128);
    expect(history.snapshot('other').milestones).toHaveLength(32);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
