import { useEffect, useLayoutEffect, useState } from 'react';
import type { AppTheme } from '../types';
import { applyAppearanceToDocument, resolveSystemTheme } from './appearance';

/** Observe the OS independently of an explicit in-app appearance choice. */
export function useSystemTheme(): 'light' | 'dark' {
  const [systemTheme, setSystemTheme] = useState(resolveSystemTheme);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return systemTheme;
}

/** Keep the saved System preference and its accent variant in sync with the OS. */
export function useAppearance(theme: AppTheme | undefined = 'dark', accentColor: string | undefined): 'light' | 'dark' {
  const systemTheme = useSystemTheme();
  useLayoutEffect(() => {
    applyAppearanceToDocument({ theme, accentColor });
  }, [theme, accentColor, systemTheme]);
  return theme === 'light' || theme === 'dark' ? theme : systemTheme;
}
