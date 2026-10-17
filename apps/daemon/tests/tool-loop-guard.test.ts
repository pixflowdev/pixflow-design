import { describe, expect, it } from 'vitest';
import {
  createToolLoopGuard,
  isReadOnlyShellCommand,
  resolveToolLoopMode,
} from '../src/tool-loop-guard.js';
import { daemonAgentPayloadToPersistedAgentEvent } from '../src/server.js';

function fail(
  guard: ReturnType<typeof createToolLoopGuard>,
  id: string,
  name: string,
  input: unknown,
) {
  guard.observeToolUse(id, name, input);
  return guard.observeToolResult(id, true, 'failed');
}

function succeed(
  guard: ReturnType<typeof createToolLoopGuard>,
  id: string,
  name: string,
  input: unknown,
) {
  guard.observeToolUse(id, name, input);
  return guard.observeToolResult(id, false, 'ok');
}

describe('tool-loop guard', () => {
  it('warns once when an identical failing action repeats', () => {
    const guard = createToolLoopGuard();
    const verdicts = [];
    for (let index = 0; index < 8; index += 1) {
      const verdict = fail(guard, `failure-${index}`, 'Bash', { command: 'pnpm test' });
      if (verdict) verdicts.push(verdict);
    }
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({
      type: 'tool_loop',
      reason: 'repeated-failure',
      action: 'warn',
      toolName: 'Bash',
      count: 4,
    });
  });

  it('halts at the hard ceiling only when halt mode is enabled', () => {
    const guard = createToolLoopGuard({ mode: 'halt' });
    let finalVerdict = null;
    for (let index = 0; index < 8; index += 1) {
      finalVerdict = fail(guard, `failure-${index}`, 'Edit', {
        file_path: '/page.html',
        old_string: 'missing-target',
      });
    }
    expect(finalVerdict).toMatchObject({ action: 'halt', count: 8 });
    expect(guard.halted).toBe(true);
  });

  it('keeps a repeated failure across read-only checks but clears it after progress', () => {
    const reads = createToolLoopGuard();
    for (let index = 0; index < 4; index += 1) {
      fail(reads, `failure-${index}`, 'Bash', { command: 'pnpm test' });
      succeed(reads, `read-${index}`, 'Read', { file_path: '/page.html' });
    }
    expect(reads.warned).toBe(true);

    const edits = createToolLoopGuard();
    for (let index = 0; index < 8; index += 1) {
      fail(edits, `failure-${index}`, 'Bash', { command: 'pnpm test' });
      succeed(edits, `edit-${index}`, 'Edit', {
        file_path: '/page.html',
        old_string: `case-${index}`,
      });
    }
    expect(edits.warned).toBe(false);
  });

  it('classifies shell reads and mutations conservatively', () => {
    expect(isReadOnlyShellCommand('rg needle src')).toBe(true);
    expect(isReadOnlyShellCommand('env CI=1 sed -i s/a/b/ src/a.ts')).toBe(false);
    expect(resolveToolLoopMode({})).toBe('warn');
    expect(resolveToolLoopMode({ OD_TOOL_LOOP_GUARD: 'HALT' })).toBe('halt');
  });

  it('persists the warning so it survives history replay', () => {
    expect(daemonAgentPayloadToPersistedAgentEvent({
      type: 'tool_loop',
      action: 'warn',
      reason: 'repeated-failure',
      toolName: 'Bash',
      signature: 'Bash pnpm test',
      count: 4,
    })).toMatchObject({
      kind: 'status',
      label: 'warning',
      detail: expect.stringContaining('may be stuck'),
    });
  });
});
