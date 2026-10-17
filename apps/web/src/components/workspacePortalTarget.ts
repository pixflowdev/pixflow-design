export function workspacePortalTarget(anchor?: HTMLElement | null): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  // Settings is itself portalled outside the floating panel. Keep anchored
  // pickers inside that modal so its stacking context, clipping boundary and
  // active Pixflow theme remain authoritative on WordPress admin screens.
  const settingsModal = anchor?.closest<HTMLElement>('.modal-backdrop.pixflow-design-portal-scope');
  if (settingsModal) return settingsModal;

  const existingAgentPortal = anchor?.closest<HTMLElement>('.pixflow-bricks-agent-portal-root');
  if (existingAgentPortal) return existingAgentPortal;

  const agentShell = anchor?.closest<HTMLElement>('.pixflow-bricks-agent-shell');
  if (agentShell) return bricksAgentPortalTarget(agentShell);

  const pixflowOverlay = anchor?.closest<HTMLElement>('#pixflow-design-overlay');
  if (pixflowOverlay) return pixflowOverlay;

  return document.querySelector<HTMLElement>('.workspace-shell') ?? document.body;
}

const WORKSPACE_PORTAL_THEME_PROPERTIES = [
  '--bg',
  '--bg-app',
  '--bg-panel',
  '--bg-subtle',
  '--bg-muted',
  '--bg-fill-tertiary',
  '--bg-fill-secondary',
  '--bg-fill',
  '--bg-elevated',
  '--composer-surface',
  '--composer-hover',
  '--border',
  '--border-strong',
  '--border-soft',
  '--text',
  '--text-strong',
  '--text-muted',
  '--text-soft',
  '--text-faint',
  '--accent',
  '--accent-strong',
  '--accent-soft',
  '--accent-tint',
  '--accent-hover',
  '--accent-contrast',
  '--accent-solid-contrast',
  '--accent-solid',
  '--accent-solid-hover',
  '--selected',
  '--selected-soft',
  '--radius-xs',
  '--radius-sm',
  '--radius',
  '--radius-md',
  '--radius-lg',
  '--radius-pill',
] as const;

/** Carries scoped workspace tokens across a portal boundary without changing its stacking target. */
export function workspacePortalThemeStyle(anchor?: HTMLElement | null): Record<string, string> {
  if (typeof window === 'undefined' || !anchor) return {};
  const computed = window.getComputedStyle(anchor);
  return { color: computed.color, fontFamily: computed.fontFamily, ...Object.fromEntries(
    WORKSPACE_PORTAL_THEME_PROPERTIES.flatMap((name) => {
      const value = computed.getPropertyValue(name).trim();
      return value ? [[name, value]] : [];
    }),
  ) };
}

function bricksAgentPortalTarget(agentShell: HTMLElement): HTMLElement {
  const id = 'pixflow-bricks-agent-portal-root';
  let root = document.getElementById(id);
  if (!root) {
    root = document.createElement('div');
    root.id = id;
    root.className = 'pixflow-design-portal-scope pixflow-bricks-agent-portal-root';
    root.setAttribute('data-pixflow-bricks-agent-portal', 'true');
  }
  if (root.parentElement !== document.body) {
    document.body.appendChild(root);
  }

  const htmlTheme = document.documentElement.getAttribute('data-theme');
  const shellTheme = agentShell.getAttribute('data-theme');
  root.setAttribute('data-theme', shellTheme || htmlTheme || 'dark');

  Object.entries(workspacePortalThemeStyle(agentShell)).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });

  return root;
}
