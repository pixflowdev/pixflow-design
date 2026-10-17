import { describe, expect, it } from 'vitest';

import { reconcilePixflowHtmlTokenGraph } from '../html-to-bricks-token-graph.mjs';

function liveRoute(status = 'available') {
  return {
    frameworkContext: { status, libraryMappingAllowed: false },
    matchPolicy: {
      spacing: { mode: 'near_numeric', relative: 0.03, absolutePx: 0.75 },
      colour: { mode: 'separate_authority' },
    },
    variableAuthority: {
      mode: status === 'available' ? 'live_route_context' : 'explicit_bricks_settings',
      variables: [
        { id: 'route-space', name: 'space--m', cssName: '--space-m', value: '16px', categoryName: 'Spacing' },
        { id: 'route-colour', name: 'color--brand', cssName: '--color-brand', value: '#123456', categoryName: 'Colour' },
      ],
      allowedCssVariables: ['--space-m', '--color-brand'],
    },
  };
}

describe('Pixflow HTML token graph', () => {
  it('never materialises truncated functional colours that contain CSS variables', () => {
    const report = reconcilePixflowHtmlTokenGraph({
      cssText: ':root{--brand:220 60% 10%}.one{color:hsl(var(--brand))}.two{background:hsl(var(--brand))}',
      globalClasses: [],
      pageSettings: {},
    });

    expect(report.mutationIntent.resourceAdditions.variables).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ value: expect.stringContaining('hsl(var(') }),
    ]));
  });

  it('resolves nested, fallback, cyclic, scoped, responsive, runtime, and fluid variables without undefined output', () => {
    const globalClasses = [
      {
        id: 'card-id',
        name: 'card',
        settings: {
          _padding: { top: '16px', right: 'var(--space)' },
          _gap: '24px',
          _border: { radius: { top: 'var(--runtime-radius)' } },
          _typography: { color: { raw: 'var(--local-colour)' } },
          _background: { color: { raw: '#123456' } },
        },
      },
      { id: 'grid-id', name: 'grid', settings: { _gap: '24px' } },
    ];
    const pageSettings = { customCss: ':root { --base: 8px; }' };
    const report = reconcilePixflowHtmlTokenGraph({
      cssText: `
        :root {
          --base: 8px;
          --space: calc(var(--base) * 2);
          --fallback: var(--missing, 12px);
          --cycle-a: var(--cycle-b, 4px);
          --cycle-b: var(--cycle-a);
          --fluid: clamp(12px, 2vw, 28px);
        }
        .card { --local-colour: #123456; }
        .card { border-color: #123456; }
        @media (max-width: 478px) { :root { --space: clamp(8px, 3vw, 16px); } }
      `,
      globalClasses,
      pageSettings,
      sourceClassIdByName: new Map([['card', 'card-id']]),
      runtimeVariables: { '--runtime-radius': '6px' },
      routeContract: liveRoute(),
      existingGlobalData: {
        palettes: [{ id: 'user-palette', name: 'Source colours', owner: 'user' }],
        variables: [{ id: 'user-space', name: 'pf-source-space', value: '99px', owner: 'user' }],
      },
    });

    expect(report).toMatchObject({
      schema: 'pixflow.html_to_bricks.token_graph.v1',
      ok: true,
      undefinedOutputReferenceCount: 0,
      cycleCount: 1,
      framework: { exactReuseCount: 1, rejectedColourCount: 1 },
      collisions: { userOwnedOverwriteCount: 0 },
    });
    expect(report.tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '--space', status: 'resolved', responsive: true }),
      expect.objectContaining({ name: '--fallback', resolvedValue: '12px', resolution: 'authored_fallback' }),
      expect.objectContaining({ name: '--cycle-a', resolvedValue: '4px', resolution: 'cycle_fallback' }),
      expect.objectContaining({ name: '--fluid', resolvedValue: 'clamp(12px, 2vw, 28px)' }),
    ]));
    expect(globalClasses[0].settings._padding.top).toBe('var(--space-m)');
    expect(globalClasses[0].settings._padding.right).toBe('var(--space)');
    expect(globalClasses[0].settings._border.radius.top).toBe('6px');
    expect(globalClasses[0].settings._typography.color.raw).toBe('var(--local-colour)');
    expect(globalClasses[0].settings._background.color.raw).toMatch(/^var\(--pf-source-color-/);
    expect(globalClasses[0].settings._gap).toMatch(/^var\(--pf-source-spacing-/);
    expect(globalClasses[1].settings._gap).toBe(globalClasses[0].settings._gap);
    expect(globalClasses[0].settings._cssCustom).toContain('--local-colour: #123456');
    expect(pageSettings.customCss).toContain('--fluid: clamp(12px, 2vw, 28px)');
    expect(report.mutationIntent.resourceAdditions).toMatchObject({
      variables: expect.arrayContaining([
        expect.objectContaining({ semanticRole: 'colour', owner: 'pixflow' }),
        expect.objectContaining({ semanticRole: 'spacing', owner: 'pixflow' }),
      ]),
      paletteColors: [expect.objectContaining({ owner: 'pixflow', raw: expect.stringMatching(/^var\(--pf-source-color-/) })],
    });
  });

  it('rejects framework substitution when route evidence is stale or the value is not an exact uploaded-source match', () => {
    for (const [status, value] of [['stale', '16px'], ['available', '16.4px']] as const) {
      const globalClasses = [{ id: 'card-id', name: 'card', settings: { _padding: { top: value } } }];
      const report = reconcilePixflowHtmlTokenGraph({
        cssText: '.card { padding-top: 16px; }',
        globalClasses,
        pageSettings: {},
        sourceClassIdByName: new Map([['card', 'card-id']]),
        routeContract: liveRoute(status),
      });
      expect(globalClasses[0].settings._padding.top).toBe(value);
      expect(report.framework.exactReuseCount).toBe(0);
      expect(report.framework.fallbacks).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceValue: value, provenance: 'observed_source' }),
      ]));
    }
  });

  it('preserves trusted destination variables referenced by authored responsive CSS', () => {
    const globalClasses = [{
      id: 'heading-id',
      name: 'hero-title',
      settings: {
        _cssCustom: '@media (min-width: 992px) { %root% { font-size: var(--heading--2xl) !important; } }',
      },
    }];
    const routeContract = liveRoute();
    routeContract.variableAuthority.variables.push({
      id: 'route-heading',
      name: 'heading--2xl',
      cssName: '--heading--2xl',
      value: '4.5rem',
      categoryName: 'Typography',
    });
    routeContract.variableAuthority.allowedCssVariables.push('--heading--2xl');

    const report = reconcilePixflowHtmlTokenGraph({
      cssText: '@media (min-width: 992px) { .hero-title { font-size: var(--heading--2xl); } }',
      globalClasses,
      pageSettings: {},
      routeContract,
    });

    expect(globalClasses[0].settings._cssCustom).toContain('var(--heading--2xl)');
    expect(globalClasses[0].settings._cssCustom).not.toContain('unset');
    expect(report.ok).toBe(true);
    expect(report.undefinedOutputReferences).toEqual([]);
    expect(report.resolvedUndefinedVariableNames).not.toContain('--heading--2xl');
    expect(report.outputDefinedVariables).toContain('--heading--2xl');
  });
});
