import { afterEach, describe, expect, it, vi } from 'vitest';

import { withPixflowTimeout } from '../../src/pixflow/bricks-initial-insert';

describe('HTML-to-Bricks framework preflight', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('continues with the safe fallback when the optional live route fetch times out', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pending = new Promise<Record<string, unknown>>(() => undefined);
    const fallback = { status: 'unavailable', libraryMappingAllowed: false };

    const result = withPixflowTimeout(pending, 4_000, fallback, 'HTML-to-Bricks live route');
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(result).resolves.toEqual(fallback);
  });
});
