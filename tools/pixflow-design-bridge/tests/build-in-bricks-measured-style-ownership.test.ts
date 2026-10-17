import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;

function evaluateBridge(expression: string): any {
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const bridge = await import(${JSON.stringify(bridgeModuleUrl)}); process.stdout.write(JSON.stringify(await (${expression})));`,
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function conversionFixture(options: {
  sourceContract?: string;
  conversionProfile?: string;
  sourceFidelityClone?: boolean;
  authoredHeading?: boolean;
  authoredHeadingImportant?: boolean;
  authoredButtonPadding?: boolean;
} = {}): any {
  const headingProperties = options.authoredHeading ? ['font-family', 'font-size'] : [];
  const headingWinners = options.authoredHeading ? {
    'font-family': {
      value: '"Some Authored Family", sans-serif',
      computedValue: '"Some Authored Family", sans-serif',
      important: false,
    },
    'font-size': {
      value: '5rem',
      computedValue: '80px',
      important: options.authoredHeadingImportant === true,
    },
  } : {};
  const evidence = (viewport: string, headingSize: string, buttonPadding: string) => ({
    heading: {
      tag: 'h1',
      classes: ['hero__title'],
      styles: {
        display: 'block',
        'font-family': options.authoredHeading ? '"Some Authored Family", sans-serif' : '"Times New Roman"',
        'font-size': options.authoredHeading ? '80px' : headingSize,
        'font-weight': '700',
        'line-height': 'normal',
        'letter-spacing': 'normal',
        color: 'rgb(17, 17, 17)',
      },
      authoredProperties: headingProperties,
      winningDeclarations: headingWinners,
      provenance: { viewport },
    },
    button: {
      tag: 'a',
      classes: ['button', 'button--accent'],
      styles: {
        display: 'inline-flex',
        'font-family': '"Times New Roman"',
        'font-size': '15px',
        'font-weight': '600',
        'letter-spacing': '0.4px',
        'line-height': '21px',
        'padding-top': buttonPadding,
        'padding-right': buttonPadding,
        'padding-bottom': buttonPadding,
        'padding-left': buttonPadding,
        'border-radius': '4px',
      },
      authoredProperties: [
        'border-radius',
        ...(options.authoredButtonPadding
          ? ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']
          : []),
      ],
      winningDeclarations: {
        'border-radius': { value: '4px', computedValue: '4px', important: false },
        ...(options.authoredButtonPadding ? {
          'padding-top': { value: viewport === 'mobile' ? '1rem' : '2rem', computedValue: buttonPadding, important: false },
          'padding-right': { value: viewport === 'mobile' ? '1.5rem' : '3rem', computedValue: buttonPadding, important: false },
          'padding-bottom': { value: viewport === 'mobile' ? '1rem' : '2rem', computedValue: buttonPadding, important: false },
          'padding-left': { value: viewport === 'mobile' ? '1.5rem' : '3rem', computedValue: buttonPadding, important: false },
        } : {}),
      },
      provenance: { viewport },
    },
  });
  const desktop = evidence('desktop', '32px', '28.8px');
  const base = evidence('bricks_base', '32px', '28.8px');
  const mobile = evidence('mobile', '36px', '16px');

  return evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest(${JSON.stringify({
    result: {
      content: [
        {
          id: 'heading',
          name: 'heading',
          settings: {
            _attributes: [{ name: 'data-pf-source-id', value: 'pf-heading' }],
            ...(options.authoredHeadingImportant ? {
              _cssGlobalClasses: ['authored-heading'],
            } : {}),
          },
        },
        {
          id: 'button',
          name: 'button',
          settings: {
            _attributes: [{ name: 'data-pf-source-id', value: 'pf-button' }],
          },
        },
      ],
      global_classes: options.authoredHeadingImportant ? [{
        id: 'authored-heading',
        name: 'hero__title',
        settings: { _cssCustom: '%root% { font-size: 5rem !important; }' },
      }] : [],
    },
    renderedSnapshot: {
      available: true,
      inputKind: 'document_bundle',
      viewports: [
        { id: 'desktop', width: 1440 },
        { id: 'bricks_base', width: 992 },
        { id: 'mobile', width: 390 },
      ],
      nodesBySourceId: {
        'pf-heading': [desktop.heading, base.heading, mobile.heading],
        'pf-button': [desktop.button, base.button, mobile.button],
      },
    },
    conversionProfile: options.conversionProfile ?? 'uploaded_html',
    sourceContract: options.sourceContract,
    sourceFidelityClone: options.sourceFidelityClone,
    bricksBreakpoints: [{ key: 'mobile_portrait', width: 478 }],
    fontSystem: { fonts: [{ family: 'Some Authored Family' }] },
  })})`);
}

function measuredSettingsFor(result: any, elementId: string): Record<string, any> {
  const element = result.result.content.find((entry: any) => entry.id === elementId);
  const measuredId = (element?.settings?._cssGlobalClasses ?? []).find((id: string) => (
    result.result.global_classes.some((item: any) => item.id === id && item.name.startsWith('pixflow-measured-'))
  ));
  return result.result.global_classes.find((item: any) => item.id === measuredId)?.settings ?? {};
}

describe('ordinary Build measured-style ownership', () => {
  it('resolves measured-style ownership fail-closed from the explicit source contract', () => {
    const resolveOwnership = (input: Record<string, unknown>) => evaluateBridge(
      `bridge.applyStageBMeasuredSourceEvidenceForTest(${JSON.stringify({
        result: { content: [], global_classes: [] },
        ...input,
      })})`,
    ).report.measuredStyleOwnership;

    expect(resolveOwnership({
      sourceContract: 'build-in-bricks-html-first',
      conversionProfile: 'uploaded_html',
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {} },
    })).toBe('authored_source');
    expect(resolveOwnership({
      sourceContract: 'build-in-bricks-html-first',
      conversionProfile: 'uploaded_html',
      renderedSnapshot: { available: false },
    })).toBe('authored_source');
    expect(resolveOwnership({
      sourceContract: 'build-in-bricks-html-first',
      conversionProfile: 'uploaded_html',
      renderedSnapshot: {},
    })).toBe('authored_source');
    expect(resolveOwnership({
      conversionProfile: 'prototype_bricks',
      sourceFidelityClone: true,
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {} },
    })).toBe('browser_fidelity');
    expect(resolveOwnership({
      conversionProfile: 'uploaded_html',
      renderedSnapshot: { available: true, inputKind: 'single_document', nodesBySourceId: {} },
    })).toBe('browser_fidelity');
    expect(resolveOwnership({
      conversionProfile: 'prototype_bricks',
      renderedSnapshot: { available: false },
    })).toBe('fill_missing');
  });

  it('does not promote inherited Theme Style or browser values while preserving an authored radius', () => {
    const result = conversionFixture({ sourceContract: 'build-in-bricks-html-first' });
    const heading = measuredSettingsFor(result, 'heading');
    const button = measuredSettingsFor(result, 'button');
    const serialized = JSON.stringify(result.result.global_classes);

    expect(heading._typography).toBeUndefined();
    expect(heading._cssCustom).toBeUndefined();
    expect(button._typography).toBeUndefined();
    expect(button._padding).toBeUndefined();
    expect(button['_padding:mobile_portrait']).toBeUndefined();
    expect(button._border).toMatchObject({ radius: { top: '4px', right: '4px', bottom: '4px', left: '4px' } });
    expect(serialized).not.toContain('Times New Roman');
    expect(serialized).not.toContain('32px');
    expect(serialized).not.toContain('36px');
    expect(serialized).not.toContain('28.8px');
    expect(serialized).not.toContain('16px');
    expect(serialized).not.toContain('font-size: 32px !important');
    expect(result.report.measuredStyleOwnership).toBe('authored_source');
  });

  it('keeps explicit authored typography without synthesizing renderer-derived important rules', () => {
    const result = conversionFixture({
      sourceContract: 'build-in-bricks-html-first',
      authoredHeading: true,
    });
    const heading = measuredSettingsFor(result, 'heading');

    expect(heading._typography).toMatchObject({
      'font-family': 'Some Authored Family',
      'font-size': '5rem',
    });
    expect(heading._cssCustom ?? '').not.toContain('font-size: 80px !important');
  });

  it('keeps genuinely authored responsive spacing while inherited spacing stays unset', () => {
    const result = conversionFixture({
      sourceContract: 'build-in-bricks-html-first',
      authoredButtonPadding: true,
    });
    const button = measuredSettingsFor(result, 'button');

    expect(button._padding).toEqual({ top: '2rem', right: '3rem', bottom: '2rem', left: '3rem' });
    expect(button['_padding:mobile_portrait']).toEqual({ top: '1rem', right: '1.5rem', bottom: '1rem', left: '1.5rem' });
  });

  it('retains genuine authored important CSS while omitting synthesized measured important CSS', () => {
    const result = conversionFixture({
      sourceContract: 'build-in-bricks-html-first',
      authoredHeading: true,
      authoredHeadingImportant: true,
    });
    const sourceClass = result.result.global_classes.find((item: any) => item.id === 'authored-heading');
    const measured = measuredSettingsFor(result, 'heading');

    expect(sourceClass.settings._cssCustom).toContain('font-size: 5rem !important');
    expect(measured._cssCustom ?? '').not.toContain('font-size: 80px !important');
  });

  it('keeps measured fidelity for generic HTML-to-Bricks and Website Clone profiles', () => {
    const htmlToBricks = conversionFixture({ conversionProfile: 'uploaded_html' });
    const websiteClone = conversionFixture({
      conversionProfile: 'prototype',
      sourceFidelityClone: true,
    });

    for (const result of [htmlToBricks, websiteClone]) {
      expect(measuredSettingsFor(result, 'heading')._typography).toMatchObject({
        'font-family': 'Times New Roman',
        'font-size': '32px',
      });
      expect(measuredSettingsFor(result, 'button')._padding).toBeDefined();
      expect(result.report.measuredStyleOwnership).toBe('browser_fidelity');
    }
  });
});
