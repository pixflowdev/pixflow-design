import { useEffect, useState, useSyncExternalStore } from 'react';
import type { PixflowFeatureRuntime } from '@open-design/contracts';
import { getPixflowWordPressConfig } from './wordpress-context';
import { detectInitialLocale, translateLocale } from '../i18n';

export const PIXFLOW_FEATURE_RUNTIME_CHANGED = 'pixflow-design:feature-runtime-changed';
export const PIXFLOW_LICENSE_CHANGED = 'pixflow-design:license-changed';
const refreshError = () => new Error(translateLocale(detectInitialLocale(), 'license.featureRefreshError'));
type RuntimeWindow = Window & {
  __PIXFLOW_FEATURE_RUNTIME__?: PixflowFeatureRuntime;
  __PIXFLOW_FEATURE_RUNTIME_REVISION__?: number;
  __PIXFLOW_FEATURE_ASSETS__?: Map<string, Promise<void>>;
  __PIXFLOW_FEATURE_REQUEST__?: number;
};

/** Loaded implementations are not grants. The server still authorizes every operation. */
export function pixflowFeatureEnabled(id: string): boolean {
  return typeof window === 'undefined' || !(window as RuntimeWindow).__PIXFLOW_FEATURE_RUNTIME__
    || (window as RuntimeWindow).__PIXFLOW_FEATURE_RUNTIME__!.features.includes(id);
}

function subscribe(listener: () => void) {
  window.addEventListener(PIXFLOW_FEATURE_RUNTIME_CHANGED, listener);
  return () => window.removeEventListener(PIXFLOW_FEATURE_RUNTIME_CHANGED, listener);
}
export function usePixflowFeatureRuntime(): number {
  return useSyncExternalStore(subscribe, () => (window as RuntimeWindow).__PIXFLOW_FEATURE_RUNTIME_REVISION__ ?? 0, () => 0);
}

export function validateFeatureRuntime(value: unknown, siteUrl: string): PixflowFeatureRuntime {
  const state = value as PixflowFeatureRuntime;
  if (!state || state.schema !== 'pixflow.feature-runtime.v1' || !Array.isArray(state.features)
    || state.features.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id))
    || !state.builders || ['bricks', 'etch', 'elementor', 'generateblocks'].some(id => typeof (state.builders as Record<string, unknown>)[id] !== 'boolean')
    || !Array.isArray(state.assets) || state.assets.length > 40) throw refreshError();
  for (const asset of state.assets) {
    const url = new URL(asset.url, siteUrl);
    if (url.origin !== new URL(siteUrl).origin || url.username || url.password
      || !['script', 'style'].includes(asset.kind) || !/^pixflow-[a-z0-9-]+$/.test(asset.handle)
      || !/\/pixflow-design-pro\/assets\/app\/pixflow-[a-z0-9-]+\.(?:js|css)$/.test(url.pathname)
      || !url.pathname.endsWith(asset.kind === 'script' ? '.js' : '.css')) throw refreshError();
  }
  return state;
}

/** Keep this set aligned with FeatureRuntime::DEFERRED_HANDLES in WordPress. */
export const DEFERRED_FEATURE_HANDLES = new Set(['pixflow-workspace', 'pixflow-planning', 'pixflow-custom-skills', 'pixflow-assets', 'pixflow-bricks-agent', 'pixflow-bricks-settings', 'pixflow-composio']);

/** An advertised implementation can be available before its code has been downloaded. */
export function pixflowFeatureAdvertised(feature: string, handle: string): boolean {
  if (typeof window === 'undefined' || !pixflowFeatureEnabled(feature)) return false;
  return (window as RuntimeWindow).__PIXFLOW_FEATURE_RUNTIME__?.assets.some(asset => asset.handle === handle && asset.kind === 'script') ?? false;
}

export async function loadPixflowFeature(handle: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const state = (window as RuntimeWindow).__PIXFLOW_FEATURE_RUNTIME__;
  if (!state) return;
  const config = getPixflowWordPressConfig();
  validateFeatureRuntime(state, config?.siteUrl || config?.restBaseUrl || window.location.href);
  const assets = state.assets.filter(asset => asset.handle === handle);
  // CSS first prevents a flash of unstyled UI. Assets are shared across roots.
  for (const asset of [...assets.filter(item => item.kind === 'style'), ...assets.filter(item => item.kind === 'script')]) {
    if ((window as RuntimeWindow).__PIXFLOW_FEATURE_RUNTIME__ !== state) return;
    await loadAsset(asset);
  }
}

/** Mounting a feature requests its code, without replacing any surrounding chat state. */
export function usePixflowFeatureAsset(handle: string, enabled = true) {
  const revision = usePixflowFeatureRuntime();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ loading: boolean; error: boolean }>({ loading: true, error: false });
  useEffect(() => {
    let current = true;
    if (!enabled) { setResult({ loading: false, error: false }); return; }
    setResult({ loading: true, error: false });
    void loadPixflowFeature(handle).then(() => {
      if (current) setResult({ loading: false, error: false });
    }, () => { if (current) setResult({ loading: false, error: true }); });
    return () => { current = false; };
  }, [handle, revision, attempt, enabled]);
  return { ...result, retry: () => setAttempt(value => value + 1) };
}

async function loadAsset(asset: PixflowFeatureRuntime['assets'][number]): Promise<void> {
  const scope = window as RuntimeWindow;
  const loaded = scope.__PIXFLOW_FEATURE_ASSETS__ ??= new Map();
  const key = `${asset.kind}:${asset.url}`;
  if (loaded.has(key)) return loaded.get(key)!;
  // PHP may have loaded this exact contribution before React mounted.
  const existing = Array.from(document.querySelectorAll(asset.kind === 'script' ? 'script[src]' : 'link[rel="stylesheet"]'))
    .some(node => new URL(node.getAttribute(asset.kind === 'script' ? 'src' : 'href') || '', document.baseURI).href === new URL(asset.url, document.baseURI).href);
  if (existing) return;
  const promise = new Promise<void>((resolve, reject) => {
    const node = document.createElement(asset.kind === 'script' ? 'script' : 'link');
    const timeout = window.setTimeout(() => fail(), 15_000);
    const fail = () => { window.clearTimeout(timeout); node.remove(); reject(refreshError()); };
    node.onload = () => { window.clearTimeout(timeout); resolve(); };
    node.onerror = fail;
    if (node instanceof HTMLScriptElement) { node.src = asset.url; node.async = false; }
    else { node.rel = 'stylesheet'; node.href = asset.url; }
    document.head.appendChild(node);
  });
  loaded.set(key, promise);
  try { await promise; } catch (error) { loaded.delete(key); throw error; }
}

/** Load only server-selected installed modules; preserve mounted chats and unsaved editors. */
export async function refreshPixflowFeatureRuntime(
  request: () => Promise<{ ok: boolean; body: unknown }>,
  current: () => boolean = () => true,
): Promise<void> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function' || typeof window.dispatchEvent !== 'function') return;
  const scope = window as RuntimeWindow;
  const generation = scope.__PIXFLOW_FEATURE_REQUEST__ = (scope.__PIXFLOW_FEATURE_REQUEST__ ?? 0) + 1;
  const stillCurrent = () => current() && generation === scope.__PIXFLOW_FEATURE_REQUEST__;
  const response = await request();
  if (!stillCurrent()) return;
  if (!response.ok) throw refreshError();
  const config = getPixflowWordPressConfig();
  const state = validateFeatureRuntime(response.body, config?.siteUrl || config?.restBaseUrl || window.location.href);
  // CSS first prevents a flash of unstyled controls as factories register.
  for (const asset of [...state.assets.filter(item => item.kind === 'style' && !DEFERRED_FEATURE_HANDLES.has(item.handle)), ...state.assets.filter(item => item.kind === 'script' && !DEFERRED_FEATURE_HANDLES.has(item.handle))]) {
    if (!stillCurrent()) return;
    await loadAsset(asset);
  }
  if (!stillCurrent()) return;
  if (JSON.stringify(scope.__PIXFLOW_FEATURE_RUNTIME__) === JSON.stringify(state)) return;
  scope.__PIXFLOW_FEATURE_RUNTIME__ = state;
  scope.__PIXFLOW_FEATURE_RUNTIME_REVISION__ = (scope.__PIXFLOW_FEATURE_RUNTIME_REVISION__ ?? 0) + 1;
  const patch = { bricksIntegrationActive: state.builders.bricks, etchIntegrationActive: state.builders.etch, elementorIntegrationActive: state.builders.elementor, workspaceAvailable: state.features.includes('workspace') };
  for (const key of ['__PIXFLOW_DESIGN_WORDPRESS__', 'pixflowDesignShell', 'pixflowDesignWpAdmin'] as const) {
    const target = (window as unknown as Record<string, Record<string, unknown>>)[key];
    if (target) Object.assign(target, patch);
  }
  window.dispatchEvent(new CustomEvent(PIXFLOW_FEATURE_RUNTIME_CHANGED, { detail: state }));
  window.dispatchEvent(new Event('pixflow:annotation-availability'));
  window.dispatchEvent(new CustomEvent('pixflow-design:app-config-changed', { detail: patch }));
}
