// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { PixflowFeatureRuntime } from '@open-design/contracts';
import { refreshPixflowFeatureRuntime, usePixflowFeatureRuntime, pixflowFeatureEnabled, validateFeatureRuntime, loadPixflowFeature, pixflowFeatureAdvertised, usePixflowFeatureAsset } from '../../src/pixflow/feature-runtime';

const base = 'http://localhost/wp-content/plugins/pixflow-design-pro/assets/app/';
const state = (active = true): PixflowFeatureRuntime => ({ schema: 'pixflow.feature-runtime.v1', features: active ? ['assets', 'audio'] : [], builders: { bricks: active, etch: false, elementor: false, generateblocks: false }, assets: [] });
beforeEach(() => {
  Object.assign(window, { __PIXFLOW_DESIGN_WORDPRESS__: { restBaseUrl: 'http://localhost/wp-json/pixflow-design/v1', restNonce: 'test' }, __PIXFLOW_FEATURE_RUNTIME__: undefined, __PIXFLOW_FEATURE_RUNTIME_REVISION__: 0, __PIXFLOW_FEATURE_ASSETS__: new Map() });
});
afterEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('live Pro feature refresh', () => {
  it('does not publish a new capability revision for an unchanged server manifest', async () => {
    const listener = vi.fn(); window.addEventListener('pixflow-design:feature-runtime-changed', listener);
    await refreshPixflowFeatureRuntime(async () => ({ ok: true, body: state() }));
    await refreshPixflowFeatureRuntime(async () => ({ ok: true, body: state() }));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('pixflow-design:feature-runtime-changed', listener);
  });
  it('updates every subscribed surface without replacing its state or unsaved input', async () => {
    function Surface() { usePixflowFeatureRuntime(); return <><input defaultValue="Unsaved brief" /><span>{pixflowFeatureEnabled('audio') ? 'Pro' : 'Free'}</span></>; }
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    await refreshPixflowFeatureRuntime(async () => ({ ok: true, body: state(false) }));
    await act(async () => root.render(<Surface />));
    const input = host.querySelector('input')!; input.value = 'My work';
    await act(async () => refreshPixflowFeatureRuntime(async () => ({ ok: true, body: state() })));
    expect(host.textContent).toBe('Pro'); expect(host.querySelector('input')).toBe(input); expect(input.value).toBe('My work');
    expect(window.__PIXFLOW_DESIGN_WORDPRESS__).toMatchObject({ bricksIntegrationActive: true });
    await act(async () => root.unmount());
  });
  it('loads styles before scripts, deduplicates assets, and can retry a failed download', async () => {
    const manifest = state(); manifest.assets = [{ handle: 'pixflow-audio', kind: 'script', url: `${base}pixflow-audio.js?ver=2` }, { handle: 'pixflow-audio', kind: 'style', url: `${base}pixflow-audio.css?ver=2` }];
    const appended: string[] = []; let fail = true;
    const original = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      const element = node as HTMLScriptElement | HTMLLinkElement;
      appended.push(element.tagName); const result = original(node);
      queueMicrotask(() => element.dispatchEvent(new Event(fail && element.tagName === 'SCRIPT' ? 'error' : 'load')));
      return result;
    });
    await expect(refreshPixflowFeatureRuntime(async () => ({ ok: true, body: manifest }))).rejects.toThrow('work are unchanged');
    expect(appended).toEqual(['LINK', 'SCRIPT']);
    fail = false;
    await refreshPixflowFeatureRuntime(async () => ({ ok: true, body: manifest }));
    await refreshPixflowFeatureRuntime(async () => ({ ok: true, body: manifest }));
    expect(appended).toEqual(['LINK', 'SCRIPT', 'SCRIPT']);
  });
  it('never applies an older response after reset or a newer activation', async () => {
    let current = true; let resolve!: (value: { ok: boolean; body: unknown }) => void;
    const pending = refreshPixflowFeatureRuntime(() => new Promise(done => { resolve = done; }), () => current);
    current = false;
    await refreshPixflowFeatureRuntime(async () => ({ ok: true, body: state(false) }));
    resolve({ ok: true, body: state() }); await pending;
    expect(pixflowFeatureEnabled('assets')).toBe(false);
  });
  it.each(['https://evil.test/pixflow-design-pro/assets/app/pixflow-assets.js', `${base}../../other.js`, `${base}pixflow-assets.php`, 'javascript:alert(1)'])('rejects unexpected asset URLs: %s', url => {
    const manifest = state(); manifest.assets = [{ handle: 'pixflow-assets', kind: 'script', url }];
    expect(() => validateFeatureRuntime(manifest, 'http://localhost')).toThrow();
  });
});


describe('on-demand feature assets', () => {
  const manifest = () => ({ ...state(), assets: [
    { handle: 'pixflow-assets', kind: 'script' as const, url: `${base}pixflow-assets.js?ver=4` },
    { handle: 'pixflow-assets', kind: 'style' as const, url: `${base}pixflow-assets.css?ver=4` },
  ] });
  it('advertises authorized settings without downloading them during refresh', async () => {
    await refreshPixflowFeatureRuntime(async () => ({ ok: true, body: manifest() }));
    expect(pixflowFeatureAdvertised('assets', 'pixflow-assets')).toBe(true);
    expect(document.head.querySelectorAll('script,link')).toHaveLength(0);
    await refreshPixflowFeatureRuntime(async () => ({ ok: true, body: state(false) }));
    expect(pixflowFeatureAdvertised('assets', 'pixflow-assets')).toBe(false);
    await loadPixflowFeature('pixflow-assets');
    expect(document.head.querySelectorAll('script,link')).toHaveLength(0);
  });
  it('deduplicates simultaneous consumers, loads styles first, and retries a failure', async () => {
    await refreshPixflowFeatureRuntime(async () => ({ ok: true, body: manifest() }));
    const appended: string[] = []; let fail = true;
    const original = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      const element = node as HTMLElement; appended.push(element.tagName);
      const result = original(node);
      queueMicrotask(() => element.dispatchEvent(new Event(fail && element.tagName === 'SCRIPT' ? 'error' : 'load')));
      return result;
    });
    const failures = await Promise.allSettled([loadPixflowFeature('pixflow-assets'), loadPixflowFeature('pixflow-assets')]);
    expect(failures.map(result => result.status)).toEqual(['rejected', 'rejected']);
    expect(appended).toEqual(['LINK', 'SCRIPT']);
    fail = false;
    await Promise.all([loadPixflowFeature('pixflow-assets'), loadPixflowFeature('pixflow-assets')]);
    expect(appended).toEqual(['LINK', 'SCRIPT', 'SCRIPT']);
  });
  it('renders the ready contribution without remounting surrounding user input', async () => {
    await refreshPixflowFeatureRuntime(async () => ({ ok: true, body: manifest() }));
    const original = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      const result = original(node); queueMicrotask(() => node.dispatchEvent(new Event('load'))); return result;
    });
    function Surface() { const status = usePixflowFeatureAsset('pixflow-assets'); return <><input defaultValue="draft"/><span>{status.loading ? 'Loading' : 'Ready'}</span></>; }
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<Surface/>));
    const input = host.querySelector('input');
    expect(host.textContent).toBe('Ready');
    await act(async () => refreshPixflowFeatureRuntime(async () => ({ ok: true, body: state(false) })));
    expect(host.querySelector('input')).toBe(input);
    expect(input?.value).toBe('draft');
    await act(async () => root.unmount());
  });
});
