import { describe, expect, it } from 'vitest';
import { recoverDirectRunMessages } from '../../src/pixflow/direct-run-history';

describe('reconnecting an owned direct run', () => {
  it('keeps hydrated revisions, replies and messages instead of restoring the start snapshot', () => {
    const current = [{ id: 'reply', content: 'Partial reply', historyRevision: 8 }, { id: 'later', content: 'Keep me' }];
    expect(recoverDirectRunMessages(current, [{ id: 'reply', content: '', historyRevision: 1 }], 'reply')).toBe(current);
  });
  it('recovers only the missing owned reply, without resurrecting older transcript rows', () => {
    const reply = { id: 'reply', content: '' };
    expect(recoverDirectRunMessages([{ id: 'current', content: 'Keep' }], [{ id: 'old', content: 'Old' }, reply], 'reply'))
      .toEqual([{ id: 'current', content: 'Keep' }, reply]);
  });
});
