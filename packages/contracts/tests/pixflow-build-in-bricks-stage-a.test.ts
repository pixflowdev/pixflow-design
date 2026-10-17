import { describe, expect, it } from 'vitest';

import {
  validatePixflowBuildInBricksSourceArtifacts,
} from '../src/api/pixflow-build-in-bricks-context.js';
import {
  formatPixflowStageADesignContext,
  normalizePixflowStageADesignContext,
  validatePixflowStageASourceArtifacts,
} from '../src/api/pixflow-build-in-bricks-stage-a.js';
import { normalizePixflowBuildInBricksThemeStyleContext } from '../src/api/pixflow-build-in-bricks-theme-style.js';

describe('Build in Bricks Stage A context contract', () => {
  it('keeps eligible user/site values while excluding generated values', () => {
    const context = normalizePixflowStageADesignContext({
      revision: 'route-core-1',
      route: { id: 'core-framework', family: 'core-framework', available: true },
      tokens: {
        all: [
          {
            cssVar: '--primary',
            value: '#124',
            provenance: {
              origin: 'framework',
              frameworkMembership: 'member',
              frameworkEligible: true,
              designContextEligible: true,
            },
          },
          {
            cssVar: '--clone-offset',
            value: '12px',
            provenance: {
              origin: 'pixflow_generated',
              generator: 'website_clone',
              frameworkEligible: false,
              designContextEligible: false,
            },
          },
          {
            cssVar: '--user-accent',
            value: '#f0c',
            provenance: {
              origin: 'user',
              frameworkMembership: 'not_member',
              frameworkEligible: false,
              designContextEligible: true,
            },
          },
        ],
      },
      breakpoints: [
        { key: 'tablet', label: 'Tablet', width: 991, base: false },
        { key: 'mobile', label: 'Mobile', width: 767, base: false },
      ],
    });

    expect(context.tokens.all.map((token) => token.cssVar)).toEqual(['--primary', '--user-accent']);
    expect(context.diagnostics.excludedTokenCount).toBe(1);
    expect(context.breakpoints[0]).toMatchObject({ key: 'tablet', width: 991 });
  });

  it('formats real breakpoints and does not invent token values', () => {
    const formatted = formatPixflowStageADesignContext(normalizePixflowStageADesignContext({
      revision: 'route-acss-1',
      route: { id: 'acss', family: 'acss', available: true },
      breakpoints: [{ key: 'tablet', label: 'Tablet', width: 991, base: false }],
      tokens: {
        all: [{ cssVar: '--space-m', value: 'var(--space-m)', provenance: { origin: 'framework', designContextEligible: true } }],
      },
    }));

    expect(formatted).toContain('Tablet (tablet): 991px');
    expect(formatted).toContain('--space-m = var(--space-m)');
    expect(formatted).not.toContain('--space-xl');
  });

  it('allows locally declared component properties but rejects unknown site references', () => {
    const valid = validatePixflowStageASourceArtifacts({
      html: '<section class="hero"><h1>Editorial</h1></section>',
      css: '.hero { --hero-glow-size: 42rem; box-shadow: 0 0 var(--hero-glow-size) #000; color: var(--primary); }',
      scope: 'section',
      allowedCssVariables: ['--primary'],
    });
    const invalid = validatePixflowStageASourceArtifacts({
      html: '<section class="hero"><h1>Editorial</h1></section>',
      css: '.hero { color: var(--invented-framework-token); }',
      scope: 'section',
    });

    expect(valid.ok).toBe(true);
    expect(valid.locallyDeclaredCssVariables).toContain('--hero-glow-size');
    expect(invalid.ok).toBe(false);
    expect(invalid.issues.join('\n')).toContain('--invented-framework-token');
    const fallback = validatePixflowStageASourceArtifacts({
      html: '<section><h1>Editorial</h1></section>',
      css: 'section { color: var(--unknown-site-token, #111); }',
      scope: 'section',
    });
    expect(fallback.ok).toBe(true);
    expect(fallback.warnings.join('\n')).toContain('--unknown-site-token');

    const inventedGlobal = validatePixflowStageASourceArtifacts({
      html: '<section class="hero"><h1>Editorial</h1></section>',
      css: ':root { --invented-site-token: #123; } .hero { color: var(--invented-site-token); }',
      scope: 'section',
      enforceGlobalTokenProvenance: true,
    });
    expect(inventedGlobal.ok).toBe(false);
    expect(inventedGlobal.issues.join('\n')).toContain('unknown global site variable --invented-site-token');
  });

  it('rejects authored redeclarations of supplied site tokens for ordinary Build', () => {
    const validation = validatePixflowStageASourceArtifacts({
      html: '<main class="page"><h1>Editorial</h1></main>',
      css: ':root { --space-m: 2rem; } .page { padding: var(--space-m); }',
      scope: 'full_page',
      allowedCssVariables: ['--space-m'],
      enforceGlobalTokenProvenance: true,
      forbidGlobalSiteVariableDeclarations: true,
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues.join('\n')).toContain('redeclares supplied site variable --space-m');
  });

  it('rejects exact Theme Style restatements while allowing deliberate overrides', () => {
    const themeStyleContext = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['editorial'],
      themeStyles: [{
        id: 'editorial',
        settings: {
          typography: {
            typographyBody: { fontSize: '18px', lineHeight: '1.65' },
            typographyHeadings: { fontWeight: '750' },
          },
          button: {
            padding: { top: '1rem', right: '2rem', bottom: '1rem', left: '2rem' },
            border: { radius: { top: '28px', right: '28px', bottom: '28px', left: '28px' } },
          },
          section: { padding: { top: '6rem', bottom: '6rem' } },
          container: { widthMax: '76rem', padding: { left: '3rem', right: '3rem' } },
        },
      }],
    });
    const validation = validatePixflowStageASourceArtifacts({
      html: '<main class="page"><section class="journal-section"><div class="journal-container"><h1>Editorial</h1><button>Read</button></div></section></main>',
      css: [
        'body { font-size: 18px; line-height: 1.65; }',
        '.page h1 { font-weight: 750; }',
        '.journal-section { padding: var(--section-padding, 6rem) 0; }',
        '.journal-container { max-width: 76rem; padding-inline: 3rem; }',
        '.page button { padding: 1rem 2rem; border-radius: 4px; }',
      ].join('\n'),
      scope: 'full_page',
      themeStyleContext,
      enforceInheritedThemeStyleDiscipline: true,
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues.join('\n')).toContain('redundantly restates inherited Theme Style defaults');
    expect(validation.issues.join('\n')).toContain('body font-size=18px');
    expect(validation.issues.join('\n')).toContain('button padding-top=1rem');
    expect(validation.issues.join('\n')).not.toContain('border-radius=4px');
  });

  it('detects a trusted-token responsive H1 shadow without rejecting an intentional button-radius override', () => {
    const themeStyleContext = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['checkpoint-a'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: null, base: true },
        { key: 'mobile', label: 'Mobile', width: 478, base: false },
      ],
      themeStyles: [{ id: 'checkpoint-a', settings: {
        typography: {
          typographyHeadingH1: { fontSize: '4.5rem' },
          'typographyHeadingH1:mobile': { fontSize: '2.25rem' },
        },
        button: {
          border: { radius: { top: '28px', right: '28px', bottom: '28px', left: '28px' } },
          padding: { top: '1rem', right: '2rem', bottom: '1rem', left: '2rem' },
        },
        section: { padding: { top: '6rem', bottom: '6rem' } },
      } }],
    });

    const validation = validatePixflowBuildInBricksSourceArtifacts({
      html: '<main><section class="nsa-hero"><h1 id="hero-title" class="nsa-hero__title">North Star</h1><button class="nsa-button">Explore</button></section></main>',
      css: [
        '.nsa-hero__title { font-size: var(--heading--2xl); }',
        '.nsa-hero { padding-block: var(--section-space); }',
        '.nsa-button { border-radius: 4px; }',
      ].join('\n'),
      scope: 'full_page',
      allowedCssVariables: ['--heading--2xl', '--section-space'],
      eligibleCssVariableValues: { '--heading--2xl': '4.5rem', '--section-space': '6rem' },
      themeStyleContext,
      enforceInheritedThemeStyleDiscipline: true,
    });

    expect(validation.findings).toContainEqual(expect.objectContaining({
      code: 'theme_style_responsive_shadow',
      element: 'h1',
      property: 'font-size',
      breakpoint: 'mobile',
      selector: '.nsa-hero__title',
      authoredValue: 'var(--heading--2xl)',
      effectiveValue: '2.25rem',
    }));
    expect(validation.issues.join('\n')).not.toContain('border-radius: 4px');
    expect(validation.findings.some((finding) => finding.element === 'button' && finding.property.includes('radius'))).toBe(false);
    expect(validation.findings).toContainEqual(expect.objectContaining({
      code: 'theme_style_redundant_inheritance',
      element: 'section',
      property: 'padding-top',
      selector: '.nsa-hero',
      authoredValue: 'var(--section-space)',
      effectiveValue: '6rem',
    }));

    const idSelector = validatePixflowBuildInBricksSourceArtifacts({
      html: '<main><section><h1 id="hero-title">North Star</h1></section></main>',
      css: '#hero-title { font-size: var(--heading--2xl); }',
      scope: 'full_page',
      allowedCssVariables: ['--heading--2xl'],
      eligibleCssVariableValues: { '--heading--2xl': '4.5rem' },
      themeStyleContext,
      enforceInheritedThemeStyleDiscipline: true,
    });
    expect(idSelector.findings).toContainEqual(expect.objectContaining({
      code: 'theme_style_responsive_shadow',
      selector: '#hero-title',
      element: 'h1',
    }));

    const intentionalResponsiveOverride = validatePixflowBuildInBricksSourceArtifacts({
      html: '<main><section><h1 class="nsa-hero__title">North Star</h1></section></main>',
      css: '.nsa-hero__title { font-size: var(--heading--2xl); } @media (max-width: 478px) { .nsa-hero__title { font-size: 2rem; } }',
      scope: 'full_page',
      allowedCssVariables: ['--heading--2xl'],
      eligibleCssVariableValues: { '--heading--2xl': '4.5rem' },
      themeStyleContext,
      enforceInheritedThemeStyleDiscipline: true,
    });
    expect(intentionalResponsiveOverride.findings.some((finding) => finding.code === 'theme_style_responsive_shadow')).toBe(false);
  });

  it('checks desktop media declarations against the effective base Theme Style', () => {
    const themeStyleContext = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['checkpoint-a'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'tablet_portrait', label: 'Tablet portrait', width: 991, base: false },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      themeStyles: [{ id: 'checkpoint-a', settings: {
        typography: {
          typographyHeadingH1: { fontSize: '4.5rem' },
          'typographyHeadingH1:tablet_portrait': { fontSize: '3.25rem' },
          'typographyHeadingH1:mobile_portrait': { fontSize: '2.25rem' },
        },
      } }],
    });

    const validation = validatePixflowBuildInBricksSourceArtifacts({
      html: '<main><section><h1 class="nsa-hero__title">North Star</h1></section></main>',
      css: '@media (min-width: 992px) { .nsa-hero__title { font-size: var(--heading--2xl); } }',
      scope: 'full_page',
      allowedCssVariables: ['--heading--2xl'],
      eligibleCssVariableValues: { '--heading--2xl': '4.5rem' },
      themeStyleContext,
      enforceInheritedThemeStyleDiscipline: true,
    });

    expect(validation.findings).toContainEqual(expect.objectContaining({
      code: 'theme_style_redundant_inheritance',
      element: 'h1',
      property: 'font-size',
      breakpoint: null,
      selector: '.nsa-hero__title',
      authoredValue: 'var(--heading--2xl)',
      effectiveValue: '4.5rem',
    }));

    const responsiveOnly = validatePixflowBuildInBricksSourceArtifacts({
      html: '<main><section><h1 class="nsa-hero__title">North Star</h1></section></main>',
      css: '@media (max-width: 478px) { .nsa-hero__title { font-size: var(--heading--2xl); } }',
      scope: 'full_page',
      allowedCssVariables: ['--heading--2xl'],
      eligibleCssVariableValues: { '--heading--2xl': '4.5rem' },
      themeStyleContext,
      enforceInheritedThemeStyleDiscipline: true,
    });
    expect(responsiveOnly.findings).not.toContainEqual(expect.objectContaining({
      code: 'theme_style_redundant_inheritance',
      breakpoint: null,
    }));
  });

  it('recognizes a source-owned fluid value as an intentional responsive treatment', () => {
    const themeStyleContext = normalizePixflowBuildInBricksThemeStyleContext({
      policy: 'inherit_effective',
      activeStyleIds: ['checkpoint-a'],
      breakpoints: [
        { key: 'desktop', label: 'Desktop', width: 1279, base: true },
        { key: 'mobile_portrait', label: 'Mobile portrait', width: 478, base: false },
      ],
      themeStyles: [{ id: 'checkpoint-a', settings: {
        section: {
          padding: { top: '6rem', bottom: '6rem' },
          'padding:mobile_portrait': { top: '3.5rem', bottom: '3.5rem' },
        },
        typography: {
          typographyHeadingH1: { fontSize: '4.5rem' },
          'typographyHeadingH1:mobile_portrait': { fontSize: '2.25rem' },
        },
      } }],
    });

    const fluid = validatePixflowBuildInBricksSourceArtifacts({
      html: '<main><section class="nsa-hero"><h1 class="nsa-hero__title">North Star</h1></section></main>',
      css: '.nsa-hero { padding-bottom: clamp(4rem, 8vw, 7.5rem); }',
      scope: 'full_page',
      themeStyleContext,
      enforceInheritedThemeStyleDiscipline: true,
    });
    expect(fluid.findings).not.toContainEqual(expect.objectContaining({
      code: 'theme_style_responsive_shadow',
      selector: '.nsa-hero',
      property: 'padding-bottom',
    }));

    const fixed = validatePixflowBuildInBricksSourceArtifacts({
      html: '<main><section class="nsa-hero"><h1 class="nsa-hero__title">North Star</h1></section></main>',
      css: '.nsa-hero { padding-bottom: 5rem; }',
      scope: 'full_page',
      themeStyleContext,
      enforceInheritedThemeStyleDiscipline: true,
    });
    expect(fixed.findings).toContainEqual(expect.objectContaining({
      code: 'theme_style_responsive_shadow',
      selector: '.nsa-hero',
      property: 'padding-bottom',
      breakpoint: 'mobile_portrait',
    }));

    const trustedFixedTokenWithFluidFallback = validatePixflowBuildInBricksSourceArtifacts({
      html: '<main><section><h1 class="nsa-hero__title">North Star</h1></section></main>',
      css: '.nsa-hero__title { font-size: var(--heading--2xl, clamp(4rem, 8vw, 7rem)); }',
      scope: 'full_page',
      allowedCssVariables: ['--heading--2xl'],
      eligibleCssVariableValues: { '--heading--2xl': '4.5rem' },
      themeStyleContext,
      enforceInheritedThemeStyleDiscipline: true,
    });
    expect(trustedFixedTokenWithFluidFallback.findings).toContainEqual(expect.objectContaining({
      code: 'theme_style_responsive_shadow',
      selector: '.nsa-hero__title',
      property: 'font-size',
      breakpoint: 'mobile_portrait',
    }));
  });

  it('ignores CSS comments when classifying local custom-property declarations', () => {
    const validation = validatePixflowStageASourceArtifacts({
      html: '<main class="page"><h1>Editorial</h1></main>',
      css: [
        '/* Page-scoped tokens: never declare these on :root, html, or body. */',
        '.page { --page-bg: #f1f0ee; --page-text: #322f35; background: var(--page-bg); color: var(--page-text); }',
      ].join('\n'),
      scope: 'full_page',
      enforceGlobalTokenProvenance: true,
    });

    expect(validation.ok).toBe(true);
    expect(validation.issues).toEqual([]);
    expect(validation.locallyDeclaredCssVariables).toEqual(expect.arrayContaining(['--page-bg', '--page-text']));
  });

  it('does not leak unknown or generated values through category-specific token groups', () => {
    const context = normalizePixflowStageADesignContext({
      tokens: {
        all: [],
        colours: [
          { cssVar: '--legacy-colour', provenance: { origin: 'unknown' } },
          { cssVar: '--clone-colour', provenance: { origin: 'pixflow_generated', designContextEligible: false } },
          { cssVar: '--site-colour', provenance: { origin: 'user', designContextEligible: true } },
        ],
      },
    });
    expect(context.tokens.colours.map((token) => token.cssVar)).toEqual(['--site-colour']);
  });

  it('formats only provenance-eligible palette colours', () => {
    const context = normalizePixflowStageADesignContext({
      colours: [
        {
          id: 'site-palette',
          name: 'Site palette',
          provenance: { origin: 'user', designContextEligible: true },
          colors: [
            { id: 'ink', label: 'Ink', raw: '#101010', provenance: { origin: 'user', designContextEligible: true } },
            { id: 'clone', label: 'Clone', raw: '#f00', provenance: { origin: 'pixflow_generated', designContextEligible: false } },
          ],
        },
        {
          id: 'generated-palette',
          provenance: { origin: 'pixflow_generated', designContextEligible: false },
          colors: [{ id: 'generated', raw: '#0f0', provenance: { origin: 'pixflow_generated', designContextEligible: false } }],
        },
      ],
    });
    const formatted = formatPixflowStageADesignContext(context);
    expect(formatted).toContain('Site palette: Ink = #101010');
    expect(formatted).not.toContain('Clone = #f00');
    expect(formatted).not.toContain('generated-palette');
  });

  it('keeps Local and BYOK validation semantics identical for equivalent source', () => {
    const source = {
      html: '<section class="hero"><h1>Web-native</h1></section>',
      css: '.hero { --hero-glow-size: 42rem; color: var(--primary); }',
      js: 'document.querySelector(".hero");',
      scope: 'section' as const,
      allowedCssVariables: ['--primary'],
    };
    const local = validatePixflowStageASourceArtifacts(source);
    const byok = validatePixflowStageASourceArtifacts({ ...source });
    expect(byok).toEqual(local);
  });
});
