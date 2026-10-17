import { describe, expect, it } from 'vitest';
import { isSpuriouslyFailedAssistantMessage } from '../../src/runtime/run-reattach';

describe('reload run recovery', () => {
  it('recognizes only the replayable failed-assistant shape', () => {
    const base = { id: 'm1', role: 'assistant', content: '', runStatus: 'failed', runId: 'r1' } as const;
    expect(isSpuriouslyFailedAssistantMessage(base as never)).toBe(true);
    expect(isSpuriouslyFailedAssistantMessage({ ...base, content: 'real failure' } as never)).toBe(false);
    expect(isSpuriouslyFailedAssistantMessage({ ...base, producedFiles: ['x.html'] } as never)).toBe(false);
    expect(isSpuriouslyFailedAssistantMessage({ ...base, runId: undefined } as never)).toBe(false);
  });
});
