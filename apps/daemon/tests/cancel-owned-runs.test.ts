import { describe, expect, it, vi } from 'vitest';

import { cancelRunsOwnedBy } from '../src/cancel-owned-runs.js';
import { createChatRunService } from '../src/runs.js';

function makeRunService() {
  return createChatRunService({
    createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

describe('cancelRunsOwnedBy', () => {
  it('cancels only active runs owned by the selected project', async () => {
    const runs = makeRunService();
    const mine = runs.create({ projectId: 'p1', conversationId: 'c1' });
    const other = runs.create({ projectId: 'p2', conversationId: 'c2' });

    await cancelRunsOwnedBy(runs, { projectId: 'p1' });

    expect(mine.status).toBe('canceled');
    expect(other.status).toBe('queued');
    expect(runs.list({ projectId: 'p1', status: 'active' })).toEqual([]);
  });

  it('scopes cancellation to one conversation', async () => {
    const runs = makeRunService();
    const mine = runs.create({ projectId: 'p1', conversationId: 'c1' });
    const sibling = runs.create({ projectId: 'p1', conversationId: 'c2' });

    await cancelRunsOwnedBy(runs, { conversationId: 'c1' });

    expect(mine.status).toBe('canceled');
    expect(sibling.status).toBe('queued');
  });
});
