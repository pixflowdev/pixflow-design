// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCENT_COLOR,
  ACCENT_PRESETS,
  accentContrastColor,
  solidAccentColor,
  chatBubbleAccentColor,
  resolveThemeAccentColor,
  applyAppearanceToDocument,
  normalizeAccentColor,
  resolveAccentColor,
} from '../../src/state/appearance';

describe('normalizeAccentColor', () => {
  it('accepts six-digit hex colors and normalizes casing', () => {
    expect(normalizeAccentColor('  #4F46E5  ')).toBe('#4f46e5');
  });

  it('rejects invalid accent colors', () => {
    expect(normalizeAccentColor('blue')).toBeNull();
    expect(normalizeAccentColor('#123')).toBeNull();
    expect(normalizeAccentColor('#12345g')).toBeNull();
  });
});

describe('resolveAccentColor', () => {
  it('falls back to the first appearance color for missing or invalid values', () => {
    expect(resolveAccentColor(undefined)).toBe(DEFAULT_ACCENT_COLOR);
    expect(resolveAccentColor('blue')).toBe(DEFAULT_ACCENT_COLOR);
  });
});

describe('applyAppearanceToDocument', () => {
  it('defaults an unset preference to dark', () => {
    applyAppearanceToDocument({});
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent-strong');
    document.documentElement.style.removeProperty('--accent-soft');
    document.documentElement.style.removeProperty('--accent-tint');
    document.documentElement.style.removeProperty('--accent-hover');
    document.documentElement.style.removeProperty('--accent-contrast');
  });

  it('applies the saved theme and accent variables to the root element', () => {
    applyAppearanceToDocument({ theme: 'dark', accentColor: '#4F46E5' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#4f46e5');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#4f46e5');
  });

  it('does not apply appearance colors to global background variables', () => {
    document.documentElement.style.setProperty('--bg', '#faf9f7');
    document.documentElement.style.setProperty('--bg-app', '#faf9f7');

    applyAppearanceToDocument({ theme: 'light', accentColor: '#059669' });

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#faf9f7');
    expect(document.documentElement.style.getPropertyValue('--bg-app')).toBe('#faf9f7');

    document.documentElement.style.removeProperty('--bg');
    document.documentElement.style.removeProperty('--bg-app');
  });

  it('applies accent variables while clearing an explicit theme for system mode', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    applyAppearanceToDocument({ theme: 'system', accentColor: '#10B981' });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-tint')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#10b981');
  });

  it('replaces existing accent variables when the saved color changes', () => {
    applyAppearanceToDocument({ theme: 'light', accentColor: '#4F46E5' });

    applyAppearanceToDocument({ theme: 'light', accentColor: '#EF4444' });

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).not.toContain('#4f46e5');
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-tint')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#ef4444');
  });

  it('falls back to the default accent when no valid accent is configured', () => {
    document.documentElement.style.setProperty('--accent', '#4f46e5');

    applyAppearanceToDocument({ theme: 'system', accentColor: 'not-a-color' });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(resolveThemeAccentColor(DEFAULT_ACCENT_COLOR, 'light'));
  });
});

describe('theme-aware accent presets', () => {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
    });
    return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
  };
  const contrast = (a: string, b: string) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0]! + .05) / (values[1]! + .05);
  };
  it('provides ten distinct colours with readable variants and button foregrounds', () => {
    expect(ACCENT_PRESETS).toHaveLength(10);
    for (const mode of ['light', 'dark'] as const) {
      expect(new Set(ACCENT_PRESETS.map((p) => p[mode])).size).toBe(10);
      for (const preset of ACCENT_PRESETS) {
        expect(contrast(preset[mode], mode === 'light' ? '#faf9f7' : '#333331'), `${preset.id} ${mode}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(preset[mode], accentContrastColor(preset[mode]))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('keeps the stored preset stable and switches its rendered colour', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(resolveAccentColor(preset.value)).toBe(preset.value);
      expect(resolveThemeAccentColor(preset.value, 'light')).toBe(preset.light);
      expect(resolveThemeAccentColor(preset.value, 'dark')).toBe(preset.dark);
      applyAppearanceToDocument({ theme: 'dark', accentColor: preset.value });
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe(preset.dark);
      expect(document.documentElement.style.getPropertyValue('--accent-contrast')).toBe(accentContrastColor(preset.dark));
    }
  });
  it('preserves custom colours and older non-preset values exactly', () => {
    for (const color of ['#123456', '#2563eb', '#7c3aed', '#059669']) {
      expect(resolveThemeAccentColor(color, 'light')).toBe(color);
      expect(resolveThemeAccentColor(color, 'dark')).toBe(color);
    }
  });
  it('keeps white text readable on every preset and very light custom fills', () => {
    for (const color of [...ACCENT_PRESETS.flatMap((p) => [p.light, p.dark]), '#ffffff', '#ffff00', '#00ffff', '#ffccee', '#000000', '#123456']) {
      expect(contrast(solidAccentColor(color), '#ffffff'), color).toBeGreaterThanOrEqual(7);
    }
    expect(solidAccentColor('#123456')).toBe('#123456');
  });
  it('updates chat selection fills in every WordPress scope without styling the host page', () => {
    document.documentElement.classList.add('pixflow-design-wordpress-runtime');
    document.body.innerHTML = '<div class="pixflow-design-token-scope"></div><div class="pixflow-design-portal-scope"></div><div class="pixflow-bricks-agent-shell"></div>';
    try {
      for (const theme of ['light', 'dark'] as const) {
        applyAppearanceToDocument({ theme, accentColor: '#7543c5' });
        for (const target of Array.from(document.body.children) as HTMLElement[]) {
          const accent = resolveThemeAccentColor('#7543c5', theme);
          expect(target.style.getPropertyValue('--accent')).toBe(accent);
          const fill = solidAccentColor(resolveThemeAccentColor('#7543c5', 'light'));
          expect(target.style.getPropertyValue('--selected')).toBe(fill);
          expect(target.style.getPropertyValue('--accent-solid')).toBe(fill);
          expect(target.style.getPropertyValue('--selected-soft')).toContain(accent);
        }
      }
    } finally {
      document.body.innerHTML = '';
      document.documentElement.classList.remove('pixflow-design-wordpress-runtime');
      document.documentElement.removeAttribute('data-pixflow-theme');
    }
  });
  it('uses the same rich solid fill across themes without changing saved presets or bright link colours', () => {
    for (const preset of ACCENT_PRESETS) {
      applyAppearanceToDocument({ theme: 'light', accentColor: preset.value });
      const fill = document.documentElement.style.getPropertyValue('--selected');
      applyAppearanceToDocument({ theme: 'dark', accentColor: preset.value });
      expect(document.documentElement.style.getPropertyValue('--selected')).toBe(fill);
      expect(fill).toBe(solidAccentColor(preset.light));
      expect(contrast(fill, '#ffffff')).toBeGreaterThanOrEqual(7);
      expect(document.documentElement.style.getPropertyValue('--chat-bubble-bg')).toBe(chatBubbleAccentColor(fill));
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe(preset.dark);
    }
  });
  it('applies the same separate lightness adjustment to all presets and custom colours', () => {
    for (const color of [...ACCENT_PRESETS.map(p => p.value), '#ffffff', '#00ffff', '#123456', '#ff00ff', '#000000']) {
      applyAppearanceToDocument({ theme: 'dark', accentColor: color });
      const solid = document.documentElement.style.getPropertyValue('--accent-solid');
      const bubble = document.documentElement.style.getPropertyValue('--chat-bubble-bg');
      expect(bubble).toBe(chatBubbleAccentColor(solid));
      const lightness = (hex: string) => { const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255); return (Math.max(...rgb)+Math.min(...rgb))/2; };
      expect(lightness(bubble)).toBeLessThanOrEqual(Math.max(0, lightness(solid) * .95 - .065));
      expect(contrast(bubble, '#ffffff')).toBeGreaterThanOrEqual(7);
      expect(solid).toBe(solidAccentColor(resolveThemeAccentColor(color, 'light')));
    }
  });

  it('matches the user-tested blue bubble hsl(216 84% 30%) without changing button colours', () => {
    applyAppearanceToDocument({ theme: 'dark', accentColor: DEFAULT_ACCENT_COLOR });
    expect(document.documentElement.style.getPropertyValue('--chat-bubble-bg')).toBe('#0c408d');
    expect(document.documentElement.style.getPropertyValue('--accent-solid')).toBe('#1054ba');
  });

});
