import { describe, expect, it } from 'vitest';
import {
  eventsEndedWithUnfinishedWork,
  stopReasonIsTruncation,
  todoSnapshotHasUnfinishedWork,
  todoStatusIsUnfinished,
} from '../src/api/run-completeness.js';

describe('run completeness', () => {
  it('treats only completed TodoWrite tasks as finished', () => {
    expect(todoStatusIsUnfinished('completed')).toBe(false);
    expect(todoStatusIsUnfinished('pending')).toBe(true);
    expect(todoStatusIsUnfinished('in_progress')).toBe(true);
    expect(todoStatusIsUnfinished('stopped')).toBe(true);
  });

  it('uses the last TodoWrite snapshot', () => {
    expect(eventsEndedWithUnfinishedWork([
      { kind: 'tool_use', name: 'TodoWrite', input: { todos: [{ status: 'pending' }] } },
      { kind: 'tool_use', name: 'update_plan', input: { plan: [{ status: 'completed' }] } },
    ])).toBe(false);
    expect(todoSnapshotHasUnfinishedWork([{ status: 'completed' }, { status: 'stopped' }])).toBe(true);
  });

  it('flags output-limit truncation even without a TodoWrite plan', () => {
    expect(stopReasonIsTruncation('max_tokens')).toBe(true);
    expect(eventsEndedWithUnfinishedWork([{ kind: 'usage', stopReason: 'max_output_tokens' }])).toBe(true);
    expect(eventsEndedWithUnfinishedWork([{ kind: 'text', text: 'done' }])).toBe(false);
  });
});
