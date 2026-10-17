import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../../wordpress/assets/admin/wp-admin-floating-panel.js', import.meta.url), 'utf8');

/** Host protocol test: no fake React/editor implementations or site data. */
function host(flag: unknown, native = false) {
  const classes = new Set<string>();
  const listeners = new Map<string, (event: any) => void>();
  function element() {
    return {
      id: '', hidden: false, children: [] as any[], attributes: {} as Record<string, string>,
      handlers: {} as Record<string, (event: any) => void>, focus: vi.fn(), click: vi.fn(),
      appendChild(child: any) { this.children.push(child); },
      setAttribute(key: string, value: string) { this.attributes[key] = value; },
      addEventListener(key: string, callback: (event: any) => void) { this.handlers[key] = callback; },
      classList: { toggle: (key: string, value: boolean) => value ? classes.add(key) : classes.delete(key), remove: (key: string) => classes.delete(key) },
    };
  }
  const trigger = element(), editorTrigger = element(), body = element();
  const mount = vi.fn();
  const toggle = vi.fn();
  const refreshTheme = vi.fn();
  let options: any;
  const window = {
    location: { origin: 'https://example.test' },
    postMessage: vi.fn(),
    addEventListener: (key: string, callback: (event: any) => void) => listeners.set(key, callback),
    PixflowDesignApp: { mount },
    pixflowDesignWorkspaceMenu: { mount: vi.fn((value: any) => { options = value; return { toggle, refreshTheme }; }) },
  };
  const document = {
    body, createElement: element,
    querySelector: (selector: string) => selector.includes('wp-admin-bar') ? trigger : native ? editorTrigger : null,
  };
  const start = source.indexOf('  function bindWorkspaceMenu()');
  const end = source.indexOf("  if (document.readyState", start);
  runInNewContext(`${source.slice(start, end)}\nbindWorkspaceMenu();`, {
    window, document, config: { workspaceAvailable: flag, appConfig: { theme: 'dark' } }, setPanelUiLabel: vi.fn(),
  });
  const click = () => trigger.handlers.click?.({ preventDefault() {}, stopPropagation() {} });
  const message = (type: string, origin = window.location.origin, sender: unknown = window) =>
    listeners.get('message')?.({ origin, source: sender, data: { source: 'pixflow-design', type } });
  return { trigger, editorTrigger, body, mount, toggle, refreshTheme, window, listeners, click, message, options: () => options };
}

describe('WordPress admin Workspace host', () => {
  it('opens quick-menu Settings without opening Workspace and keeps an already open Workspace', () => {
    const h = host(true); h.click(); h.options().onOpenSettings();
    expect(h.body.children[0].hidden).toBe(true);
    expect(h.mount.mock.calls[0]![1]).toMatchObject({ workspaceInitiallyVisible: false, settingsPortal: true });
    h.message('pixflow-design:workspace-ready');
    expect(h.window.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'pixflow-design:open-settings' }), 'https://example.test');
    h.options().onToggleWorkspace();
    h.options().onOpenSettings();
    expect(h.body.children[0].hidden).toBe(false);
    h.message('pixflow-design:workspace-tool-closed');
    expect(h.body.children[0].hidden).toBe(false);
  });
  it.each([false, '', undefined, 'false', '0'])('does not bind unavailable Workspace (%s)', flag => {
    const h = host(flag); h.click();
    expect(h.window.pixflowDesignWorkspaceMenu.mount).not.toHaveBeenCalled();
    expect(h.mount).not.toHaveBeenCalled();
  });
  it.each([true, '1'])('accepts Pro and WordPress-localized Pro (%s), mounting only once', flag => {
    const h = host(flag); h.click(); h.click();
    expect(h.window.pixflowDesignWorkspaceMenu.mount).toHaveBeenCalledOnce();
    expect(h.mount).not.toHaveBeenCalled();
    h.options().onToggleWorkspace();
    expect(h.mount).toHaveBeenCalledOnce();
    expect(h.mount.mock.calls[0]![1].surface).toBe('workspace');
    expect(h.body.children[0].hidden).toBe(false);
    h.message('pixflow-design:workspace-ready', 'https://attacker.test');
    expect(h.window.postMessage).not.toHaveBeenCalled();
    h.message('pixflow-design:workspace-ready');
    expect(h.window.postMessage).toHaveBeenCalledWith(expect.objectContaining({ open: true }), 'https://example.test');
    h.message('pixflow-design:close-workspace', 'https://attacker.test');
    expect(h.body.children[0].hidden).toBe(false);
    h.message('pixflow-design:close-workspace');
    expect(h.body.children[0].hidden).toBe(true);
    expect(h.trigger.focus).toHaveBeenCalled();
    h.options().onOpenTool('design-system');
    expect(h.mount).toHaveBeenCalledOnce();
    expect(h.window.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ tool: 'design-systems' }), 'https://example.test');
  });
  it('reuses an editor-owned host without mounting another workspace/menu', () => {
    const h = host('1', true); h.click();
    expect(h.editorTrigger.click).toHaveBeenCalledOnce();
    expect(h.window.pixflowDesignWorkspaceMenu.mount).not.toHaveBeenCalled();
    expect(h.mount).not.toHaveBeenCalled();
  });
  it('keeps appearance-only changes hidden and refreshes theme from settings', () => {
    const h = host('1'); h.click(); h.options().onThemeChange('light');
    expect(h.body.children[0].hidden).toBe(true);
    expect(h.mount.mock.calls[0]![1].workspaceInitiallyVisible).toBe(false);
    h.listeners.get('open-design:app-config-changed')?.({ detail: { theme: 'dark' } });
    expect(h.options().getTheme()).toBe('dark');
    expect(h.refreshTheme).toHaveBeenCalledOnce();
  });
});
