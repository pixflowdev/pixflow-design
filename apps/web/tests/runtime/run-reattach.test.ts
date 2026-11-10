import { describe, expect, it } from 'vitest';
import { isDaemonRecoveryMessage, isSpuriouslyFailedAssistantMessage } from '../../src/runtime/run-reattach';

describe('reload run recovery', () => {
  it('does not fail another panel’s active Direct run when daemon run discovery has no match', () => {
    const direct = { id: 'direct:1793583024888', role: 'assistant', content: 'Reading the pages.', runStatus: 'running' } as const;
    expect(isDaemonRecoveryMessage(direct)).toBe(false);
    expect(isDaemonRecoveryMessage({ ...direct, runStatus: 'failed' })).toBe(false);
    expect(isDaemonRecoveryMessage({ ...direct, id: 'workspace-message' })).toBe(true);
    expect(isDaemonRecoveryMessage({ ...direct, role: 'user' })).toBe(false);
  });
  it('recognizes only the replayable failed-assistant shape', () => {
    const base = { id: 'm1', role: 'assistant', content: '', runStatus: 'failed', runId: 'r1' } as const;
    expect(isSpuriouslyFailedAssistantMessage(base as never)).toBe(true);
    expect(isSpuriouslyFailedAssistantMessage({ ...base, content: 'real failure' } as never)).toBe(false);
    expect(isSpuriouslyFailedAssistantMessage({ ...base, producedFiles: ['x.html'] } as never)).toBe(false);
    expect(isSpuriouslyFailedAssistantMessage({ ...base, runId: undefined } as never)).toBe(false);
  });
});
