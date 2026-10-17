// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { PixflowFeatureRuntime } from '@open-design/contracts';
import { BuilderSettingsContribution, type BuilderSettingsRenderer } from '../../src/pixflow/BuilderSettingsContribution';

type TestWindow = Window & { PixflowBricksSettings?: BuilderSettingsRenderer; PixflowProBricks?: BuilderSettingsRenderer; __PIXFLOW_FEATURE_RUNTIME__?: PixflowFeatureRuntime };
const hostWindow = window as TestWindow;
const base = 'http://localhost/wp-content/plugins/pixflow-design-pro/assets/app/';
beforeEach(() => {
  Object.assign(window, {
    __PIXFLOW_DESIGN_WORDPRESS__: { restBaseUrl: 'http://localhost/wp-json/pixflow-design/v1' },
    __PIXFLOW_FEATURE_ASSETS__: new Map(), __PIXFLOW_FEATURE_RUNTIME_REVISION__: 0,
    __PIXFLOW_FEATURE_RUNTIME__: { schema: 'pixflow.feature-runtime.v1', features: ['planning'], builders: { bricks: true, etch: false, elementor: false, generateblocks: false }, assets: [
      { handle: 'pixflow-bricks-settings', kind: 'script', url: `${base}pixflow-bricks-settings.js?ver=4` },
      { handle: 'pixflow-bricks-settings', kind: 'style', url: `${base}pixflow-bricks-settings.css?ver=4` },
      { handle: 'pixflow-bricks-agent', kind: 'script', url: `${base}pixflow-bricks-agent.js?ver=4` },
    ] },
  });
  delete hostWindow.PixflowBricksSettings; delete hostWindow.PixflowProBricks;
});
afterEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; vi.restoreAllMocks(); delete hostWindow.PixflowBricksSettings; delete hostWindow.PixflowProBricks; });

describe('standalone Bricks settings loading', () => {
  it('downloads settings only and mounts their renderer after registration', async () => {
    const renderer = { renderSettings: vi.fn(), unmountSettings: vi.fn() };
    const original = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      const result = original(node);
      queueMicrotask(() => { if ((node as Element).tagName === 'SCRIPT') hostWindow.PixflowBricksSettings = renderer; node.dispatchEvent(new Event('load')); });
      return result;
    });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<BuilderSettingsContribution kind="framework" />));
    expect(renderer.renderSettings).toHaveBeenCalledWith('framework', expect.any(HTMLElement), {});
    expect(document.head.querySelector('script')?.getAttribute('src')).toContain('pixflow-bricks-settings.js');
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    await act(async () => root.unmount());
    expect(renderer.unmountSettings).toHaveBeenCalledTimes(1);
  });
  it('reuses the dedicated settings implementation without a second download', async () => {
    const renderer = { renderSettings: vi.fn(), unmountSettings: vi.fn() }; hostWindow.PixflowBricksSettings = renderer;
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<BuilderSettingsContribution kind="extensions" />));
    expect(renderer.renderSettings).toHaveBeenCalled();
    expect(document.head.querySelectorAll('script,link')).toHaveLength(0);
    await act(async () => root.unmount());
  });
  it('does not treat a loaded native chat bundle as the settings renderer', async () => {
    hostWindow.PixflowProBricks = { renderSettings: vi.fn(), unmountSettings: vi.fn() };
    const renderer = { renderSettings: vi.fn(), unmountSettings: vi.fn() };
    const original = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      const result = original(node);
      queueMicrotask(() => { if ((node as Element).tagName === 'SCRIPT') hostWindow.PixflowBricksSettings = renderer; node.dispatchEvent(new Event('load')); });
      return result;
    });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<BuilderSettingsContribution kind="extensions" />));
    expect(hostWindow.PixflowProBricks.renderSettings).not.toHaveBeenCalled();
    expect(renderer.renderSettings).toHaveBeenCalled();
    expect(document.head.querySelector('script')?.getAttribute('src')).toContain('pixflow-bricks-settings.js');
    await act(async () => root.unmount());
  });
});
