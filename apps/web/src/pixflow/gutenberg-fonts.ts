import { requestWordPressRest } from './license';
type FontState = { css: string; presets: Array<{ name: string; slug: string; fontFamily: string }> };

/** Update only Pixflow's font entries; never reload or disturb dirty native blocks. */
export function mergeWordPressFontSettings(settings: any, state: FontState): any {
  const features = settings.__experimentalFeatures ?? {};
  const typography = features.typography ?? {};
  const families = typography.fontFamilies ?? {};
  const old = (settings.pixflowFontSlugs ?? []) as string[];
  const theme = (families.theme ?? []).filter((f: any) => !old.includes(f.slug));
  const existing = new Set(theme.map((f: any) => f.slug));
  const added = state.presets.filter(f => !existing.has(f.slug));
  return {
    __experimentalFeatures: { ...features, typography: { ...typography, fontFamilies: { ...families, theme: [...theme, ...added] } } },
    pixflowFontSlugs: state.presets.map(f => f.slug),
    styles: [...(settings.styles ?? []).filter((s: any) => s.__pixflowFonts !== true), { css: state.css, __pixflowFonts: true }],
  };
}

export function mountGutenbergFonts(): () => void {
  let current: FontState | undefined;
  let disposed = false;
  const frames = new Set<HTMLIFrameElement>();
  const applyCss = () => {
    if (!current || disposed) return;
    for (const frame of frames) if (!frame.isConnected) { frame.removeEventListener('load', applyCss); frames.delete(frame); }
    for (const frame of document.querySelectorAll<HTMLIFrameElement>('iframe[name="editor-canvas"]')) {
      if (!frames.has(frame)) { frames.add(frame); frame.addEventListener('load', applyCss); }
    }
    for (const doc of [document, ...Array.from(frames).map(f => { try { return f.contentDocument; } catch { return null; } })]) {
      if (!doc?.head) continue;
      let style = doc.getElementById('pixflow-wordpress-fonts-inline-css');
      if (!style) { style = doc.createElement('style'); style.id = 'pixflow-wordpress-fonts-inline-css'; doc.head.append(style); }
      if (style.textContent !== current.css) style.textContent = current.css;
    }
  };
  const update = (event: Event) => {
    const state = (event as CustomEvent<FontState>).detail;
    const wp = (window as any).wp;
    if (!state?.presets || !wp?.data) return;
    const settings = wp.data.select('core/block-editor')?.getSettings();
    if (!settings) return;
    current = state; applyCss();
    wp.data.dispatch('core/block-editor').updateSettings(mergeWordPressFontSettings(settings, state));
    // Site Editor typography reads the theme's base configuration separately.
    // Refresh only that read cache; leave edited user Global Styles untouched.
    const core = wp.data.select('core');
    if (typeof core?.__experimentalGetCurrentThemeBaseGlobalStyles === 'function') {
      wp.data.dispatch('core').invalidateResolution('__experimentalGetCurrentThemeBaseGlobalStyles', []);
    }
  };
  const observer = new MutationObserver(applyCss);
  observer.observe(document.body, { childList: true, subtree: true });
  void requestWordPressRest<{ wordpressFontState: FontState }>('fonts/google/state?builder=wordpress', { method: 'GET' }).then(response => {
    if (!disposed && !current && response.ok && response.body.wordpressFontState) update(new CustomEvent('fonts', { detail: response.body.wordpressFontState }));
  }).catch(() => {});
  window.addEventListener('pixflow-design:wordpress-font-state', update);
  return () => { disposed = true; observer.disconnect(); for (const frame of frames) frame.removeEventListener('load', applyCss); frames.clear(); window.removeEventListener('pixflow-design:wordpress-font-state', update); };
}
