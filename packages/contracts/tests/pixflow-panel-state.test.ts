import { describe, expect, it } from 'vitest';

import {
  PIXFLOW_PANEL_STORAGE_KEYS,
  pixflowPanelStorageKey,
} from '../src/index.js';

describe('Pixflow shared panel state contract', () => {
  it('uses isolated storage namespaces for Bricks and WP Admin', () => {
    expect(pixflowPanelStorageKey('bricks_builder')).toBe('pixflowDesign.bricksAgentPanel.v2');
    expect(pixflowPanelStorageKey('wp_admin')).toBe('pixflowDesign.wpAdminAgentPanel.v1');
    expect(PIXFLOW_PANEL_STORAGE_KEYS.bricks_builder).not.toBe(PIXFLOW_PANEL_STORAGE_KEYS.wp_admin);
  });
});
