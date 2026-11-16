// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BridgeUpdateAction } from '../../src/pixflow/bridge-update-action';
import { ensurePixflowOptionalBridgeSiteContext, pixflowOptionalBridgeJson, probePixflowOptionalBridge } from '../../src/pixflow/optional-bridge';
import { pixflowWordPressRestFetch } from '../../src/pixflow/runtime-fetch';

vi.mock('../../src/pixflow/optional-bridge', () => ({
  probePixflowOptionalBridge: vi.fn(),
  pixflowOptionalBridgeJson: vi.fn(),
  ensurePixflowOptionalBridgeSiteContext: vi.fn(),
}));
vi.mock('../../src/pixflow/runtime-fetch', () => ({ pixflowWordPressRestFetch: vi.fn() }));

beforeEach(() => { sessionStorage.clear(); vi.resetAllMocks(); });
afterEach(cleanup);

it('uses the existing installer download for a Bridge without local update support', async () => {
  vi.mocked(probePixflowOptionalBridge).mockResolvedValue({ available: true, version: '2.3.2', status: 'ready' });
  const onDownload = vi.fn();
  render(<BridgeUpdateAction onDownload={onDownload} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Download update' }));
  expect(onDownload).toHaveBeenCalledOnce();
  expect(pixflowWordPressRestFetch).not.toHaveBeenCalled();
});

it('requests a scoped ticket on click and never sends installer URLs to the Bridge', async () => {
  vi.mocked(probePixflowOptionalBridge).mockResolvedValue({ available: true, version: '2.3.3', status: 'ready', windowsUpdate: true });
  vi.mocked(pixflowOptionalBridgeJson).mockResolvedValueOnce({ state: 'idle' }).mockResolvedValueOnce({ state: 'checking' });
  vi.mocked(pixflowWordPressRestFetch).mockResolvedValue(Response.json({ token: 'update-ticket' }));
  render(<BridgeUpdateAction />);
  const button = await screen.findByRole('button', { name: 'Install and restart' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  expect(pixflowWordPressRestFetch).not.toHaveBeenCalled();
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(pixflowOptionalBridgeJson).toHaveBeenLastCalledWith('pixflow/bridge-update', {
    method: 'POST', headers: { Authorization: 'Bearer update-ticket' },
  }, { timeoutMs: 12_000 }));
  expect(pixflowWordPressRestFetch).toHaveBeenCalledExactlyOnceWith('/wp-admin/direct/sessions', expect.objectContaining({
    body: JSON.stringify({ purpose: 'bridge-update' }),
  }));
  expect(screen.getByRole('status').textContent).toContain('Installing and restarting');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it('recognizes a healthy replacement even if it has no updater route', async () => {
  sessionStorage.setItem('pixflow:windows-bridge-update', JSON.stringify({ version: '2.3.1', started: Date.now() }));
  vi.mocked(probePixflowOptionalBridge).mockResolvedValue({ available: true, version: '2.3.2', status: 'ready' });
  vi.mocked(pixflowOptionalBridgeJson).mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
  const connected = vi.fn();
  window.addEventListener('pixflow-design:bridge-status', connected, { once: true });
  try {
    render(<BridgeUpdateAction />);
    await waitFor(() => expect(connected).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ version: '2.3.2', running: true }),
    })), { timeout: 3000 });
    expect(sessionStorage.getItem('pixflow:windows-bridge-update')).toBeNull();
  } finally {
    window.removeEventListener('pixflow-design:bridge-status', connected);
  }
});

it('reconnects a fresh Bridge that has not selected the WordPress site', async () => {
  sessionStorage.setItem('pixflow:windows-bridge-update', JSON.stringify({ version: '2.3.1', started: Date.now() }));
  vi.mocked(probePixflowOptionalBridge)
    .mockResolvedValueOnce({ available: false, status: 'missing' })
    .mockResolvedValue({ available: true, version: '2.3.2', status: 'ready' });
  vi.mocked(pixflowOptionalBridgeJson).mockRejectedValue(Object.assign(new Error('Site not connected'), { status: 409 }));
  vi.mocked(ensurePixflowOptionalBridgeSiteContext).mockResolvedValue(undefined);
  render(<BridgeUpdateAction />);
  await waitFor(() => expect(ensurePixflowOptionalBridgeSiteContext).toHaveBeenCalledExactlyOnceWith({ timeoutMs: 12_000 }), { timeout: 3000 });
  await waitFor(() => expect(sessionStorage.getItem('pixflow:windows-bridge-update')).toBeNull());
});
