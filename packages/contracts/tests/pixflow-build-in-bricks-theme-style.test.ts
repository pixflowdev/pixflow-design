import { describe, expect, it } from 'vitest';

import {
  formatPixflowBuildInBricksThemeStyleContext,
  formatPixflowBuildInBricksThemeStylePreviewCss,
  isPixflowBuildInBricksThemeStyleContextAuthoritative,
  listPixflowBuildInBricksThemeStyleEffectiveDeclarations,
  normalizePixflowBuildInBricksThemeStyleContext,
} from '../src/api/pixflow-build-in-bricks-theme-style.js';

describe('Build in Bricks Theme Style context', () => {
  it('normalizes applicable styles in resolved order and keeps policy explicit', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      targetPostId: 42,
      activeStyleIds: ['page-style', 'site-style'],
      themeStyles: [
        { id: 'site-style', label: 'Site', settings: { body: { color: 'var(--text)' } } },
        { id: 'page-style', label: 'Page', settings: { button: { _background: 'var(--primary)' } } },
        { id: 'unmatched', label: 'Unmatched', settings: { body: { color: 'red' } } },
      ],
    });

    expect(context.policy).toBe('inherit_effective');
    expect(context.resolution.activeStyleIds).toEqual(['page-style', 'site-style']);
    expect(context.resolution.styles.slice(0, 2).map((style) => style.id)).toEqual(['page-style', 'site-style']);
    expect(context.snapshotHash).toMatch(/^theme-style-/);
  });

  it('formats compact prompt guidance and render-only CSS without inventing framework tokens', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      themeStyles: [{ id: 'site-style', settings: {
        body: { _font_family: 'Inter', _color: 'var(--text)' },
        button: { _background: 'var(--primary)', _border_radius: '8px' },
      } }],
    });
    const prompt = formatPixflowBuildInBricksThemeStyleContext(context);
    const preview = formatPixflowBuildInBricksThemeStylePreviewCss(context);
    expect(prompt).toContain('destination rendering environment');
    expect(prompt).toContain('button');
    expect(preview).toContain('button');
    expect(preview).toContain('render-only');
    expect(preview).not.toContain('--invented');
  });

  it('does not emit preview rules for isolated flows', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'isolated',
      activeStyleIds: ['site-style'],
      themeStyles: [{ id: 'site-style', settings: { body: { color: 'red' } } }],
    });
    expect(formatPixflowBuildInBricksThemeStylePreviewCss(context)).toBe('');
  });

  it('preserves supported responsive defaults in both prompt and renderer projections', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false },
        { key: 'mobile_landscape', label: 'Mobile landscape', width: 767, base: false },
      ],
      themeStyles: [{ id: 'site-style', settings: {
        typography: {
          typographyHeadings: { 'font-size': 'clamp(2rem, 5vw, 5rem)' },
          'typographyHeadings:tablet_portrait': { 'font-size': '3rem' },
          'typographyHeadings:mobile_landscape': { 'font-size': '2.25rem' },
        },
      } }],
    });
    const heading = context.resolution.styles[0]?.defaults.find((entry) => entry.element === 'heading');
    expect(heading?.responsive).toEqual({
      tablet_portrait: { 'font-size': '3rem' },
      mobile_landscape: { 'font-size': '2.25rem' },
    });
    const prompt = formatPixflowBuildInBricksThemeStyleContext(context);
    expect(prompt).toContain('heading:');
    expect(prompt).toContain('Tablet portrait (991px):');
    expect(prompt).toContain('font-size: 3rem');
    expect(prompt).toContain('Mobile landscape (767px):');
    expect(prompt).toContain('font-size: 2.25rem');
    expect(formatPixflowBuildInBricksThemeStylePreviewCss(context)).toContain('@media (max-width: 991px)');
    expect(formatPixflowBuildInBricksThemeStylePreviewCss(context)).toContain('@media (max-width: 767px)');
  });

  it('formats one effective declaration ledger with actual base and responsive values', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: null, base: true },
        { key: 'tablet', label: 'Tablet', width: 991, base: false },
        { key: 'mobile', label: 'Mobile', width: 478, base: false },
      ],
      themeStyles: [{ id: 'site-style', settings: {
        typography: {
          typographyHeadingH1: {
            fontFamily: 'Inter',
            fontSize: '4.5rem',
          },
          'typographyHeadingH1:tablet': { fontSize: '3.5rem' },
          'typographyHeadingH1:mobile': { fontSize: '2.25rem' },
        },
        button: {
          typography: { fontSize: '1rem', fontWeight: '700' },
          padding: { top: '1rem', right: '2rem', bottom: '1rem', left: '2rem' },
          'padding:mobile': { top: '.75rem', right: '1.25rem', bottom: '.75rem', left: '1.25rem' },
        },
        section: { padding: { top: '6rem', bottom: '6rem' } },
        container: { widthMax: '76rem' },
      } }],
    });

    const prompt = formatPixflowBuildInBricksThemeStyleContext(context);
    expect(prompt).toContain('h1:');
    expect(prompt).toContain('font-family: Inter');
    expect(prompt).toContain('font-size: 4.5rem');
    expect(prompt).toContain('Tablet (991px):');
    expect(prompt).toContain('font-size: 3.5rem');
    expect(prompt).toContain('Mobile (478px):');
    expect(prompt).toContain('font-size: 2.25rem');
    expect(prompt).toContain('button:');
    expect(prompt).toContain('padding-left: 2rem');
    expect(prompt).toContain('padding-left: 1.25rem');
    expect(prompt).toContain('section:');
    expect(prompt).toContain('padding-top: 6rem');
    expect(prompt).toContain('container:');
    expect(prompt).toContain('max-width: 76rem');
    expect(prompt.match(/EFFECTIVE BRICKS THEME STYLE/g)).toHaveLength(1);
  });

  it('projects Bricks breakpoint-suffixed controls with the configured breakpoint mode', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1280, base: true },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      breakpointMode: { mobileFirst: false, baseKey: 'desktop' },
      themeStyles: [{ id: 'site-style', settings: {
        container: {
          padding: { left: 'var(--gutter)', right: 'var(--gutter)' },
          'padding:mobile_portrait': { left: 'var(--gutter-small)', right: 'var(--gutter-small)' },
        },
      } }],
    });

    const container = context.resolution.styles[0]?.defaults.find((entry) => entry.element === 'container');
    expect(container?.properties).toMatchObject({
      'padding-left': 'var(--gutter)',
      'padding-right': 'var(--gutter)',
    });
    expect(container?.responsive).toEqual({
      mobile_portrait: {
        'padding-left': 'var(--gutter-small)',
        'padding-right': 'var(--gutter-small)',
      },
    });
    expect(formatPixflowBuildInBricksThemeStylePreviewCss(context)).toContain('@media (max-width: 478px)');
  });

  it('projects container defaults onto converter-recognized web containers instead of the flattened page main', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      themeStyles: [{ id: 'site-style', settings: {
        container: {
          widthMax: '76rem',
          padding: { left: '3rem', right: '3rem' },
        },
      } }],
    });

    const preview = formatPixflowBuildInBricksThemeStylePreviewCss(context);
    expect(preview).not.toMatch(/(?:^|,\s*)main(?:\s*,|\s*\{)/m);
    expect(preview).toContain('[class$="-container"]');
    expect(preview).toContain('.brxe-container');
  });

  it('keeps responsive-only element and typography controls instead of flattening or dropping them', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['responsive-only'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: null, base: true },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      themeStyles: [{ id: 'responsive-only', settings: {
        typography: {
          'typographyHeadingH2:mobile_portrait': { 'font-size': '1.75rem' },
        },
        button: {
          'padding:mobile_portrait': { top: '12px', right: '16px', bottom: '12px', left: '16px' },
        },
      } }],
    });

    const defaults = context.resolution.styles[0]?.defaults || [];
    expect(defaults.find((entry) => entry.element === 'h2')).toEqual({
      element: 'h2',
      properties: {},
      responsive: { mobile_portrait: { 'font-size': '1.75rem' } },
    });
    expect(defaults.find((entry) => entry.element === 'button')).toEqual({
      element: 'button',
      properties: {},
      responsive: {
        mobile_portrait: {
          'padding-top': '12px',
          'padding-right': '16px',
          'padding-bottom': '12px',
          'padding-left': '16px',
        },
      },
    });
    const preview = formatPixflowBuildInBricksThemeStylePreviewCss(context);
    expect(preview).toContain('@media (max-width: 478px)');
    expect(preview).toContain('font-size: 1.75rem;');
    expect(preview).toContain('padding-left: 16px;');
  });

  it('uses native Bricks responsive typography control keys and emits valid preview CSS', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['checkpoint-a'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      breakpointMode: { mobileFirst: false, baseKey: 'desktop' },
      themeStyles: [{ id: 'checkpoint-a', settings: {
        typography: {
          typographyHeadingH1: {
            'font-family': 'Inter',
            'font-size': '4.5rem',
            'font-weight': '750',
            'line-height': '1.02',
            'letter-spacing': '-0.025em',
          },
          'typographyHeadingH1:tablet_portrait': { 'font-size': '3.25rem' },
          'typographyHeadingH1:mobile_portrait': { 'font-size': '2.25rem' },
        },
        section: {
          padding: { top: '6rem', bottom: '6rem' },
          'padding:mobile_portrait': { top: '3.5rem', bottom: '3.5rem' },
        },
        container: {
          padding: { left: '3rem', right: '3rem' },
          'padding:mobile_portrait': { left: '1rem', right: '1rem' },
        },
        button: {
          sizeDefaultPadding: { top: '1rem', right: '2rem', bottom: '1rem', left: '2rem' },
          'sizeDefaultPadding:mobile_portrait': { top: '.8rem', right: '1.25rem', bottom: '.8rem', left: '1.25rem' },
        },
      } }],
    });

    const h1 = context.resolution.styles[0]?.defaults.find((entry) => entry.element === 'h1');
    expect(h1).toMatchObject({
      properties: {
        'font-family': 'Inter',
        'font-size': '4.5rem',
        'font-weight': '750',
        'line-height': '1.02',
        'letter-spacing': '-0.025em',
      },
      responsive: {
        tablet_portrait: { 'font-size': '3.25rem' },
        mobile_portrait: { 'font-size': '2.25rem' },
      },
    });
    const preview = formatPixflowBuildInBricksThemeStylePreviewCss(context);
    expect(preview).toContain('@media (max-width: 991px)');
    expect(preview).toContain('@media (max-width: 478px)');
    expect(preview).toContain('font-size: 3.25rem;');
    expect(preview).toContain('font-size: 2.25rem;');
    expect(preview).not.toContain('font-size:tablet_portrait');
    expect(preview).not.toContain('font-size:mobile_portrait');
  });

  it('emits responsive preview rules in authoritative Bricks breakpoint order, not option-property order', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['ordered-breakpoints'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      themeStyles: [{ id: 'ordered-breakpoints', settings: { typography: {
        typographyHeadingH1: { 'font-size': '4.5rem' },
        // Deliberately reverse stored property order. Bricks emits media rules
        // in configured breakpoint order, not object insertion order.
        'typographyHeadingH1:mobile_portrait': { 'font-size': '2.25rem' },
        'typographyHeadingH1:tablet_portrait': { 'font-size': '3.25rem' },
      } } }],
    });

    const preview = formatPixflowBuildInBricksThemeStylePreviewCss(context);
    expect(preview.indexOf('@media (max-width: 991px)')).toBeLessThan(preview.indexOf('@media (max-width: 478px)'));
  });

  it('does not simulate malformed declaration-level breakpoint suffixes as native Bricks controls', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['malformed'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      themeStyles: [{ id: 'malformed', settings: {
        typography: {
          typographyHeadingH1: {
            'font-size': '4.5rem',
            'font-size:tablet_portrait': '3.25rem',
            'font-size:mobile_portrait': '2.25rem',
          },
        },
      } }],
    });

    const h1 = context.resolution.styles[0]?.defaults.find((entry) => entry.element === 'h1');
    expect(h1).toEqual({ element: 'h1', properties: { 'font-size': '4.5rem' } });
    expect(context.diagnostics.unsupportedSettings).toEqual(expect.arrayContaining([
      expect.stringContaining('font-size:tablet_portrait'),
      expect.stringContaining('font-size:mobile_portrait'),
    ]));
    const preview = formatPixflowBuildInBricksThemeStylePreviewCss(context);
    expect(preview).not.toContain('@media');
    expect(preview).not.toContain('3.25rem');
    expect(preview).not.toContain('2.25rem');
  });

  it('omits responsive controls for unknown Bricks breakpoint keys with a bounded diagnostic', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['unknown-breakpoint'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      themeStyles: [{ id: 'unknown-breakpoint', settings: {
        typography: {
          typographyHeadingH1: { 'font-size': '4.5rem' },
          'typographyHeadingH1:phone_custom': { 'font-size': '2rem' },
        },
      } }],
    });

    expect(context.resolution.styles[0]?.defaults.find((entry) => entry.element === 'h1')).toEqual({
      element: 'h1',
      properties: { 'font-size': '4.5rem' },
    });
    expect(context.diagnostics.unsupportedSettings).toEqual([
      expect.stringContaining('typographyHeadingH1:phone_custom'),
    ]);
    expect(formatPixflowBuildInBricksThemeStylePreviewCss(context)).not.toContain('2rem');
  });

  it('changes snapshot identity for a meaningful native responsive typography change', () => {
    const input = (mobileSize: string) => ({
      policy: 'inherit_effective' as const,
      activeStyleIds: ['site-style'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      themeStyles: [{ id: 'site-style', settings: { typography: {
        typographyHeadingH1: { 'font-size': '4.5rem' },
        'typographyHeadingH1:mobile_portrait': { 'font-size': mobileSize },
      } } }],
    });
    const first = normalizePixflowBuildInBricksThemeStyleContext(input('2.25rem'));
    const changed = normalizePixflowBuildInBricksThemeStyleContext(input('2.5rem'));
    expect(changed.snapshotHash).not.toBe(first.snapshotHash);
  });

  it('preserves authoritative Bricks breakpoint order in snapshot identity', () => {
    const breakpoints = [
      { key: 'desktop', label: 'Desktop', width: 1279, base: true },
      { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false },
      { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
    ];
    const input = {
      policy: 'inherit_effective' as const,
      activeStyleIds: ['site-style'],
      themeStyles: [{ id: 'site-style', settings: { typography: {
        typographyHeadingH1: { 'font-size': '4.5rem' },
        'typographyHeadingH1:tablet_portrait': { 'font-size': '3.25rem' },
        'typographyHeadingH1:mobile_portrait': { 'font-size': '2.25rem' },
      } } }],
    };

    const nativeOrder = normalizePixflowBuildInBricksThemeStyleContext({ ...input, breakpoints });
    const changedOrder = normalizePixflowBuildInBricksThemeStyleContext({ ...input, breakpoints: [breakpoints[0], breakpoints[2], breakpoints[1]] });
    expect(changedOrder.snapshotHash).not.toBe(nativeOrder.snapshotHash);
  });

  it('recomputes canonical snapshot identity instead of trusting a transported hash', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      themeStyles: [{ id: 'site-style', settings: { body: { color: 'black' } } }],
    });
    const transported = {
      ...context,
      snapshotHash: 'theme-style-spoofed',
    };

    const normalized = normalizePixflowBuildInBricksThemeStyleContext(transported);
    expect(normalized.snapshotHash).toBe(context.snapshotHash);
    expect(normalized.snapshotHash).not.toBe('theme-style-spoofed');
  });

  it('sanitizes malformed declaration keys from transported responsive defaults', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      themeStyles: [{ id: 'site-style', settings: { typography: {
        typographyHeadingH1: { 'font-size': '4.5rem' },
        'typographyHeadingH1:mobile_portrait': { 'font-size': '2.25rem' },
      } } }],
    });
    const transported = structuredClone(context);
    const h1 = transported.resolution.styles[0]?.defaults.find((entry) => entry.element === 'h1');
    if (!h1?.responsive?.mobile_portrait) throw new Error('Expected canonical mobile H1 defaults.');
    h1.responsive.mobile_portrait['font-size:tablet_portrait'] = '99rem';

    const normalized = normalizePixflowBuildInBricksThemeStyleContext(transported);
    const previewCss = formatPixflowBuildInBricksThemeStylePreviewCss(normalized);

    expect(previewCss).toContain('font-size: 2.25rem');
    expect(previewCss).not.toContain('99rem');
    expect(normalized.diagnostics.unsupportedSettings).toEqual(expect.arrayContaining([
      expect.stringContaining('font-size:tablet_portrait'),
    ]));
  });

  it('keeps semantic snapshot identity stable across capture time and raw style input order', () => {
    const input = {
      policy: 'inherit_effective' as const,
      activeStyleIds: ['site-style', 'page-style'],
      themeStyles: [
        { id: 'page-style', active: true, settings: { button: { _border_radius: '0px' } } },
        { id: 'site-style', active: true, settings: { body: { _font_family: 'Inter' } } },
      ],
    };
    const first = normalizePixflowBuildInBricksThemeStyleContext({
      ...input,
      capturedAt: '2026-08-17T10:00:00.000Z',
    });
    const second = normalizePixflowBuildInBricksThemeStyleContext({
      ...input,
      themeStyles: [...input.themeStyles].reverse(),
      capturedAt: '2026-08-17T10:01:00.000Z',
    });

    expect(second.snapshotHash).toBe(first.snapshotHash);
  });

  it('changes semantic identity when effective cascade order changes', () => {
    const styles = [
      { id: 'site-style', active: true, settings: { button: { _border_radius: '24px' } } },
      { id: 'page-style', active: true, settings: { button: { _border_radius: '0px' } } },
    ];
    const pageWins = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style', 'page-style'],
      themeStyles: styles,
    });
    const siteWins = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['page-style', 'site-style'],
      themeStyles: styles,
    });

    expect(siteWins.snapshotHash).not.toBe(pageWins.snapshotHash);
  });

  it('uses explicit style order when Bricks does not provide an active-id list', () => {
    const styles = [
      { id: 'site-style', order: 20, active: true, settings: { button: { _border_radius: '24px' } } },
      { id: 'page-style', order: 10, active: true, settings: { button: { _border_radius: '0px' } } },
    ];
    const first = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      themeStyles: styles,
    });
    const reorderedInput = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      themeStyles: [...styles].reverse(),
    });
    const changedOrder = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      themeStyles: styles.map((style) => ({ ...style, order: style.id === 'site-style' ? 5 : 30 })),
    });

    expect(reorderedInput.snapshotHash).toBe(first.snapshotHash);
    expect(changedOrder.snapshotHash).not.toBe(first.snapshotHash);
  });

  it('changes semantic identity for property and responsive value changes', () => {
    const base = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      breakpoints: [{ key: 'mobile', label: 'Mobile', width: 767, base: false }],
      themeStyles: [{ id: 'site-style', settings: {
        heading: { _font_size: '3rem', responsive: { mobile: { _font_size: '2rem' } } },
      } }],
    });
    const changed = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      breakpoints: [{ key: 'mobile', label: 'Mobile', width: 767, base: false }],
      themeStyles: [{ id: 'site-style', settings: {
        heading: { _font_size: '3.1rem', responsive: { mobile: { _font_size: '1.9rem' } } },
      } }],
    });

    expect(changed.snapshotHash).not.toBe(base.snapshotHash);
  });

  it('normalizes Bricks typography defaults into the prompt and renderer projection', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      themeStyles: [{ id: 'site-style', settings: {
        typography: {
          typographyBody: {
            'font-family': 'Inter',
            'font-size': '18px',
            'line-height': '1.65',
            color: 'var(--text)',
          },
          typographyHeadings: {
            'font-family': 'Sora',
            'font-weight': '700',
            'letter-spacing': '-0.02em',
          },
        },
      } }],
    });

    const activeStyle = context.resolution.styles[0];
    expect(activeStyle?.defaults.find((entry) => entry.element === 'body')?.properties).toMatchObject({
      'font-family': 'Inter',
      'font-size': '18px',
      'line-height': '1.65',
      color: 'var(--text)',
    });
    expect(activeStyle?.defaults.find((entry) => entry.element === 'heading')?.properties).toMatchObject({
      'font-family': 'Sora',
      'font-weight': '700',
      'letter-spacing': '-0.02em',
    });

    const prompt = formatPixflowBuildInBricksThemeStyleContext(context);
    const preview = formatPixflowBuildInBricksThemeStylePreviewCss(context);
    expect(prompt).toContain('font-size: 18px');
    expect(prompt).toContain('font-weight: 700');
    expect(preview).toContain('font-family: Inter;');
    expect(preview).toContain('font-size: 18px;');
    expect(preview).toContain('font-family: Sora;');
    expect(preview).toContain('font-weight: 700;');
  });

  it('preserves native Bricks source-order cascade when a later heading group overrides an earlier H1 control', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['main', 'page-style'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      themeStyles: [
        {
          id: 'main',
          settings: {
            typography: {
              typographyHeadings: { 'font-family': 'Figtree', 'font-weight': '600', 'letter-spacing': '0em' },
              typographyHeadingH1: { 'font-size': 'var(--heading--2xl)', 'font-weight': '600', 'letter-spacing': '0em' },
            },
          },
        },
        {
          id: 'page-style',
          settings: {
            typography: {
              typographyHeadings: { 'font-family': 'Inter', 'font-weight': '750', 'letter-spacing': '-0.025em' },
              typographyHeadingH1: { 'font-size': '4.5rem', 'line-height': '1.02' },
              'typographyHeadingH1:tablet_portrait': { 'font-size': '3.25rem' },
              'typographyHeadingH1:mobile_portrait': { 'font-size': '2.25rem' },
            },
          },
        },
      ],
    });

    const h1 = listPixflowBuildInBricksThemeStyleEffectiveDeclarations(context)
      .filter((declaration) => declaration.element === 'h1' && declaration.breakpoint === null);
    expect(Object.fromEntries(h1.map((declaration) => [declaration.property, declaration.value]))).toMatchObject({
      'font-family': 'Inter',
      'font-size': '4.5rem',
      'font-weight': '750',
      'letter-spacing': '-0.025em',
      'line-height': '1.02',
    });

    const prompt = formatPixflowBuildInBricksThemeStyleContext(context);
    const preview = formatPixflowBuildInBricksThemeStylePreviewCss(context);
    expect(prompt).toContain('font-weight: 750');
    expect(preview).toMatch(/h1\s*\{[^}]*font-weight: 750;/s);
    expect(preview).toMatch(/@media \(max-width: 991px\)[\s\S]*h1\s*\{[^}]*font-size: 3.25rem;/);
    expect(preview).toMatch(/@media \(max-width: 478px\)[\s\S]*h1\s*\{[^}]*font-size: 2.25rem;/);
  });

  it('projects real Bricks button and form control containers onto their semantic CSS targets', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['site-style'],
      themeStyles: [{ id: 'site-style', settings: {
        button: {
          sizeDefaultPadding: { top: '1rem', right: '2rem', bottom: '1rem', left: '2rem' },
          typography: { 'font-size': '1rem', 'font-weight': '600' },
          border: {
            radius: { top: '4px', right: '4px', bottom: '4px', left: '4px' },
            width: { top: '1px', right: '1px', bottom: '1px', left: '1px' },
            style: 'solid',
          },
          primaryBackground: { raw: 'var(--accent)' },
        },
        form: {
          labelTypography: { 'font-size': '.75rem', 'font-weight': '500' },
          fieldTypography: { color: { raw: 'var(--heading)' }, 'line-height': '1.5' },
          fieldBackgroundColor: { raw: 'var(--input)' },
          fieldPadding: { top: '1.2rem', right: '1.4rem', bottom: '1.2rem', left: '1.4rem' },
        },
        image: { caption: 'none' },
      } }],
    });

    const defaults = context.resolution.styles[0]?.defaults || [];
    expect(defaults.find((entry) => entry.element === 'button')?.properties).toMatchObject({
      'padding-top': '1rem',
      'padding-right': '2rem',
      'padding-bottom': '1rem',
      'padding-left': '2rem',
      'font-size': '1rem',
      'font-weight': '600',
      'border-top-left-radius': '4px',
      'border-top-right-radius': '4px',
      'border-bottom-right-radius': '4px',
      'border-bottom-left-radius': '4px',
      'border-top-width': '1px',
      'border-style': 'solid',
    });
    expect(defaults.find((entry) => entry.element === 'button')?.properties).not.toHaveProperty('primary-background');
    expect(defaults.find((entry) => entry.element === 'form-field')?.properties).toMatchObject({
      color: 'var(--heading)',
      'line-height': '1.5',
      'background-color': 'var(--input)',
      'padding-top': '1.2rem',
      'padding-right': '1.4rem',
      'padding-bottom': '1.2rem',
      'padding-left': '1.4rem',
    });
    expect(defaults.find((entry) => entry.element === 'form-label')?.properties).toMatchObject({
      'font-size': '.75rem',
      'font-weight': '500',
    });
    expect(defaults.some((entry) => entry.element === 'image')).toBe(false);

    const preview = formatPixflowBuildInBricksThemeStylePreviewCss(context);
    expect(preview).toContain('padding-left: 2rem;');
    expect(preview).toContain('border-top-left-radius: 4px;');
    expect(preview).toContain('.brxe-form input');
    expect(preview).toContain('.brxe-form label');
    expect(preview).not.toContain('primary-background:');
    expect(preview).not.toContain('\n  top: 1rem;');
    expect(preview).not.toContain('caption: none;');
  });

  it('records source diagnostics and missing active styles without manufacturing defaults', () => {
    const context = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['missing-style'],
      themeStyles: [],
      diagnostics: {
        warnings: ['Bricks resolver returned an incomplete style set.'],
      },
      resolutionStatus: 'partial',
    });
    expect(context.resolution.status).toBe('partial');
    expect(context.resolution.styles).toEqual([]);
    expect(context.diagnostics.warnings).toEqual(expect.arrayContaining([
      'Bricks resolver returned an incomplete style set.',
      'One or more Bricks-resolved active Theme Styles were not present in the bounded context payload.',
    ]));
  });

  it('treats only an available inherited snapshot as source-generation ready', () => {
    const available = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      resolutionStatus: 'available',
    });
    const partial = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      resolutionStatus: 'partial',
    });
    const isolated = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'isolated',
      resolutionStatus: 'available',
    });
    expect(isPixflowBuildInBricksThemeStyleContextAuthoritative(available)).toBe(true);
    expect(isPixflowBuildInBricksThemeStyleContextAuthoritative(partial)).toBe(false);
    expect(isPixflowBuildInBricksThemeStyleContextAuthoritative(isolated)).toBe(false);
  });
});
