import { describe, expect, it } from 'vitest';
import { resolvePanelTheme } from '../../src/pixflow/panel-appearance';

describe('embedded appearance ownership', () => {
  it('defaults to dark without a saved preference, even on a light OS', () => {
    expect(resolvePanelTheme(undefined, undefined, false)).toBe('dark');
    expect(resolvePanelTheme(undefined, 'system', false)).toBe('light');
  });
  it('honors WordPress System instead of a stale Bridge explicit preference', () => {
    expect(resolvePanelTheme('system', 'light', true)).toBe('dark');
    expect(resolvePanelTheme('system', 'dark', false)).toBe('light');
  });
  it('keeps explicit preferences stable across operating-system changes', () => {
    expect(resolvePanelTheme('dark', 'light', false)).toBe('dark');
    expect(resolvePanelTheme('light', 'dark', true)).toBe('light');
    expect(resolvePanelTheme(undefined, 'dark', false)).toBe('dark');
  });
});
