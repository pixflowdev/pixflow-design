import type { AppTheme } from '../types';

const ACCENT_VARS = [
  '--accent',
  '--accent-strong',
  '--accent-soft',
  '--accent-tint',
  '--accent-hover',
  '--accent-contrast',
  '--accent-solid',
  '--accent-solid-hover',
  '--chat-bubble-bg',
  '--selected',
  '--selected-soft',
] as const;

export const DEFAULT_ACCENT_COLOR = '#146ef5';
export const LEGACY_OD_ACCENT_COLORS = new Set([
  '#c96442',
  '#d97a56',
  '#f97316',
]);
// Keep the saved value stable while the displayed colour follows the theme.
// Existing custom colours remain literal; selecting a preset saves its value.
export const ACCENT_PRESETS = [
  { id: 'blue', value: DEFAULT_ACCENT_COLOR, light: '#1464dc', dark: '#78aaff' },
  { id: 'violet', value: '#7543c5', light: '#7543c5', dark: '#c1a0ff' },
  { id: 'rose', value: '#b92b69', light: '#b92b69', dark: '#ff8dbc' },
  { id: 'coral', value: '#bc4436', light: '#bc4436', dark: '#ff9b8c' },
  { id: 'amber', value: '#996000', light: '#996000', dark: '#f0be60' },
  { id: 'olive', value: '#637122', light: '#637122', dark: '#bacb79' },
  { id: 'green', value: '#237a4b', light: '#237a4b', dark: '#78cc9d' },
  { id: 'teal', value: '#147d78', light: '#147d78', dark: '#69cec6' },
  { id: 'cyan', value: '#08799b', light: '#08799b', dark: '#76cce8' },
  { id: 'slate', value: '#58657b', light: '#58657b', dark: '#aab9d0' },
] as const;

export function normalizeAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function normalizePixflowAccentColor(value: unknown): string | null {
  const normalized = normalizeAccentColor(value);
  if (!normalized) return null;
  return LEGACY_OD_ACCENT_COLORS.has(normalized) ? DEFAULT_ACCENT_COLOR : normalized;
}

export function resolveAccentColor(value: unknown): string {
  return normalizePixflowAccentColor(value) ?? DEFAULT_ACCENT_COLOR;
}

export function resolveThemeAccentColor(value: unknown, theme: 'light' | 'dark'): string {
  const normalized = resolveAccentColor(value);
  return ACCENT_PRESETS.find((preset) => preset.value === normalized)?.[theme] ?? normalized;
}

/** Choose a readable foreground for solid accent buttons, including custom colours. */
export function accentContrastColor(color: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  const luminance = channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
  return luminance > .179 ? '#000000' : '#ffffff';
}

/** Preserve the hue with a 7:1 white-text target including small chat text.
 * Self-contained so the pre-hydration script can use the exact same calculation. */
export function solidAccentColor(color: string): string {
  const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  for (let step = 1000; step >= 0; step--) {
    const channels = rgb.map((channel) => Math.floor(channel * step / 1000));
    const linear = channels.map((channel) => {
      const c = channel / 255;
      return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
    });
    const luminance = linear[0]! * .2126 + linear[1]! * .7152 + linear[2]! * .0722;
    if (1.05 / (luminance + .05) >= 7) {
      return '#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join('');
    }
  }
  return '#000000';
}

/** Chat-only fill: the shared 5% reduction, followed by seven lightness points.
 * Quantise HSL consistently for all colours; the blue preset resolves to
 * hsl(216 84% 30%), the user's tested comfortable reading colour.
 * Self-contained for the pre-hydration script, without changing saved accents. */
export function chatBubbleAccentColor(solid: string): string {
  const rgb = [1, 3, 5].map(offset => Math.floor(parseInt(solid.slice(offset, offset + 2), 16) * .95) / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
  const initialLightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * initialLightness - 1));
  const hue = delta === 0 ? 0 : max === rgb[0] ? ((rgb[1]! - rgb[2]!) / delta + 6) % 6 : max === rgb[1] ? (rgb[2]! - rgb[0]!) / delta + 2 : (rgb[0]! - rgb[1]!) / delta + 4;
  const h = Math.round(hue * 60), s = Math.round(saturation * 100) / 100;
  const lightness = Math.max(0, Math.floor(initialLightness * 100) - 7) / 100;
  const amplitude = s * Math.min(lightness, 1 - lightness);
  return '#' + [0, 8, 4].map(n => {
    const k = (n + h / 30) % 12;
    const channel = lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(channel * 255).toString(16).padStart(2, '0');
  }).join('');
}

export function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function accentVars(accentColor: string, fillAccentColor = accentColor): Record<(typeof ACCENT_VARS)[number], string> {
  const solid = solidAccentColor(fillAccentColor);
  return {
    '--accent': accentColor,
    // Keep these mix ratios in sync with the pre-hydration script in app/layout.tsx.
    '--accent-strong': `color-mix(in srgb, ${accentColor} 86%, var(--text-strong))`,
    '--accent-soft': `color-mix(in srgb, ${accentColor} 22%, var(--bg-panel))`,
    '--accent-tint': `color-mix(in srgb, ${accentColor} 12%, var(--bg-panel))`,
    '--accent-hover': `color-mix(in srgb, ${accentColor} 90%, var(--text-strong))`,
    '--accent-contrast': accentContrastColor(accentColor),
    '--accent-solid': solid,
    '--accent-solid-hover': `color-mix(in srgb, ${solid} 88%, #000)`,
    '--chat-bubble-bg': chatBubbleAccentColor(solid),
    '--selected': solid,
    '--selected-soft': `color-mix(in srgb, ${accentColor} 16%, transparent)`,
  };
}

export function applyAppearanceToDocument({
  theme = 'dark',
  accentColor,
}: {
  theme?: AppTheme;
  accentColor?: string;
}): void {
  const root = document.documentElement;
  const isWordPressRuntime = root.classList.contains('pixflow-design-wordpress-runtime');
  const scopedTargets = isWordPressRuntime
    ? Array.from(document.querySelectorAll<HTMLElement>('.pixflow-design-token-scope, .pixflow-design-portal-scope, .pixflow-bricks-agent-shell'))
    : [root];

  if (isWordPressRuntime) {
    root.removeAttribute('data-theme');
    root.setAttribute('data-pixflow-theme', theme === 'light' || theme === 'dark' ? theme : resolveSystemTheme());
  }

  const resolvedTheme = theme === 'light' || theme === 'dark' ? theme : resolveSystemTheme();
  for (const target of scopedTargets) {
    if (isWordPressRuntime) {
      // The WP host shell sits outside the React token scope. Give both
      // surfaces the resolved theme so the shared Bricks panel stylesheet
      // applies the same palette to the header and the composer.
      target.setAttribute('data-theme', resolvedTheme);
    } else if (theme === 'light' || theme === 'dark') {
      target.setAttribute('data-theme', theme);
    } else {
      target.removeAttribute('data-theme');
    }
  }

  const normalized = resolveThemeAccentColor(accentColor, resolvedTheme);
  // Bright theme accents work for links; filled surfaces start from the richer
  // light variant in either theme, then meet the same white-text contrast target.
  const vars = accentVars(normalized, resolveThemeAccentColor(accentColor, 'light'));
  for (const target of scopedTargets) {
    for (const name of ACCENT_VARS) {
      target.style.setProperty(name, vars[name]);
    }
  }
}
