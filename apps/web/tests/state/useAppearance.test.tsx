// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppearance } from '../../src/state/useAppearance';
import { ACCENT_PRESETS } from '../../src/state/appearance';
import type { AppTheme } from '../../src/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.removeAttribute('style'); document.documentElement.removeAttribute('data-theme'); });

it('follows OS changes in System, keeps explicit themes, and removes the listener on unmount', () => {
  const listeners = new Set<() => void>();
  const media = { matches: false, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
  vi.stubGlobal('matchMedia', () => media);
  const preset = ACCENT_PRESETS[0];
  const { result, rerender, unmount } = renderHook(({theme}: {theme: AppTheme}) => useAppearance(theme, preset.value), { initialProps: {theme: 'system' as AppTheme} });
  expect(result.current).toBe('light');
  expect(document.documentElement.style.getPropertyValue('--accent')).toBe(preset.light);
  act(() => { media.matches = true; listeners.forEach(fn => fn()); });
  expect(result.current).toBe('dark');
  expect(document.documentElement.style.getPropertyValue('--accent')).toBe(preset.dark);
  rerender({theme:'light'});
  expect(document.documentElement.style.getPropertyValue('--accent')).toBe(preset.light);
  act(() => { media.matches = false; listeners.forEach(fn => fn()); });
  expect(result.current).toBe('light');
  unmount();
  expect(listeners.size).toBe(0);
});
