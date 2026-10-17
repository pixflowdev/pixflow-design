import { describe, expect, it } from 'vitest';
import { isSubstantiveAgentOutput } from '../src/run-output.js';

describe('structured run output completion', () => {
  it('does not treat reasoning or tool-only activity as a completed response', () => {
    expect(isSubstantiveAgentOutput({ type: 'thinking_delta', delta: 'inspect first' })).toBe(false);
    expect(isSubstantiveAgentOutput({ type: 'tool_use', name: 'Read' })).toBe(false);
    expect(isSubstantiveAgentOutput({ type: 'tool_result', output: 'file contents' })).toBe(false);
  });

  it('accepts assistant text and artifact deliverables', () => {
    expect(isSubstantiveAgentOutput({ type: 'text_delta', delta: 'Done' })).toBe(true);
    expect(isSubstantiveAgentOutput({ type: 'artifact', path: 'prototype.html' })).toBe(true);
  });
});
