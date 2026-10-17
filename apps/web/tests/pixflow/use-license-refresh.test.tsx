// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { usePixflowLicenseRefresh } from '../../src/pixflow/use-license-refresh';
const refresh = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('../../src/pixflow/license', () => ({ fetchPixflowLicenseStatus: refresh, isPixflowWordPressEmbed: () => true }));
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); document.body.innerHTML = ''; });
it('shares refresh listeners across floating roots and reconciles returning to the tab without a reload', async () => {
  function Host() { usePixflowLicenseRefresh(); return <input defaultValue="Unsaved" />; }
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(<><Host /><Host /></>));
  expect(refresh).toHaveBeenCalledTimes(1);
  const input = node.querySelector('input')!; input.value = 'Keep my draft';
  await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenLastCalledWith({ force: true });
  expect(node.querySelector('input')).toBe(input); expect(input.value).toBe('Keep my draft');
  await act(async () => root.unmount());
  window.dispatchEvent(new Event('focus'));
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('refreshes on interaction when an embedded browser omits focus events, without fetching on every click', async () => {
  vi.useFakeTimers();
  function SettingsPortal() { usePixflowLicenseRefresh(); return <button>Skills</button>; }
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(<SettingsPortal />));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => { document.dispatchEvent(new Event('pointerdown')); document.dispatchEvent(new Event('keydown')); });
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(30_001); document.dispatchEvent(new Event('pointerdown')); });
  expect(refresh).toHaveBeenCalledTimes(2);
  await act(async () => { document.dispatchEvent(new Event('pointerdown')); document.dispatchEvent(new Event('keydown')); });
  expect(refresh).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
  vi.advanceTimersByTime(30_001); document.dispatchEvent(new Event('pointerdown'));
  expect(refresh).toHaveBeenCalledTimes(2);
});

it('publishes current status when settings mount after the floating panel already refreshed', async () => {
  function Host() { usePixflowLicenseRefresh(); return null; }
  const floatingNode = document.createElement('div'); const settingsNode = document.createElement('div');
  document.body.append(floatingNode, settingsNode);
  const floating = createRoot(floatingNode); const settings = createRoot(settingsNode);
  await act(async () => floating.render(<Host />));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => settings.render(<Host />));
  expect(refresh).toHaveBeenCalledTimes(2);
  await act(async () => { floating.unmount(); settings.unmount(); });
});
