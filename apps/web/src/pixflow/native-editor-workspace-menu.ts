import { getPixflowWordPressConfig } from './wordpress-context';
import { planningAvailable } from './planning-availability';

/** Reuses the shared quick controls; the workspace is mounted lazily on demand. */
export function mountNativeEditorWorkspaceMenu(builder: 'etch' | 'elementor' | 'gutenberg'): () => void {
  const config = getPixflowWordPressConfig();
  const api = (window as Window & { pixflowDesignWorkspaceMenu?: { mount(options: Record<string, unknown>): { toggle(): void; destroy(): void; refreshTheme(): void } } }).pixflowDesignWorkspaceMenu;
  if (!api) return () => {};
  const button = document.createElement('button');
  button.id = `pixflow-${builder}-workspace-toggle`; button.type = 'button';
  button.title = 'Pixflow quick controls'; button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
  const image = document.createElement('img'); image.src = config?.quickMenuIconUrl ?? config?.iconUrl ?? ''; image.alt = ''; image.draggable = false; button.append(image);
  if (builder === 'gutenberg') {
    image.hidden = true;
    const glyph = document.createElement('span'); glyph.setAttribute('aria-hidden', 'true');
    glyph.style.maskImage = `url("${image.src}")`; button.append(glyph);
  }
  let overlay: HTMLElement | undefined;
  let handle: { unmount(): void } | undefined;
  let ready = false;
  let keepWorkspaceOnToolClose = false;
  let pending: Record<string, unknown>[] = [];
  let theme = config?.theme ?? config?.appConfig?.theme ?? 'dark';
  const post = (data: Record<string, unknown>) => window.postMessage({ source: 'pixflow-design-shell', ...data }, location.origin);
  const close = () => { if (overlay) overlay.hidden = true; post({ type: 'pixflow-design:workspace-visibility', open: false }); button.focus(); };
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.source !== 'pixflow-design') return;
    if (data.type === 'pixflow-design:workspace-ready') {
      ready = true; pending.splice(0).forEach(post);
    }
    if (data.type === 'pixflow-design:close-workspace') close();
    if (data.type === 'pixflow-design:workspace-tool-closed') {
      if (!keepWorkspaceOnToolClose) close();
      keepWorkspaceOnToolClose = false;
    }
  };
  window.addEventListener('message', onMessage);
  const open = (command?: Record<string, unknown>, show = true) => {
    if (!overlay) {
      overlay = document.createElement('section'); overlay.id = `pixflow-${builder}-workspace`;
      overlay.className = 'pixflow-native-editor-workspace';
      overlay.setAttribute('aria-label', 'Pixflow workspace'); overlay.setAttribute('role', 'dialog');
      const root = document.createElement('div'); root.id = 'pixflow-design-root';
      overlay.append(root); document.body.append(overlay);
      handle = window.PixflowDesignApp?.mount(root, { ...config, surface: 'workspace', workspaceInitiallyVisible: show, settingsPortal: true });
    }
    overlay.hidden = !show;
    const commands = [{ type: 'pixflow-design:workspace-visibility', open: show }, command ?? { type: 'pixflow-design:close-workspace-tool' }];
    if (ready) commands.forEach(post); else pending.push(...commands);
  };
  const menu = api.mount({
    trigger: button, placement: builder === 'etch' ? 'right-up' : 'bottom', getTheme: () => theme,
    resolveSystemTheme: () => {
      const editor = document.querySelector(builder === 'gutenberg' ? '.editor-header' : builder === 'etch' ? '.settings-bar__section.top' : '#elementor-editor-wrapper');
      const scheme = editor ? getComputedStyle(editor).colorScheme : '';
      return scheme === 'dark' || (scheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    },
    isWorkspaceOpen: () => Boolean(overlay && !overlay.hidden),
    isOnboardingCompleted: () => (config?.appConfig as Record<string, unknown>)?.onboardingCompleted !== false,
    onToggleWorkspace: () => overlay && !overlay.hidden ? close() : open(),
    onOpenTool: (tool: string) => { keepWorkspaceOnToolClose = false; open({ type: 'pixflow-design:open-workspace-tool', tool: tool === 'design-system' ? 'design-systems' : tool }); },
    onOpenSettings: () => {
      keepWorkspaceOnToolClose = Boolean(overlay && !overlay.hidden);
      open({ type: 'pixflow-design:open-settings', section: 'execution' }, keepWorkspaceOnToolClose);
    },
    onThemeChange: (value: string) => { theme = value; open({ type: 'pixflow-design:change-theme', theme: value }, Boolean(overlay && !overlay.hidden)); },
    initialDesignSystemVisible: planningAvailable(),
    planningAvailable: planningAvailable(),
    workspaceAvailable: planningAvailable(),
    designSystemLabel: 'Design systems',
  });
  const onConfigChange = (event: Event) => {
    const value = (event as CustomEvent).detail?.theme;
    if (value === 'system' || value === 'light' || value === 'dark') { theme = value; menu.refreshTheme(); }
  };
  window.addEventListener('open-design:app-config-changed', onConfigChange);
  button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); menu.toggle(); });
  button.addEventListener('keydown', event => event.stopPropagation());
  const mount = () => {
    const parent = builder === 'gutenberg' ? document.querySelector('[data-pixflow-gutenberg-controls]') : builder === 'etch' ? document.querySelector('.settings-bar__section.bottom')
      : document.querySelector('#ele-add-element')?.parentElement?.parentElement ?? document.querySelector('#elementor-panel-header-wrapper');
    if (!parent || button.parentElement === parent) return;
    if (builder === 'etch') parent.prepend(button);
    else parent.append(button);
  };
  mount();
  const observer = new MutationObserver(() => { if (!button.isConnected) mount(); });
  observer.observe(document.body, { subtree: true, childList: true });
  return () => { observer.disconnect(); menu.destroy(); handle?.unmount(); overlay?.remove(); button.remove(); window.removeEventListener('message', onMessage); window.removeEventListener('open-design:app-config-changed', onConfigChange); };
}
