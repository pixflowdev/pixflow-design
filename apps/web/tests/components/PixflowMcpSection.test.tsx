// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PixflowMcpSection } from '../../src/components/PixflowMcpSection';
const request = vi.hoisted(() => vi.fn());
const context = vi.hoisted(() => ({ userId: 0, restBaseUrl: 'https://site.test/wp-json' }));
vi.mock('../../src/pixflow/wordpress-context', () => ({ getPixflowWordPressConfig: () => context }));
vi.mock('../../src/pixflow/license', () => ({ requestWordPressRest: request }));
beforeEach(() => { context.userId++; });
afterEach(() => { cleanup(); request.mockReset(); vi.restoreAllMocks(); });
const family = { id: 'acf', label: 'ACF', description: 'Custom fields', available: true, capabilities: [{ id: 'acf/read', label: 'Read field groups' }, { id: 'acf/write', label: 'Update field values' }] };
it('reuses metadata on remount and visibility changes but explicitly refreshes', async () => {
  request.mockResolvedValue({ ok: true, body: { families: [family], unavailable: [] } });
  const first = render(<PixflowMcpSection />);
  await screen.findByText('ACF');
  first.unmount();
  render(<PixflowMcpSection />);
  expect(screen.getByText('ACF')).toBeTruthy();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(false));
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
});
it('coalesces an unfinished load across remount and visibility changes', async () => {
  let resolve!: (value: unknown) => void;
  request.mockImplementation(() => new Promise(done => { resolve = done; }));
  const first = render(<PixflowMcpSection />);
  first.unmount();
  render(<PixflowMcpSection />);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  expect(request).toHaveBeenCalledTimes(1);
  resolve({ ok: true, body: { families: [family], unavailable: [] } });
  await screen.findByText('ACF');
  expect(request).toHaveBeenCalledTimes(1);
});
it('expires metadata after thirty seconds and isolates a new user context', async () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  request.mockResolvedValue({ ok: true, body: { families: [family], unavailable: [] } });
  const first = render(<PixflowMcpSection />);
  await screen.findByText('ACF');
  clock.mockReturnValue(now + 30_001);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  first.unmount();
  context.userId++;
  request.mockResolvedValue({ ok: true, body: { families: [], unavailable: [] } });
  render(<PixflowMcpSection />);
  expect(screen.queryByText('ACF')).toBeNull();
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
});
it('reads actual abilities, without skill endpoints or enable switches', async () => {
  request.mockResolvedValue({ ok: true, body: { families: [family], unavailable: [{ id: 'bricks', label: 'Bricks Builder', reason: 'inactive' }] } });
  render(<PixflowMcpSection surface="wp_admin" />);
  await screen.findByText('ACF');
  expect(request).toHaveBeenCalledWith('wp-admin/capabilities', { method: 'GET' });
  expect(screen.getByText('Read field groups')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.getByText('Inactive')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Update field' } });
  expect(screen.getByText('Update field values')).toBeTruthy();
  expect(screen.queryByText('Read field groups')).toBeNull();
});
it('refreshes integration availability from the server', async () => {
  request.mockResolvedValueOnce({ ok: true, body: { families: [family], unavailable: [] } })
    .mockResolvedValueOnce({ ok: true, body: { families: [], unavailable: [{ id: 'acf', label: 'ACF', reason: 'inactive' }] } });
  render(<PixflowMcpSection />);
  await screen.findByText('Active');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText('Inactive');
  expect(screen.queryByText('Active')).toBeNull();
});
it('shows a request failure instead of pretending there are no abilities', async () => {
  request.mockResolvedValue({ ok: false, body: { message: 'Session expired' } });
  render(<PixflowMcpSection />);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Session expired'));
  expect(screen.queryByText('No active abilities were reported by this site.')).toBeNull();
});
it('shows plan-locked integrations as disabled Pro metadata without executable controls', async () => {
  request.mockResolvedValue({ ok: true, body: { families: [], unavailable: [
    { id: 'etch', label: 'Etch', reason: 'inactive', requiresPro: true },
    { id: 'bricks', label: 'Bricks', reason: 'inactive', requiresPro: false },
  ] } });
  render(<PixflowMcpSection />);
  const etch = await screen.findByText('Etch');
  expect(etch.closest('[aria-disabled="true"]')).toBeTruthy();
  expect(screen.getAllByText('Pro')).toHaveLength(1);
  expect(screen.getByText('Inactive')).toBeTruthy();
  expect(screen.getByText('Requires Pixflow Design Pro')).toBeTruthy();
  expect(screen.queryByRole('switch')).toBeNull();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'etch' } });
  expect(etch.closest('details')?.open).toBe(true);
  expect(screen.queryByText('Bricks')).toBeNull();
});
