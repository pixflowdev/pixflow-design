import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAmrModels, fetchChatRunStatus } from '../../src/providers/daemon';

describe.skip('fetchAmrModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns AMR model cache payloads from the daemon', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        source: 'preset',
        models: [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
        refreshing: true,
      }), { status: 200 })),
    );

    await expect(fetchAmrModels()).resolves.toEqual({
      source: 'preset',
      models: [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
      refreshing: true,
    });
    expect(fetch).toHaveBeenCalledWith('/api/amr/models', { cache: 'no-store' });
  });

  it('routes daemon-owned endpoints through the configured WordPress bridge URL', async () => {
    vi.stubGlobal('window', {
      __PIXFLOW_DESIGN_WORDPRESS__: {
        bridgeBaseUrl: 'http://127.0.0.1:7456/',
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        run: { id: 'run-1', status: 'running' },
      }), { status: 200 })),
    );

    await fetchChatRunStatus('run-1');

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:7456/api/runs/run-1');
  });

  it('returns null when the daemon does not return AMR models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    await expect(fetchAmrModels()).resolves.toBeNull();
  });
});
