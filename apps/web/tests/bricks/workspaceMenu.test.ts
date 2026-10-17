import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const workspaceMenuSource = readFileSync(
  resolve(repoRoot, 'wordpress/assets/builder/workspace-menu.js'),
  'utf8',
);
const adminPanelSource = readFileSync(resolve(repoRoot, 'wordpress/assets/admin/wp-admin-floating-panel.js'), 'utf8');

type WorkspaceMenuRuntime = {
  mount(options: Record<string, unknown>): {
    toggle(): void;
    refreshWorkspaceState(): void;
    refreshDesignSystemVisibility(): Promise<boolean>;
  };
};

const openDoms: JSDOM[] = [];

afterEach(() => {
  openDoms.splice(0).forEach((dom) => dom.window.close());
});

function mountMenu(
  resolveDesignSystemVisibility: () => Promise<boolean>,
  options: { isOnboardingCompleted?: () => boolean; isWorkspaceOpen?: () => boolean } = {},
) {
  const dom = new JSDOM('<button id="trigger">Pixflow</button>', {
    runScripts: 'outside-only',
    url: 'http://127.0.0.1:8088/test-page/?bricks=run',
  });
  openDoms.push(dom);
  dom.window.eval(workspaceMenuSource);
  const runtime = (dom.window as unknown as { pixflowDesignWorkspaceMenu: WorkspaceMenuRuntime })
    .pixflowDesignWorkspaceMenu;
  const trigger = dom.window.document.getElementById('trigger');
  if (!trigger) throw new Error('trigger missing');
  const controller = runtime.mount({
    trigger,
    getTheme: () => 'light',
    isWorkspaceOpen: options.isWorkspaceOpen ?? (() => false),
    isOnboardingCompleted: options.isOnboardingCompleted ?? (() => true),
    onToggleWorkspace: () => undefined,
    onThemeChange: () => undefined,
    onOpenTool: () => undefined,
    onOpenSettings: () => undefined,
    initialDesignSystemVisible: true,
    resolveDesignSystemVisibility,
  });
  controller.toggle();
  const button = Array.from(dom.window.document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === 'Design Your System',
  );
  const workspaceButton = dom.window.document.querySelector<HTMLButtonElement>(
    '.pixflow-design-toolbar-menu__workspace',
  );
  const toolsSection = dom.window.document.querySelector<HTMLElement>(
    '.pixflow-design-toolbar-menu__tools',
  )?.closest<HTMLElement>('.entry-settings-menu__section');
  const divider = dom.window.document.querySelector<HTMLElement>(
    '.entry-settings-menu__divider',
  );
  const settingsButton = Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.trim() === 'Settings',
  );
  if (!button?.parentElement) throw new Error('Design Your System row missing');
  if (!workspaceButton) throw new Error('Workspace button missing');
  if (!toolsSection || !divider || !settingsButton) throw new Error('Onboarding-gated menu content missing');
  return {
    controller,
    dom,
    row: button.parentElement,
    workspaceButton,
    toolsSection,
    divider,
    settingsButton,
  };
}

describe('Bricks toolbar workspace menu', () => {
  it.each([false, true])('keeps admin Settings usable in Free with onboardingCompleted=%s and reveals Workspace immediately when Pro activates', (onboardingCompleted) => {
    const dom = new JSDOM('<div id="wp-admin-bar-pixflow-design-menu"><a class="ab-item" href="#">Settings</a></div>', { runScripts: 'outside-only', url: 'http://localhost/wp-admin/' });
    openDoms.push(dom);
    Object.defineProperty(dom.window.document, 'readyState', { value: 'complete', configurable: true });
    const mount = vi.fn(() => ({ unmount() {} }));
    const scope = dom.window as unknown as { pixflowDesignWpAdmin: unknown; PixflowDesignApp: unknown; __PIXFLOW_FEATURE_RUNTIME__: { features: string[] } };
    scope.pixflowDesignWpAdmin = { workspaceAvailable: false, appConfig: { onboardingCompleted, theme: 'dark' } };
    scope.PixflowDesignApp = { mount };
    dom.window.eval(workspaceMenuSource); dom.window.eval(adminPanelSource);
    const trigger = dom.window.document.querySelector<HTMLAnchorElement>('.ab-item')!;
    trigger.click();
    const workspace = dom.window.document.querySelector<HTMLButtonElement>('.pixflow-design-toolbar-menu__workspace')!;
    expect(workspace.hidden).toBe(true);
    const settings = Array.from(dom.window.document.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Settings')!;
    expect(settings.hidden).toBe(false);
    expect(dom.window.document.querySelector('.pixflow-design-toolbar-menu__tools')!.closest<HTMLElement>('.entry-settings-menu__section')!.hidden).toBe(true);
    settings.click();
    expect(mount).toHaveBeenCalledOnce();
    expect(dom.window.document.querySelector<HTMLElement>('#pixflow-admin-workspace')!.hidden).toBe(true);
    scope.__PIXFLOW_FEATURE_RUNTIME__ = { features: ['planning'] };
    dom.window.dispatchEvent(new dom.window.Event('pixflow-design:feature-runtime-changed'));
    expect(workspace.hidden).toBe(false);
    expect(settings.hidden).toBe(false);
    workspace.click();
    expect(dom.window.document.querySelector<HTMLElement>('#pixflow-admin-workspace')!.hidden).toBe(false);
    expect(mount).toHaveBeenCalledOnce();
  });
  it('updates existing quick controls after activation and ignores a late visibility response after revocation', async () => {
    let finish!: (value: boolean) => void;
    const pending = new Promise<boolean>(resolve => { finish = resolve; });
    const { controller, dom, row, workspaceButton } = mountMenu(() => pending);
    const scope = dom.window as unknown as { __PIXFLOW_FEATURE_RUNTIME__: { features: string[] } };
    scope.__PIXFLOW_FEATURE_RUNTIME__ = { features: [] };
    dom.window.dispatchEvent(new dom.window.Event('pixflow-design:feature-runtime-changed'));
    expect(workspaceButton.hidden).toBe(true); expect(row.hidden).toBe(true);
    scope.__PIXFLOW_FEATURE_RUNTIME__ = { features: ['planning'] };
    dom.window.dispatchEvent(new dom.window.Event('pixflow-design:feature-runtime-changed'));
    expect(workspaceButton.hidden).toBe(false); expect(row.hidden).toBe(false);
    scope.__PIXFLOW_FEATURE_RUNTIME__ = { features: [] };
    dom.window.dispatchEvent(new dom.window.Event('pixflow-design:feature-runtime-changed'));
    finish(true); await controller.refreshDesignSystemVisibility();
    expect(row.hidden).toBe(true);
  });
  it('shows Design Your System on the first paint while route confirmation is pending', () => {
    const pending = new Promise<boolean>(() => undefined);
    const { row } = mountMenu(() => pending);

    expect(row.hidden).toBe(false);
  });

  it('updates the prefetched visibility after a successful route refresh', async () => {
    let resolveVisibility: (visible: boolean) => void = () => undefined;
    const pending = new Promise<boolean>((resolvePromise) => {
      resolveVisibility = resolvePromise;
    });
    const { controller, row } = mountMenu(() => pending);

    resolveVisibility(false);
    await controller.refreshDesignSystemVisibility();

    expect(row.hidden).toBe(true);
  });

  it('labels the workspace action as Start onboarding before completion', () => {
    const { workspaceButton } = mountMenu(
      () => Promise.resolve(true),
      { isOnboardingCompleted: () => false },
    );

    expect(workspaceButton.textContent?.trim()).toBe('Start onboarding');
    expect(workspaceButton.getAttribute('aria-label')).toBe('Start onboarding');
  });

  it('restores Open workspace immediately after onboarding completes', () => {
    let onboardingCompleted = false;
    const { controller, workspaceButton } = mountMenu(
      () => Promise.resolve(true),
      { isOnboardingCompleted: () => onboardingCompleted },
    );

    onboardingCompleted = true;
    controller.refreshWorkspaceState();

    expect(workspaceButton.textContent?.trim()).toBe('Open workspace');
    expect(workspaceButton.getAttribute('aria-label')).toBe('Open workspace');
  });

  it('keeps Settings available while design tools wait for onboarding completion', () => {
    let onboardingCompleted = false;
    const {
      controller,
      toolsSection,
      divider,
      settingsButton,
    } = mountMenu(
      () => Promise.resolve(true),
      { isOnboardingCompleted: () => onboardingCompleted },
    );

    expect(toolsSection.hidden).toBe(true);
    expect(divider.hidden).toBe(true);
    expect(settingsButton.hidden).toBe(false);

    onboardingCompleted = true;
    controller.refreshWorkspaceState();

    expect(toolsSection.hidden).toBe(false);
    expect(divider.hidden).toBe(false);
    expect(settingsButton.hidden).toBe(false);
  });
});
