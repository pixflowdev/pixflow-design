import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/pixflow/runtime-fetch', () => ({ pixflowRuntimeFetch: vi.fn() }));
import { pixflowRuntimeFetch } from '../../src/pixflow/runtime-fetch';
import { exportSavedMemories, loadSavedMemories, memoryIndexOf, memoryRequest } from '../../src/pixflow/saved-memory';
const fetcher = vi.mocked(pixflowRuntimeFetch);
const result = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => fetcher.mockReset());
it('loads all pages and preserves record identity', async () => {
  fetcher.mockResolvedValueOnce(result({ entries: [{ id: 'one' }], nextCursor: 'page 2', enabled: true }))
    .mockResolvedValueOnce(result({ entries: [{ id: 'two' }], nextCursor: null }));
  expect((await loadSavedMemories()).entries.map(entry => entry.id)).toEqual(['one', 'two']);
  expect(fetcher.mock.calls[1]?.[0]).toContain('cursor=page%202');
});
it('reports failed reads instead of presenting a false empty state', async () => {
  fetcher.mockResolvedValue(result({}, 503));
  await expect(loadSavedMemories()).rejects.toThrow('Could not load memory');
});
it('stops repeated pagination rather than looping forever', async () => {
  fetcher.mockImplementation(async () => result({ entries: [], nextCursor: 'same' }));
  await expect(loadSavedMemories()).rejects.toThrow('pagination');
});
it('exports bodies and configuration without credentials or diagnostic logs', async () => {
  fetcher.mockResolvedValueOnce(result({ enabled: false, chatExtractionEnabled: true, index: 'keep index', entries: [{ id: 'one' }], extraction: { apiKey: 'private' } }))
    .mockResolvedValueOnce(result({ entry: { id: 'one', body: 'keep full text' } }));
  const exported = JSON.parse(await exportSavedMemories());
  expect(exported).toMatchObject({ enabled: false, index: 'keep index', entries: [{ body: 'keep full text' }] });
  expect(exported).not.toHaveProperty('extraction');
});
it('does not expose disabled memory to the floating-panel prompt', () => {
  const entries = [{ id: 'one', name: 'Private preference' }];
  expect(memoryIndexOf({ enabled: false, entries })).toEqual([]);
  expect(memoryIndexOf({ enabled: true, entries })).toHaveLength(1);
});
it('reports stale edits without silently overwriting them', async () => {
  fetcher.mockResolvedValue(result({}, 409));
  await expect(memoryRequest('/one', { method: 'PUT', body: JSON.stringify({ expectedVersion: 2 }) })).rejects.toThrow('another tab');
});
