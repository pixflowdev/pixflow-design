import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('../../../wordpress/assets/admin/bridge-status.js', import.meta.url), 'utf8');
function fixture() {
  const events = new EventTarget();
  const intervals: Array<() => void> = [];
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, version: '2.1.4' }) }));
  const window = {
    pixflowDesignAdminBridge: { executionMode: 'api', bridgeBaseUrl: 'http://127.0.0.1:17481' },
    navigator: {}, fetch,
    setTimeout: () => 1, clearTimeout: () => {},
    setInterval: (fn: () => void) => { intervals.push(fn); return intervals.length; },
    addEventListener: events.addEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    pixflowDesignBridgeStatus: undefined as undefined | { state: string },
  };
  const document = { readyState: 'complete', visibilityState: 'visible', addEventListener: vi.fn() };
  runInNewContext(source, { window, document, AbortController, CustomEvent, URL, console });
  return { window, fetch, tick: () => intervals.forEach(fn => fn()), mode: (mode: string) => events.dispatchEvent(new CustomEvent('pixflow-design:app-config-changed', { detail: { mode } })) };
}

test('cold API page stays idle, starts health on CLI selection, and stops probing on API return', async () => {
  const f = fixture();
  f.tick();
  expect(f.fetch).not.toHaveBeenCalled();
  f.mode('daemon');
  await vi.waitFor(() => expect(f.window.pixflowDesignBridgeStatus?.state).toBe('connected'));
  expect(f.fetch).toHaveBeenCalledTimes(1);
  f.mode('api'); f.tick();
  expect(f.fetch).toHaveBeenCalledTimes(1);
  f.mode('daemon');
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2));
});
