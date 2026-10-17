// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mergeWordPressFontSettings, mountGutenbergFonts } from '../../src/pixflow/gutenberg-fonts';

vi.mock('../../src/pixflow/license', () => ({ requestWordPressRest: vi.fn(async () => ({ ok: false })) }));

describe('Gutenberg live fonts', () => {
  it('preserves native fonts, other settings and styles across install/disable', () => {
    const settings = { styles: [{ css: 'body{color:red}' }], __experimentalFeatures: { color: { custom: false }, typography: { fontFamilies: { theme: [{ slug: 'theme' }], custom: [{ slug: 'user' }] } } } };
    const first = mergeWordPressFontSettings(settings, { css: '@font-face{}', presets: [{ slug: 'pixflow-font-example', name: 'Example', fontFamily: 'Example' }] });
    expect(first.__experimentalFeatures.typography.fontFamilies.theme).toHaveLength(2);
    expect(first.__experimentalFeatures.typography.fontFamilies.custom).toEqual([{ slug: 'user' }]);
    const disabled = mergeWordPressFontSettings(first, { css: '', presets: [] });
    expect(disabled.__experimentalFeatures).toEqual(settings.__experimentalFeatures);
    expect(disabled.styles[0]).toEqual(settings.styles[0]);
    expect(settings.__experimentalFeatures.typography.fontFamilies.theme).toHaveLength(1);
  });
});

it('updates the actual canvas stylesheet, handles replacement frames and removes disabled faces', async () => {
  document.body.innerHTML = '<iframe name="editor-canvas"></iframe>';
  const updateSettings = vi.fn();
  (window as any).wp = { data: { select: () => ({ getSettings: () => ({}) }), dispatch: () => ({ updateSettings }) } };
  const cleanup = mountGutenbergFonts();
  const event = (css: string) => new CustomEvent('pixflow-design:wordpress-font-state', { detail: { css, presets: [] } });
  try {
    window.dispatchEvent(event('@font-face{font-family:Example}'));
    const style = () => document.querySelector('iframe')!.contentDocument!.getElementById('pixflow-wordpress-fonts-inline-css');
    expect(style()?.textContent).toContain('font-family:Example');
    document.querySelector('iframe')!.remove();
    const replacement = document.createElement('iframe'); replacement.name = 'editor-canvas'; document.body.append(replacement);
    await vi.waitFor(() => expect(style()?.textContent).toContain('font-family:Example'));
    window.dispatchEvent(event(''));
    expect(style()?.textContent).toBe('');
    expect(updateSettings).toHaveBeenCalledTimes(2);
    cleanup();
    window.dispatchEvent(event('should-not-apply'));
    expect(style()?.textContent).toBe('');
  } finally { cleanup(); delete (window as any).wp; document.body.innerHTML = ''; }
});
