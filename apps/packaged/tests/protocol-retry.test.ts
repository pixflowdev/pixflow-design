import { describe, expect, it } from 'vitest';

import { fetchOdTargetWithTransientRetry } from '../src/protocol-retry.js';

describe('od:// transient proxy retry', () => {
  const noDelay = { delay: async () => {} };

  it('retries GET requests and returns the eventual response', async () => {
    let calls = 0;
    const response = await fetchOdTargetWithTransientRetry(
      new Request('od://app/'),
      'http://127.0.0.1:17579/',
      async () => {
        calls += 1;
        if (calls === 1) throw new Error('setTypeOfService EINVAL');
        return new Response('ok');
      },
      noDelay,
    );
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('bounds retries and never replays POST requests', async () => {
    let getCalls = 0;
    await expect(fetchOdTargetWithTransientRetry(
      new Request('od://app/'),
      'http://127.0.0.1:17579/',
      async () => {
        getCalls += 1;
        throw new Error('socket hang up');
      },
      noDelay,
    )).rejects.toThrow('socket hang up');
    expect(getCalls).toBe(3);

    let postCalls = 0;
    await expect(fetchOdTargetWithTransientRetry(
      new Request('od://app/api/action', { method: 'POST' }),
      'http://127.0.0.1:17579/api/action',
      async () => {
        postCalls += 1;
        throw new Error('socket hang up');
      },
      noDelay,
    )).rejects.toThrow('socket hang up');
    expect(postCalls).toBe(1);
  });

  it('does not retry resolved upstream errors', async () => {
    let calls = 0;
    const response = await fetchOdTargetWithTransientRetry(
      new Request('od://app/'),
      'http://127.0.0.1:17579/',
      async () => {
        calls += 1;
        return new Response('unavailable', { status: 503 });
      },
      noDelay,
    );
    expect(response.status).toBe(503);
    expect(calls).toBe(1);
  });
});
