import type { PixflowSurface } from './pixflow-surface.js';

export const PIXFLOW_PANEL_STORAGE_KEYS = {
  bricks_builder: 'pixflowDesign.bricksAgentPanel.v2',
  wp_admin: 'pixflowDesign.wpAdminAgentPanel.v1',
} as const satisfies Record<PixflowSurface, string>;

export function pixflowPanelStorageKey(surface: PixflowSurface): string {
  return PIXFLOW_PANEL_STORAGE_KEYS[surface];
}
