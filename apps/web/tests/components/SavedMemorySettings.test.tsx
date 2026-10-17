// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/pixflow/runtime-fetch', () => ({ pixflowRuntimeFetch: vi.fn() }));
import { pixflowRuntimeFetch } from '../../src/pixflow/runtime-fetch';
import { SavedMemorySettings } from '../../src/components/SavedMemorySettings';
const fetcher = vi.mocked(pixflowRuntimeFetch);
const entry = { id: 'one', name: 'Site preference', type: 'user', description: 'Summary', body: 'Original body', version: 7 };
const result = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { fetcher.mockReset(); });
afterEach(cleanup);
it('shows a truthful empty state and no internal folders', async () => {
  fetcher.mockResolvedValue(result({ entries: [], enabled: true, chatExtractionEnabled: true, index: '' }));
  render(<SavedMemorySettings />);
  expect(await screen.findByText('No saved memories yet')).toBeTruthy();
  expect(screen.queryByText('Memory tree')).toBeNull();
  expect(screen.getByRole('button', { name: 'Add memory' }).hasAttribute('disabled')).toBe(false);
});
it('retains an unsaved edit when the server rejects a stale version', async () => {
  fetcher.mockImplementation(async (url, init) => {
    if (init?.method === 'PUT') return result({}, 409);
    if (url.endsWith('/one')) return result({ entry });
    return result({ entries: [entry], enabled: true, chatExtractionEnabled: true, index: '' });
  });
  render(<SavedMemorySettings />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Site preference' }));
  const body = await screen.findByLabelText('What should be remembered?');
  fireEvent.change(body, { target: { value: 'My unsaved edit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save memory' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect((body as HTMLTextAreaElement).value).toBe('My unsaved edit');
  const update = fetcher.mock.calls.find(([, init]) => init?.method === 'PUT');
  expect(JSON.parse(String(update?.[1]?.body)).expectedVersion).toBe(7);
});
it('requires an explicit delete confirmation and preserves content on cancel', async () => {
  fetcher.mockImplementation(async url => result(url.endsWith('/one') ? { entry } : { entries: [entry], enabled: true, index: '' }));
  render(<SavedMemorySettings />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Site preference' }));
  await screen.findByRole('button', { name: 'Delete memory' });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete memory' })).toBeNull());
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
});
