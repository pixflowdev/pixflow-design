// @vitest-environment jsdom
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PixflowFeatureRuntime } from '@open-design/contracts';
import type { WorkspaceHostContext } from '../../src/App';
import * as Router from '../../src/router';
import { WorkspaceContribution } from '../../src/pixflow/workspace-contribution';

vi.mock('../../src/providers/registry', () => ({}));
vi.mock('../../src/state/config', () => ({}));
vi.mock('../../src/state/projects', () => ({}));
vi.mock('../../src/analytics/provider', () => ({}));
vi.mock('../../src/pixflow/wordpress-context', () => ({
  hasPixflowWordPressContext: () => true,
  getPixflowWordPressConfig: () => ({ siteUrl: 'http://localhost' }),
}));

type TestScope = Window & {
  PixflowWorkspaceFactory?: (host: { modules: Record<string, unknown> }) => { WorkspaceSurface: React.ComponentType<{ host: WorkspaceHostContext }> };
  __PIXFLOW_FEATURE_RUNTIME__?: PixflowFeatureRuntime;
  __PIXFLOW_FEATURE_ASSETS__?: Map<string, Promise<void>>;
  __PIXFLOW_FEATURE_RUNTIME_REVISION__?: number;
};
const scope = window as TestScope;
const base = 'http://localhost/wp-content/plugins/pixflow-design-pro/assets/app/';
const manifest = (active = true): PixflowFeatureRuntime => ({
  schema: 'pixflow.feature-runtime.v1', features: active ? ['workspace', 'planning'] : [],
  builders: { bricks: false, etch: false, elementor: false, generateblocks: false },
  assets: active ? [
    { handle: 'pixflow-workspace', kind: 'style', url: `${base}pixflow-workspace.css` },
    { handle: 'pixflow-workspace', kind: 'script', url: `${base}pixflow-workspace.js` },
  ] : [],
});
const host = (visible = true, allowed = true) => ({
  workspaceAllowed: allowed, pixflowWorkspaceCatalogVisible: visible,
  translateUi: (key: string) => key, openSettings: vi.fn(),
}) as unknown as WorkspaceHostContext;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  scope.__PIXFLOW_FEATURE_RUNTIME__ = manifest();
  scope.__PIXFLOW_FEATURE_RUNTIME_REVISION__ = 0;
  scope.__PIXFLOW_FEATURE_ASSETS__ = new Map();
  delete scope.PixflowWorkspaceFactory;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); document.head.innerHTML = ''; vi.restoreAllMocks();
});
function factory() {
  return vi.fn((_host: { modules: Record<string, unknown> }) => ({
    WorkspaceSurface: () => <input aria-label="Workspace draft" defaultValue="existing draft" />,
  }));
}
function loadAssets(onScript: () => void, fail = false) {
  const append = document.head.appendChild.bind(document.head);
  return vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
    const result = append(node);
    queueMicrotask(() => {
      if (node instanceof HTMLScriptElement && !fail) onScript();
      node.dispatchEvent(new Event(fail && node instanceof HTMLScriptElement ? 'error' : 'load'));
    });
    return result;
  });
}

describe('WordPress Pro Workspace contribution', () => {
  it('shows the shared loader while licence status is pending, without flashing the upgrade offer', async () => {
    const pending = { ...host(true, false), pixflowLicenseStatus: null };
    const renderer = factory(); scope.PixflowWorkspaceFactory = renderer;
    await act(async () => root.render(<WorkspaceContribution host={pending} />));
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Workspace · Pro');
    expect(renderer).not.toHaveBeenCalled();
    expect(document.head.querySelectorAll('script,link')).toHaveLength(0);
    loadAssets(() => {});
    await act(async () => root.render(<WorkspaceContribution host={host()} />));
    expect(container.querySelector('input')?.value).toBe('existing draft');
  });
  it('never downloads or mounts Workspace in Free even if its implementation remains in memory', async () => {
    scope.__PIXFLOW_FEATURE_RUNTIME__ = manifest(false);
    const renderer = factory(); scope.PixflowWorkspaceFactory = renderer;
    await act(async () => root.render(<WorkspaceContribution host={host(true, false)} />));
    expect(renderer).not.toHaveBeenCalled();
    expect(container.querySelector('input')).toBeNull();
    expect(document.head.querySelectorAll('script,link')).toHaveLength(0);
    expect(container.textContent).toContain('Workspace · Pro');
  });
  it('does not download Workspace when opening shared settings behind a hidden workspace', async () => {
    const renderer = factory(); scope.PixflowWorkspaceFactory = renderer;
    await act(async () => root.render(<WorkspaceContribution host={host(false)} />));
    expect(renderer).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
    expect(document.head.querySelectorAll('script,link')).toHaveLength(0);
  });
  it('loads once on first open, shares the router, and retains the mounted draft on hide/reopen', async () => {
    const renderer = factory();
    const append = loadAssets(() => { scope.PixflowWorkspaceFactory = renderer; });
    await act(async () => root.render(<WorkspaceContribution host={host()} />));
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer.mock.calls[0]?.[0].modules['pixflow-host-router']).toBe(Router);
    const input = container.querySelector('input')!; input.value = 'unsent work';
    await act(async () => root.render(<WorkspaceContribution host={host(false)} />));
    await act(async () => root.render(<WorkspaceContribution host={host()} />));
    expect(container.querySelector('input')).toBe(input);
    expect(input.value).toBe('unsent work');
    expect(append).toHaveBeenCalledTimes(2);
    expect(renderer).toHaveBeenCalledTimes(1);
  });
  it('rechecks live entitlement even when the Workspace factory is already loaded', async () => {
    const renderer = factory(); loadAssets(() => { scope.PixflowWorkspaceFactory = renderer; });
    await act(async () => root.render(<WorkspaceContribution host={host()} />));
    expect(container.querySelector('input')).not.toBeNull();
    scope.__PIXFLOW_FEATURE_RUNTIME__ = manifest(false);
    await act(async () => root.render(<WorkspaceContribution host={host()} />));
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('Workspace · Pro');
  });
  it('shows a retry after an asset failure and reuses the successfully loaded stylesheet', async () => {
    const renderer = factory();
    const failing = loadAssets(() => {}, true);
    await act(async () => root.render(<WorkspaceContribution host={host()} />));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    failing.mockRestore();
    const append = loadAssets(() => { scope.PixflowWorkspaceFactory = renderer; });
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('input')?.value).toBe('existing draft');
    expect(append).toHaveBeenCalledTimes(1);
    expect(document.head.querySelectorAll('link')).toHaveLength(1);
  });
});
