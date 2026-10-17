import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const routeContract = {
  routeId: 'pixflow-core',
  routeFamily: 'core',
  matchPolicy: {
    spacing: { mode: 'near_numeric', relative: 0.03, absolutePx: 0.75 },
    typography: { mode: 'near_numeric', relative: 0.05, absolutePx: 0.25 },
    radius: { mode: 'near_numeric', relative: 0.08, absolutePx: 1 },
    shadow: { mode: 'exact_css' },
    container: { mode: 'near_numeric', relative: 0.01, absolutePx: 2 },
    layout: { mode: 'exact_css' },
    colour: { mode: 'separate_authority' },
  },
  variableAuthority: {
    mode: 'live_route_context',
    variables: [
      { name: 'space--m', cssName: '--space-m', value: '20px', categoryName: 'Spacing' },
      { name: 'text--m', cssName: '--text-m', value: '16px', categoryName: 'Typography' },
      { name: 'radius--m', cssName: '--radius-m', value: '8px', categoryName: 'Radius' },
      { name: 'shadow--card', cssName: '--shadow-card', value: '0 2px 8px rgba(0,0,0,.2)', categoryName: 'Shadow' },
      { name: 'max-screen-width', cssName: '--max-screen-width', value: '1200px', categoryName: 'Layout' },
      { name: 'grid--2', cssName: '--grid-2', value: 'repeat(2,minmax(0,1fr))', categoryName: 'Grid' },
      { name: 'color--primary', cssName: '--color-primary', value: '#123456', categoryName: 'Colour' },
    ],
  },
};

function normalize(result: Record<string, unknown>, options: Record<string, unknown>) {
  const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const { normalizeStageBRouteTokenValues } = await import(${JSON.stringify(bridgeModuleUrl)});
     const result = ${JSON.stringify(result)};
     const report = normalizeStageBRouteTokenValues(result, ${JSON.stringify(routeContract)}, ${JSON.stringify(options)});
     process.stdout.write(JSON.stringify({ result, report }));`,
  ], { encoding: 'utf8' });
  return JSON.parse(output) as { result: any; report: any };
}

describe('Stage B framework contract', () => {
  it('substitutes only exact or category-tolerant non-colour equivalents with evidence', () => {
    const result = {
      global_classes: [{
        id: 'class-card',
        name: 'card',
        settings: {
          _padding: { top: '20.5px', right: '22px' },
          _typography: { 'font-size': '16.2px', color: '#123456' },
          _border: { radius: { top: '8.5px' } },
          _boxShadow: '0 2px 8px rgba(0,0,0,.2)',
          _widthMax: '1201px',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        },
      }],
    };

    const normalized = normalize(result, { conversionProfile: 'prototype_bricks' });
    const report = normalized.report;
    const settings = normalized.result.global_classes[0].settings;

    expect(settings._padding.top).toBe('var(--space-m)');
    expect(settings._padding.right).toBe('22px');
    expect(settings._typography['font-size']).toBe('var(--text-m)');
    expect(settings._typography.color).toBe('#123456');
    expect(settings._border.radius.top).toBe('var(--radius-m)');
    expect(settings._boxShadow).toBe('var(--shadow-card)');
    expect(settings._widthMax).toBe('var(--max-screen-width)');
    expect(settings.gridTemplateColumns).toBe('var(--grid-2)');
    expect(report.rewrites).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceValue: '20.5px',
        targetValue: '20px',
        targetToken: 'space--m',
        category: 'spacing',
        confidence: 'near_exact',
        reason: 'nearest_spacing_token',
        provenance: expect.objectContaining({ source: 'observed_source', output: 'framework_equivalent' }),
      }),
    ]));
    expect(report.routeTokenFallbacks).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceValue: '22px', category: 'spacing', provenance: 'observed_source' }),
    ]));
  });

  it('preserves all uploaded-HTML literals and remains editable without route tokens', () => {
    const result = {
      global_classes: [{ id: 'class-card', name: 'card', settings: { _padding: { top: '20px' } } }],
    };
    const normalized = normalize(result, { conversionProfile: 'uploaded_html' });
    const report = normalized.report;
    expect(normalized.result.global_classes[0].settings._padding.top).toBe('20px');
    expect(report).toMatchObject({ rewriteCount: 0, literalRewriteMode: 'uploaded_html_preserve_literals' });
    expect(report.valueProvenance.observedSource[0]).toMatchObject({ provenance: 'observed_source' });
  });
});
