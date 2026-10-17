import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;

function evaluateBridge(expression: string): unknown {
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const bridge = await import(${JSON.stringify(bridgeModuleUrl)}); process.stdout.write(JSON.stringify(await (${expression})));`,
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

describe('HTML-to-Bricks runtime-audit fidelity', () => {
  it('preserves descendant selector CSS for classes retained inside editable heading markup', () => {
    const css = evaluateBridge(`bridge.buildPixflowStageBInlineMarkupPageCssForTest({
      html: '<h2 class="heroB__title">Build.<br>Secure.<br><span class="accent">Maintain.</span></h2>',
      cssText: ':root { --at-primary: #1763d6; } .heroB__title .accent { color: var(--at-primary); }',
      classNames: ['accent']
    })`) as string;
    expect(css).toContain('#brx-content .heroB__title .accent');
    expect(css).toContain('color: var(--at-primary)');
  });

  it('normalizes rem controls and media breakpoints against the authored HTML root size', () => {
    const result = evaluateBridge(`bridge.normalizeStageBSourceRemUnitsForBricksForTest({
      content: [],
      global_classes: [{ id: 'logo', name: 'logo', settings: {
        _width: '8.1rem',
        _cssCustom: '@media (max-width: 85rem) { %root% { display: none; } }'
      }}],
      page_settings: { customCss: 'html { font-size: 62.5%; }' }
    })`) as { global_classes: Array<{ settings: Record<string, unknown> }> };

    expect(result.global_classes[0].settings._width).toBe('81px');
    // CSS media-query rem units use the browser's initial 16px value, not the
    // authored document root used by normal declarations.
    expect(result.global_classes[0].settings._cssCustom).toContain('max-width: 1360px');
  });

  it('treats uploaded HTML as source-fidelity input without a Website Clone flag', () => {
    const result = evaluateBridge(`bridge.buildPixflowStageBPageBaseCssForTest({
      cssText: ':root{--title-size:56px}html,body{background-color:#111;color:#eee;font-size:18px}body{min-height:100%}',
      conversionProfile: 'uploaded_html'
    })`) as string;

    expect(result).toContain(':root { --title-size: 56px; }');
    expect(result).toContain('body, #brx-content');
    expect(result).toContain('background-color: #111');
    expect(result).toContain('font-size: 18px');
    expect(result).toContain('min-height: 100vh');
  });

  it('preserves the ordinary Build source contract through conversion-policy normalization', () => {
    const policy = evaluateBridge(`bridge.summarizeStageBConversionPolicyForTest({
      conversionProfile: 'uploaded_html',
      sourceContract: 'build-in-bricks-html-first',
      themeStylePolicy: 'inherit_effective'
    })`) as Record<string, unknown>;

    expect(policy).toMatchObject({
      conversionProfile: 'uploaded_html',
      sourceContract: 'build-in-bricks-html-first',
    });
  });

  it('lets settled measured values replace unresolved or inherited class settings', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'heading', name: 'heading', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-1' }],
          _cssGlobalClasses: ['title-class']
        }}],
        global_classes: [{ id: 'title-class', name: 'title', settings: {
          _typography: { 'font-size': 'var(--missing-title-size)', color: { raw: 'inherit' } }
        }}]
      },
      renderedSnapshot: {
        available: true,
        nodesBySourceId: {
          'pf-source-1': [{ styles: { 'font-size': '56px', color: 'rgb(238, 238, 238)', 'line-height': '56px' }, provenance: { viewport: 'bricks_base' } }]
        }
      }
    })` ) as { result: { content: Array<{ settings: Record<string, unknown> }> }; report: { unresolvedSettingCount: number } };

    const typography = result.result.content[0].settings._typography as Record<string, unknown>;
    expect(typography['font-size']).toBe('56px');
    expect(typography.color).toEqual({ raw: 'rgb(238, 238, 238)' });
    expect(result.report.unresolvedSettingCount).toBe(0);
  });

  it('uses the settled rendered state for completed entrance animation opacity and transforms', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'hero-image-wrap', name: 'block', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-hero' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-hero': [{
            styles: { opacity: '1', transform: 'matrix(1, 0, 0, 1, 0, 0)', 'animation-name': 'heroFadeIn' },
            authoredProperties: ['opacity', 'transform', 'animation-name'],
            winningDeclarations: {
              opacity: { value: '0', computedValue: '1' },
              transform: { value: 'scale(1.05)', computedValue: 'matrix(1, 0, 0, 1, 0, 0)' },
              'animation-name': { value: 'heroFadeIn', computedValue: 'heroFadeIn' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _opacity: '1',
      _transform: { scaleX: '1', scaleY: '1', translateX: '0', translateY: '0' },
    });
  });

  it('starts recognised AOS scroll reveals in their visible settled state', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: { content: [{ id: 'faq', name: 'div', settings: {
        _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-faq' }]
      }}], global_classes: [] },
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {
        'pf-source-faq': [{
          classes: ['faqs', 'aos-init'],
          styles: { opacity: '0', transform: 'matrix(1, 0, 0, 1, 0, 48)' },
          authoredProperties: ['opacity', 'transform'],
          winningDeclarations: {
            opacity: { value: '0', computedValue: '0' },
            transform: { value: 'translate3d(0, 48px, 0)', computedValue: 'matrix(1, 0, 0, 1, 0, 48)' }
          }, provenance: { viewport: 'desktop' }
        }]
      }}
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._opacity).toBe('1');
    expect(measured?.settings._transform).toBeUndefined();
  });

  it('does not freeze generic runtime reveal start states into measured parity classes', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: { content: [{ id: 'process-heading', name: 'div', settings: {
        _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-process-heading' }]
      }}], global_classes: [] },
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {
        'pf-source-process-heading': [{
          classes: ['exp__head', 'reveal'],
          styles: {
            display: 'block',
            opacity: '0',
            transform: 'matrix(1, 0, 0, 1, 0, 24)',
            transition: 'opacity 800ms ease, transform 800ms ease'
          },
          authoredProperties: ['display', 'opacity', 'transform', 'transition'],
          winningDeclarations: {
            display: { value: 'block', computedValue: 'block' },
            opacity: { value: '0', computedValue: '0' },
            transform: { value: 'translateY(24px)', computedValue: 'matrix(1, 0, 0, 1, 0, 24)' },
            transition: { value: 'opacity 800ms ease, transform 800ms ease', computedValue: 'opacity 0.8s ease 0s, transform 0.8s ease 0s' }
          }, provenance: { viewport: 'desktop' }
        }]
      }}
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._display).toBe('block');
    expect(measured?.settings._opacity).toBeUndefined();
    expect(measured?.settings._transform).toBeUndefined();
  });

  it('keeps a source footer-reveal footer in flow when Bricks nests it inside the content root', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'site-footer', name: 'section', settings: {
          tag: 'footer',
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-footer' }]
        }}],
        global_classes: [],
        page_settings: { customCss: '#brx-content { margin-bottom: 550px; position: relative; z-index: 1; }' }
      },
      renderedSnapshot: { available: true, inputKind: 'single_document', nodesBySourceId: {
        'pf-source-footer': [{
          tag: 'footer',
          classes: ['site-footer'],
          styles: { display: 'block', position: 'fixed', left: '0px', right: '0px', bottom: '0px', 'z-index': '0' },
          authoredProperties: ['display', 'position', 'left', 'right', 'bottom', 'z-index'],
          winningDeclarations: {
            display: { value: 'block', computedValue: 'block', selector: '.site-footer' },
            position: { value: 'fixed', computedValue: 'fixed', selector: 'body.footer-reveal .site-footer' },
            left: { value: '0', computedValue: '0px', selector: 'body.footer-reveal .site-footer' },
            right: { value: '0', computedValue: '0px', selector: 'body.footer-reveal .site-footer' },
            bottom: { value: '0', computedValue: '0px', selector: 'body.footer-reveal .site-footer' },
            'z-index': { value: '0', computedValue: '0', selector: 'body.footer-reveal .site-footer' }
          },
          matchedRules: [{ selector: '.site-footer' }, { selector: 'body.footer-reveal .site-footer' }],
          provenance: { viewport: 'desktop' }
        }]
      }}
    })`) as {
      result: {
        global_classes: Array<{ name: string; settings: Record<string, unknown> }>;
        page_settings: { customCss: string };
      };
      report: { nestedFixedFooterNormalizedCount: number };
    };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._position).toBeUndefined();
    expect(measured?.settings._bottom).toBeUndefined();
    expect(result.result.page_settings.customCss).toContain('#brx-content { margin-bottom: 0 !important; }');
    expect(result.report.nestedFixedFooterNormalizedCount).toBe(1);
  });

  it('keeps intrinsic header links and buttons on one line when their mobile source state is hidden', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'header-cta', name: 'button', settings: {
          text: 'Start a Project',
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-header-cta' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: { available: true, inputKind: 'single_document', nodesBySourceId: {
        'pf-source-header-cta': [
          { rect: { width: 154, height: 34 }, styles: { display: 'flex', 'font-size': '12px', 'line-height': '18px', 'padding-top': '6px', 'padding-bottom': '6px', 'border-top-width': '2px', 'border-bottom-width': '2px' }, provenance: { viewport: 'desktop' } },
          { rect: { width: 0, height: 0 }, styles: { display: 'none', 'font-size': '12px', 'line-height': '18px' }, provenance: { viewport: 'bricks_base' } },
          { rect: { width: 0, height: 0 }, styles: { display: 'none', 'font-size': '12px', 'line-height': '18px' }, provenance: { viewport: 'mobile' } }
        ]
      }}
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._typography).toMatchObject({ 'white-space': 'nowrap' });
  });

  it('does not freeze a desktop single-line heading when the mobile source wraps', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'section-heading', name: 'heading', settings: {
          text: 'Six technologies. Endless applications.',
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-section-heading' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: { available: true, inputKind: 'single_document', nodesBySourceId: {
        'pf-source-section-heading': [
          { rect: { width: 560, height: 40 }, styles: { display: 'block', 'line-height': '40px' }, provenance: { viewport: 'desktop' } },
          { rect: { width: 500, height: 40 }, styles: { display: 'block', 'line-height': '40px' }, provenance: { viewport: 'bricks_base' } },
          { rect: { width: 327, height: 75 }, styles: { display: 'block', 'line-height': '37.5px' }, provenance: { viewport: 'mobile' } }
        ]
      }}
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect((measured?.settings._typography as Record<string, unknown> | undefined)?.['white-space']).toBeUndefined();
  });

  it('does not freeze responsive dimension variables to the desktop capture size', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'global-wrapper', name: 'section', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-wrapper' }],
          _cssGlobalClasses: ['source-wrapper']
        }}],
        global_classes: [{ id: 'source-wrapper', name: 'txf-global-wrapper', settings: {
          _widthMin: '100vw', _widthMax: 'var(--pf-source-document-width)'
        }}]
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [
          { id: 'desktop', width: 1440, variables: { '--document-width': '1440px' } },
          { id: 'bricks_base', width: 992, variables: { '--document-width': '992px' } },
          { id: 'mobile', width: 390, variables: { '--document-width': '390px' } }
        ],
        nodesBySourceId: { 'pf-source-wrapper': [
          { styles: { width: '1440px', 'min-width': '1440px', 'max-width': '1440px' }, authoredProperties: ['width', 'min-width', 'max-width'], winningDeclarations: {
            width: { value: '100%', computedValue: '1440px' },
            'min-width': { value: '100vw', computedValue: '1440px' },
            'max-width': { value: 'var(--document-width)', computedValue: '1440px' }
          }, provenance: { viewport: 'desktop' } },
          { styles: { width: '992px', 'min-width': '992px', 'max-width': '992px' }, authoredProperties: ['width', 'min-width', 'max-width'], winningDeclarations: {
            width: { value: '100%', computedValue: '992px' },
            'min-width': { value: '100vw', computedValue: '992px' },
            'max-width': { value: 'var(--document-width)', computedValue: '992px' }
          }, provenance: { viewport: 'bricks_base' } },
          { styles: { width: '390px', 'min-width': '390px', 'max-width': '390px' }, authoredProperties: ['width', 'min-width', 'max-width'], winningDeclarations: {
            width: { value: '100%', computedValue: '390px' },
            'min-width': { value: '100vw', computedValue: '390px' },
            'max-width': { value: 'var(--document-width)', computedValue: '390px' }
          }, provenance: { viewport: 'mobile' } }
        ] }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._width).toBeUndefined();
    expect(measured?.settings._widthMin).toBeUndefined();
    expect(measured?.settings._widthMax).toBeUndefined();
  });

  it('keeps an asymmetric source scroll container as the page scroll owner', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: { content: [{ id: 'global-wrapper', name: 'section', settings: {
        _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-scroll-owner' }]
      }}], global_classes: [] },
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {
        'pf-source-scroll-owner': [{
          styles: { display: 'block', overflow: 'auto scroll', 'overflow-x': 'auto', 'overflow-y': 'scroll' },
          authoredProperties: ['overflow-x', 'overflow-y'],
          winningDeclarations: {
            'overflow-x': { value: 'visible', computedValue: 'auto' },
            'overflow-y': { value: 'scroll', computedValue: 'scroll' }
          }, provenance: { viewport: 'desktop' }
        }]
      }}
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._overflow).toBe('auto');
  });

  it('keeps max-width-only inline-block actions intrinsic-width', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: { content: [{ id: 'action', name: 'block', settings: {
        _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-action' }]
      }}], global_classes: [] },
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {
        'pf-source-action': [{
          styles: { display: 'inline-block', 'max-width': '100%' },
          authoredProperties: ['display', 'max-width'],
          winningDeclarations: {
            display: { value: 'inline-block', computedValue: 'inline-block' },
            'max-width': { value: '100%', computedValue: '100%' }
          }, provenance: { viewport: 'desktop' }
        }]
      }}
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({ _display: 'inline-block', _width: 'auto', _widthMax: '100%' });
  });

  it('keeps proven block-fill children full-width inside block parents', () => {
    const evidence = (id, width, viewport) => ({
      sourceNodeId: id,
      styles: { display: 'block', position: 'static', width: width + 'px', 'padding-left': '0px', 'padding-right': '0px' },
      rect: { x: 20, y: 100, width, height: 80 },
      authoredProperties: ['box-sizing'],
      winningDeclarations: { 'box-sizing': { value: 'border-box', computedValue: 'border-box' } },
      provenance: { viewport }
    });
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: { content: [
        { id: 'parent', name: 'div', parent: '', children: ['child'], settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-parent' }]
        }},
        { id: 'child', name: 'div', parent: 'parent', children: [], settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-child' }]
        }}
      ], global_classes: [] },
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {
        'pf-source-parent': [${JSON.stringify(evidence('pf-source-parent', 616, 'desktop'))}, ${JSON.stringify(evidence('pf-source-parent', 376, 'bricks_base'))}, ${JSON.stringify(evidence('pf-source-parent', 345, 'mobile'))}],
        'pf-source-child': [${JSON.stringify(evidence('pf-source-child', 616, 'desktop'))}, ${JSON.stringify(evidence('pf-source-child', 376, 'bricks_base'))}, ${JSON.stringify(evidence('pf-source-child', 345, 'mobile'))}]
      }}
    })`) as { result: { content: Array<{ id: string; settings: Record<string, unknown> }> } };
    expect(result.result.content.find((item) => item.id === 'child')?.settings._width).toBe('100%');
  });

  it('keeps negative-gutter flex rows auto-width inside block parents', () => {
    const parent = (width, viewport) => ({ styles: { display: 'block', 'padding-left': '0px', 'padding-right': '0px' }, rect: { width }, provenance: { viewport } });
    const child = (width, viewport) => ({ styles: { display: 'flex', position: 'static', 'margin-left': '-36px', 'margin-right': '-36px' }, rect: { width }, authoredProperties: ['display', 'margin-left', 'margin-right'], winningDeclarations: { display: { value: 'flex', computedValue: 'flex' }, 'margin-left': { value: '-36px', computedValue: '-36px' }, 'margin-right': { value: '-36px', computedValue: '-36px' } }, provenance: { viewport } });
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: { content: [
        { id: 'parent', name: 'div', parent: '', children: ['row'], settings: { _attributes: [{ name: 'data-pf-source-id', value: 'pf-parent' }] } },
        { id: 'row', name: 'block', parent: 'parent', children: [], settings: { _cssGlobalClasses: ['row-class'], _attributes: [{ name: 'data-pf-source-id', value: 'pf-row' }] } }
      ], global_classes: [{ id: 'row-class', name: 'row', settings: { _width: 'auto' } }] },
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {
        'pf-parent': [${JSON.stringify(parent(843, 'desktop'))}, ${JSON.stringify(parent(620, 'bricks_base'))}, ${JSON.stringify(parent(345, 'mobile'))}],
        'pf-row': [${JSON.stringify(child(843, 'desktop'))}, ${JSON.stringify(child(620, 'bricks_base'))}, ${JSON.stringify(child(345, 'mobile'))}]
      }}
    })`) as { result: { content: Array<{ id: string; settings: Record<string, unknown> }> } };
    const row = result.result.content.find((item) => item.id === 'row');
    expect(row?.settings._cssGlobalClasses).toContain('row-class');
    const measured = result.result.global_classes.find((item) => String(item.settings._cssCustom || '').includes('width: auto !important'));
    expect(measured?.settings._cssCustom).toContain('width: auto !important');
    expect(measured?.settings._cssCustom).toContain('max-width: none !important');
  });

  it('preserves authored logical auto margins instead of freezing desktop centering pixels', () => {
    const evidence = (viewport, width, margin) => ({
      styles: { display: 'block', width: `${width}px`, 'max-width': '1280px', 'margin-left': `${margin}px`, 'margin-right': `${margin}px` },
      authoredProperties: ['max-width', 'margin-left', 'margin-right', 'margin-inline-start', 'margin-inline-end'],
      winningDeclarations: {
        'max-width': { value: '1280px', computedValue: '1280px' },
        'margin-left': { value: '0px', computedValue: `${margin}px` },
        'margin-right': { value: '0px', computedValue: `${margin}px` },
        'margin-inline-start': { value: 'auto', computedValue: `${margin}px` },
        'margin-inline-end': { value: 'auto', computedValue: `${margin}px` }
      },
      provenance: { viewport }
    });
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: { content: [{ id: 'centered', name: 'div', settings: {
        _attributes: [{ name: 'data-pf-source-id', value: 'pf-centered' }]
      }}], global_classes: [] },
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {
        'pf-centered': [${JSON.stringify(evidence('desktop', 1280, 80))}, ${JSON.stringify(evidence('bricks_base', 992, 0))}, ${JSON.stringify(evidence('mobile', 390, 0))}]
      }}
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, any> }> } };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._margin).toMatchObject({ left: 'auto', right: 'auto' });
  });

  it('keeps sidecar-defined variables in state CSS while pruning truly undefined references', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [],
        global_classes: [{ id: 'form-class', name: 'contact-form', settings: {
          _cssCustom: '%root% input:focus-visible { border-color: var(--pol-blue); background: var(--pol-surface); color: var(--missing-colour); box-shadow: 0 0 0 4px rgba(20,88,212,.09); }'
        }}],
        stage_b_token_graph_report: {
          outputDefinedVariables: ['--pol-blue', '--pol-surface']
        }
      },
      renderedSnapshot: {}
    })`) as {
      result: { global_classes: Array<{ settings: { _cssCustom: string } }> };
      report: { undefinedSettingPrunedCount: number; unresolvedSettingCount: number };
    };

    const css = result.result.global_classes[0].settings._cssCustom;
    expect(css).toContain('border-color: var(--pol-blue)');
    expect(css).toContain('background: var(--pol-surface)');
    expect(css).toContain('box-shadow: 0 0 0 4px rgba(20,88,212,.09)');
    expect(css).not.toContain('--missing-colour');
    expect(result.report).toMatchObject({ undefinedSettingPrunedCount: 1, unresolvedSettingCount: 0 });
  });

  it('restores the referenced compiler-owned inline inheritance control', () => {
    const result = evaluateBridge(`bridge.ensureStageBInlineInheritanceClassForTest({
      content: [{ id: 'inline-text', name: 'text-basic', settings: {
        text: 'Context brand',
        _cssGlobalClasses: ['inherit-class']
      }}],
      global_classes: [{ id: 'inherit-class', name: 'stage-a-inline-inherit', settings: {} }]
    })`) as {
      result: { global_classes: Array<{ settings: Record<string, unknown> }> };
      report: { referenced: boolean; restored: boolean };
    };

    expect(result.report).toMatchObject({ referenced: true, restored: true });
    expect(result.result.global_classes[0].settings).toMatchObject({
      _typography: { color: { raw: 'inherit' } },
    });
  });

  it('restores the referenced compiler-owned blockquote inheritance control', () => {
    const result = evaluateBridge(`bridge.ensureStageBBlockquoteInheritanceClassForTest({
      content: [{ id: 'quote', name: 'text-basic', settings: {
        text: 'Accepted quotation',
        _cssGlobalClasses: ['blockquote-defaults']
      }}],
      global_classes: [{
        id: 'blockquote-defaults',
        name: 'stage-a-blockquote-defaults',
        settings: { _position: 'static', _typography: {} }
      }]
    })`) as {
      result: { global_classes: Array<{ settings: Record<string, unknown> }> };
      report: { referenced: boolean; restored: boolean };
    };

    expect(result.report).toMatchObject({ referenced: true, restored: true });
    expect(result.result.global_classes[0].settings).toMatchObject({
      _typography: { 'font-weight': 'inherit' },
    });
  });

  it('deduplicates the winning browser cascade into late authoritative Bricks classes', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [
          { id: 'heading-a', name: 'heading', settings: {
            _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-a' }],
            _cssGlobalClasses: ['early-class', 'late-class']
          }},
          { id: 'heading-b', name: 'heading', settings: {
            _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-b' }],
            _cssGlobalClasses: ['late-class', 'early-class']
          }}
        ],
        global_classes: [
          { id: 'early-class', name: 'early', settings: { _typography: { 'font-size': '18px', color: { raw: 'red' } } } },
          { id: 'late-class', name: 'late', settings: { _typography: { 'font-size': '22px', color: { raw: 'green' } } } }
        ]
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'single_document',
        nodesBySourceId: {
          'pf-source-a': [
            { styles: { 'font-size': '48px', color: 'rgb(10, 20, 30)', 'line-height': '52px', 'margin-left': '13px' }, authoredProperties: ['font-size', 'color', 'line-height', 'margin-left'], provenance: { viewport: 'bricks_base' } },
            { styles: { 'font-size': '32px', color: 'rgb(10, 20, 30)', 'line-height': '36px', 'margin-left': '13px' }, authoredProperties: ['font-size', 'color', 'line-height', 'margin-left'], provenance: { viewport: 'mobile' } }
          ],
          'pf-source-b': [
            { styles: { 'font-size': '48px', color: 'rgb(10, 20, 30)', 'line-height': '52px', 'margin-left': '13px' }, authoredProperties: ['font-size', 'color', 'line-height', 'margin-left'], provenance: { viewport: 'bricks_base' } },
            { styles: { 'font-size': '32px', color: 'rgb(10, 20, 30)', 'line-height': '36px', 'margin-left': '13px' }, authoredProperties: ['font-size', 'color', 'line-height', 'margin-left'], provenance: { viewport: 'mobile' } }
          ]
        }
      }
    })`) as {
      result: {
        content: Array<{ settings: { _cssGlobalClasses: string[] } }>;
        global_classes: Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      };
      report: { authoritativeProjectionCount: number; sharedMeasuredClassCount: number };
    };

    const measuredClasses = result.result.global_classes.filter((item) => item.name.startsWith('pixflow-measured-'));
    expect(measuredClasses).toHaveLength(1);
    expect(measuredClasses[0].settings).toMatchObject({
      _margin: { left: '13px' },
      _typography: { 'font-size': '48px', color: { raw: 'rgb(10, 20, 30)' }, 'line-height': '52px' },
      '_typography:mobile_portrait': { 'font-size': '32px', color: { raw: 'rgb(10, 20, 30)' }, 'line-height': '36px' },
    });
    expect(result.result.content[0].settings._cssGlobalClasses.at(-1)).toBe(measuredClasses[0].id);
    expect(result.result.content[1].settings._cssGlobalClasses.at(-1)).toBe(measuredClasses[0].id);
    expect(result.report).toMatchObject({ authoritativeProjectionCount: 2, sharedMeasuredClassCount: 1 });
  });

  it('pins authoritative measured layout on the element above conflicting source classes', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'section', name: 'section', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-section' }],
          _cssGlobalClasses: ['source-class']
        }}],
        global_classes: [{ id: 'source-class', name: 'source-row', settings: {
          _display: 'flex', _direction: 'row', _justifyContent: 'center'
        }}]
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-section': [{
            styles: { display: 'flex', 'flex-direction': 'column', 'flex-wrap': 'nowrap', 'justify-content': 'center' },
            authoredProperties: ['display', 'flex-direction', 'flex-wrap', 'justify-content'],
            winningDeclarations: {
              display: { value: 'flex', computedValue: 'flex' },
              'flex-direction': { value: 'column', computedValue: 'column' },
              'flex-wrap': { value: 'nowrap', computedValue: 'nowrap' },
              'justify-content': { value: 'center', computedValue: 'center' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as {
      result: {
        content: Array<{ settings: Record<string, unknown> }>;
        global_classes: Array<{ name: string; settings: Record<string, unknown> }>;
      };
    };

    expect(result.result.content[0].settings).toMatchObject({
      _display: 'flex',
      _direction: 'column',
      _flexWrap: 'nowrap',
      _justifyContent: 'center',
    });
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._cssCustom).toContain('display: flex !important');
    expect(measured?.settings._cssCustom).toContain('flex-direction: column !important');
  });

  it('rejects shifted measured evidence whose source tag cannot belong to the compiled Bricks element', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'hero', name: 'section', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-shifted' }],
          _cssGlobalClasses: ['hero-layout']
        }}],
        global_classes: [{ id: 'hero-layout', name: 'hero-layout', settings: { _display: 'grid' } }]
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'single_document',
        nodesBySourceId: {
          'pf-source-shifted': [{
            tag: 'h1',
            styles: { display: 'block', 'font-size': '104px' },
            authoredProperties: ['display', 'font-size'],
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as {
      result: {
        content: Array<{ settings: Record<string, unknown> }>;
        global_classes: Array<{ name: string; settings: Record<string, unknown> }>;
      };
      report: { sourceEvidenceIdentityMismatchCount: number; authoritativeProjectionCount: number };
    };

    expect(result.result.content[0].settings._cssGlobalClasses).toEqual(['hero-layout']);
    expect(result.result.global_classes.some((item) => item.name.startsWith('pixflow-measured-'))).toBe(false);
    expect(result.report).toMatchObject({
      sourceEvidenceIdentityMismatchCount: 1,
      authoritativeProjectionCount: 0,
    });
  });

  it('uses the desktop capture as the base style when desktop and Bricks-base evidence both exist', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'heading', name: 'heading', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-heading' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [
          { id: 'desktop', width: 1440 },
          { id: 'bricks_base', width: 992 },
          { id: 'mobile', width: 390 }
        ],
        nodesBySourceId: {
          'pf-source-heading': [
            { styles: { 'font-size': '64px', 'line-height': '70px' }, authoredProperties: ['font-size', 'line-height'], provenance: { viewport: 'desktop' } },
            { styles: { 'font-size': '52px', 'line-height': '58px' }, authoredProperties: ['font-size', 'line-height'], provenance: { viewport: 'bricks_base' } },
            { styles: { 'font-size': '40px', 'line-height': '44px' }, authoredProperties: ['font-size', 'line-height'], provenance: { viewport: 'mobile' } }
          ]
        }
      }
    })`) as { result: { content: Array<{ settings: Record<string, unknown> }>; global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _typography: { 'font-size': '64px', 'line-height': '70px' },
      '_typography:mobile_portrait': { 'font-size': '40px', 'line-height': '44px' },
    });
    expect(measured?.settings._cssCustom).toContain('max-width: 992px');
    expect(measured?.settings._cssCustom).toContain(':is([class*="brxe-"])');
    expect(measured?.settings._cssCustom).toContain('font-size: 52px');
  });

  it('uses computed typography at each viewport when media-query winners retain authored relative values', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'heading', name: 'heading', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-heading' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [
          { id: 'desktop', width: 1440 },
          { id: 'bricks_base', width: 992 },
          { id: 'mobile', width: 390 }
        ],
        nodesBySourceId: {
          'pf-source-heading': [
            {
              styles: { 'font-size': '60px', 'line-height': '60px' },
              authoredProperties: ['font-size', 'line-height'],
              winningDeclarations: {
                'font-size': { value: '2.5rem', computedValue: '60px' },
                'line-height': { value: '1', computedValue: '60px' }
              },
              provenance: { viewport: 'desktop' }
            },
            {
              styles: { 'font-size': '60px', 'line-height': '60px' },
              authoredProperties: ['font-size', 'line-height'],
              winningDeclarations: {
                'font-size': { value: 'calc(1.375rem + 1.5vw)', computedValue: '60px' },
                'line-height': { value: '1', computedValue: '60px' }
              },
              provenance: { viewport: 'bricks_base' }
            },
            {
              styles: { 'font-size': '32px', 'line-height': '32px' },
              authoredProperties: ['font-size', 'line-height'],
              winningDeclarations: {
                'font-size': { value: '32px', computedValue: '32px' },
                'line-height': { value: '1', computedValue: '32px' }
              },
              provenance: { viewport: 'mobile' }
            }
          ]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _typography: { 'font-size': '60px', 'line-height': '60px' },
      '_typography:mobile_portrait': { 'font-size': '32px', 'line-height': '32px' },
    });
  });

  it('uses computed responsive flex values when provenance retains an inactive conditional declaration', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'footer-row', name: 'container', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-footer-row' }],
          _cssGlobalClasses: ['flex-col', 'responsive-row']
        }}],
        global_classes: [
          { id: 'flex-col', name: 'flex-col', settings: { _display: 'flex', _direction: 'column' } },
          { id: 'responsive-row', name: '@md:flex-row', settings: { _direction: 'row', _justifyContent: 'space-between' } }
        ]
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [
          { id: 'desktop', width: 1440 },
          { id: 'bricks_base', width: 992 },
          { id: 'mobile', width: 390 }
        ],
        nodesBySourceId: {
          'pf-source-footer-row': [
            {
              styles: { display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'nowrap', 'justify-content': 'space-between' },
              authoredProperties: ['display', 'flex-direction', 'flex-wrap', 'justify-content'],
              winningDeclarations: {
                display: { value: 'flex', computedValue: 'flex' },
                'flex-direction': { value: 'row', computedValue: 'row' },
                'flex-wrap': { value: 'nowrap', computedValue: 'nowrap' },
                'justify-content': { value: 'space-between', computedValue: 'space-between' }
              },
              provenance: { viewport: 'desktop' }
            },
            {
              styles: { display: 'flex', 'flex-direction': 'row', 'flex-wrap': 'nowrap', 'justify-content': 'space-between' },
              authoredProperties: ['display', 'flex-direction', 'flex-wrap', 'justify-content'],
              winningDeclarations: {
                display: { value: 'flex', computedValue: 'flex' },
                'flex-direction': { value: 'row', computedValue: 'row' },
                'flex-wrap': { value: 'nowrap', computedValue: 'nowrap' },
                'justify-content': { value: 'space-between', computedValue: 'space-between' }
              },
              provenance: { viewport: 'bricks_base' }
            },
            {
              styles: { display: 'flex', 'flex-direction': 'column', 'flex-wrap': 'nowrap', 'justify-content': 'normal' },
              authoredProperties: ['display', 'flex-direction', 'flex-wrap', 'justify-content'],
              winningDeclarations: {
                display: { value: 'flex', computedValue: 'flex' },
                'flex-direction': { value: 'row', computedValue: 'column' },
                'flex-wrap': { value: 'nowrap', computedValue: 'nowrap' },
                'justify-content': { value: 'space-between', computedValue: 'normal' }
              },
              provenance: { viewport: 'mobile' }
            }
          ]
        }
      }
    })`) as {
      result: {
        content: Array<{ settings: Record<string, unknown> }>;
        global_classes: Array<{ name: string; settings: Record<string, unknown> }>;
      };
    };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _direction: 'row',
      '_direction:mobile_portrait': 'column',
      _justifyContent: 'space-between',
      '_justifyContent:mobile_portrait': 'normal',
    });
    expect(measured?.settings._cssCustom).not.toContain('flex-direction: row !important');
    expect(measured?.settings._cssCustom).not.toContain('justify-content: space-between !important');
    expect(result.result.content[0].settings._direction).toBeUndefined();
    expect(result.result.content[0].settings._justifyContent).toBeUndefined();
  });

  it('projects responsive grid-item line placement instead of pruning column classes as empty', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'feature-copy', name: 'div', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-feature-copy' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [
          { id: 'desktop', width: 1440 },
          { id: 'bricks_base', width: 992 },
          { id: 'mobile', width: 390 }
        ],
        nodesBySourceId: {
          'pf-source-feature-copy': [
            {
              styles: { display: 'grid', 'grid-column-start': '17', 'grid-column-end': '25', 'grid-row-start': '1', 'grid-row-end': '3', 'align-items': 'center' },
              authoredProperties: ['display', 'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end', 'align-items'],
              winningDeclarations: {
                display: { value: 'grid', computedValue: 'grid' },
                'grid-column-start': { value: '17', computedValue: '17' },
                'grid-column-end': { value: '25', computedValue: '25' },
                'grid-row-start': { value: '1', computedValue: '1' },
                'grid-row-end': { value: '3', computedValue: '3' },
                'align-items': { value: 'center', computedValue: 'center' }
              },
              provenance: { viewport: 'desktop' }
            },
            {
              styles: { display: 'grid', 'grid-column-start': '17', 'grid-column-end': '25', 'grid-row-start': '1', 'grid-row-end': '3', 'align-items': 'center' },
              authoredProperties: ['display', 'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end', 'align-items'],
              winningDeclarations: {
                display: { value: 'grid', computedValue: 'grid' },
                'grid-column-start': { value: '17', computedValue: '17' },
                'grid-column-end': { value: '25', computedValue: '25' },
                'grid-row-start': { value: '1', computedValue: '1' },
                'grid-row-end': { value: '3', computedValue: '3' },
                'align-items': { value: 'center', computedValue: 'center' }
              },
              provenance: { viewport: 'bricks_base' }
            },
            {
              styles: { display: 'grid', 'grid-column-start': 'auto', 'grid-column-end': 'auto', 'grid-row-start': '1', 'grid-row-end': '2', 'align-items': 'normal' },
              authoredProperties: ['display', 'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end'],
              winningDeclarations: {
                display: { value: 'grid', computedValue: 'grid' },
                'grid-column-start': { value: '17', computedValue: 'auto' },
                'grid-column-end': { value: '25', computedValue: 'auto' },
                'grid-row-start': { value: '1', computedValue: '1' },
                'grid-row-end': { value: '3', computedValue: '2' }
              },
              provenance: { viewport: 'mobile' }
            }
          ]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _gridColumn: '17 / 25',
      '_gridColumn:mobile_portrait': 'auto / auto',
      _gridRow: '1 / 3',
      '_gridRow:mobile_portrait': '1 / 2',
    });
    expect(measured?.settings._cssCustom).toContain('grid-column: 17 / 25 !important');
    expect(measured?.settings._cssCustom).toContain('grid-row: 1 / 3 !important');
    expect(measured?.settings._cssCustom).toContain('align-items: center !important');
    expect(measured?.settings._cssCustom).toContain('max-width: 478px');
    expect(measured?.settings._cssCustom).toContain('grid-column: auto / auto !important');
    expect(measured?.settings._cssCustom).toContain('grid-row: 1 / 2 !important');
    expect(measured?.settings._cssCustom).toContain('align-items: normal !important');
  });

  it('resets desktop-only grid placement when inactive breakpoint evidence resolves to auto', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'hero-copy', name: 'div', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-hero-copy' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [
          { id: 'desktop', width: 1440 },
          { id: 'bricks_base', width: 992 },
          { id: 'mobile', width: 390 }
        ],
        nodesBySourceId: {
          'pf-source-hero-copy': [
            {
              styles: { display: 'block', 'grid-column-start': 'span 7', 'grid-column-end': 'span 7' },
              authoredProperties: ['display', 'grid-column-start', 'grid-column-end'],
              winningDeclarations: {
                display: { value: 'block', computedValue: 'block' },
                'grid-column-start': { value: 'span 7', computedValue: 'span 7' },
                'grid-column-end': { value: 'span 7', computedValue: 'span 7' }
              },
              provenance: { viewport: 'desktop' }
            },
            {
              styles: { display: 'block' },
              authoredProperties: ['display'],
              winningDeclarations: { display: { value: 'block', computedValue: 'block' } },
              provenance: { viewport: 'bricks_base' }
            },
            {
              styles: { display: 'block' },
              authoredProperties: ['display'],
              winningDeclarations: { display: { value: 'block', computedValue: 'block' } },
              provenance: { viewport: 'mobile' }
            }
          ]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._cssCustom).toContain('min-width: 479px');
    expect(measured?.settings._cssCustom).toContain('max-width: 992px');
    expect(measured?.settings._cssCustom).toContain('grid-column: auto !important');
    expect(measured?.settings._cssCustom).toContain('max-width: 478px');
  });

  it('preserves measured hidden visibility at the exact Bricks-base viewport', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'desktop-nav', name: 'section', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-desktop-nav' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [
          { id: 'desktop', width: 1440 },
          { id: 'bricks_base', width: 992 },
          { id: 'mobile', width: 390 }
        ],
        nodesBySourceId: {
          'pf-source-desktop-nav': [
            {
              styles: { display: 'flex' },
              authoredProperties: ['display'],
              winningDeclarations: { display: { value: 'flex', computedValue: 'flex' } },
              provenance: { viewport: 'desktop' }
            },
            {
              styles: { display: 'none' },
              authoredProperties: ['display'],
              winningDeclarations: { display: { value: 'flex', computedValue: 'none' } },
              provenance: { viewport: 'bricks_base' }
            },
            {
              styles: { display: 'none' },
              authoredProperties: ['display'],
              winningDeclarations: { display: { value: 'flex', computedValue: 'none' } },
              provenance: { viewport: 'mobile' }
            }
          ]
        }
      }
    })`) as {
      result: {
        content: Array<{ settings: Record<string, unknown> }>;
        global_classes: Array<{ name: string; settings: Record<string, unknown> }>;
      };
    };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _display: 'flex',
      '_display:mobile_portrait': 'none',
    });
    expect(measured?.settings._cssCustom).toContain('max-width: 992px');
    expect(measured?.settings._cssCustom).toContain('display: none');
    expect(result.result.content[0].settings._display).toBeUndefined();
  });

  it('preserves a measured block layout when the native Bricks element defaults to flex', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'source-section', name: 'section', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-section' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [{ id: 'desktop', width: 1440 }],
        nodesBySourceId: {
          'pf-source-section': [{
            styles: { display: 'block' },
            authoredProperties: [],
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({ _display: 'block' });
  });

  it('projects viewport-varying CSS variables as exact responsive geometry', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'responsive-height', name: 'div', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-responsive-height' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [
          { id: 'desktop', width: 1440, variables: { '--nav-height': '4.25rem' } },
          { id: 'bricks_base', width: 992, variables: { '--nav-height': '4.25rem' } },
          { id: 'mobile', width: 390, variables: { '--nav-height': '4.25rem' } }
        ],
        nodesBySourceId: {
          'pf-source-responsive-height': [
            {
              styles: { display: 'block', height: '68px' },
              authoredProperties: ['height'],
              winningDeclarations: { height: { value: 'var(--nav-height)', computedValue: '68px' } },
              provenance: { viewport: 'desktop' }
            },
            {
              styles: { display: 'block', height: '58px' },
              authoredProperties: ['height'],
              winningDeclarations: { height: { value: 'var(--nav-height)', computedValue: '58px' } },
              provenance: { viewport: 'bricks_base' }
            },
            {
              styles: { display: 'block', height: '58px' },
              authoredProperties: ['height'],
              winningDeclarations: { height: { value: 'var(--nav-height)', computedValue: '58px' } },
              provenance: { viewport: 'mobile' }
            }
          ]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _height: '68px',
      '_height:mobile_portrait': '58px',
    });
    expect(measured?.settings._cssCustom).toContain('height: 58px');
  });

  it('preserves contextual typography and theme variables on structural elements', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'dark-footer', name: 'section', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-dark-footer' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [{ id: 'desktop', width: 1440, variables: {
          '--theme-background': '#141413',
          '--theme-text': '#faf9f5',
          '--text-font-family': '"Brand Sans", Arial, sans-serif',
          '--text-line-height': '1.4'
        } }],
        nodesBySourceId: {
          'pf-source-dark-footer': [{
            styles: {
              display: 'block',
              'background-color': 'rgb(20, 20, 19)',
              color: 'rgb(250, 249, 245)',
              'font-family': '"Brand Sans", Arial, sans-serif',
              'font-size': '12px',
              'font-weight': '400',
              'line-height': '16.8px'
            },
            authoredProperties: [
              'background-color', 'color', 'font-family', 'font-size', 'font-weight',
              '--theme-background', '--theme-text', '--text-font-family', '--text-line-height'
            ],
            winningDeclarations: {
              'background-color': { value: 'var(--theme-background)', computedValue: 'rgb(20, 20, 19)' },
              color: { value: 'var(--theme-text)', computedValue: 'rgb(250, 249, 245)' },
              'font-family': { value: 'var(--text-font-family)', computedValue: '"Brand Sans", Arial, sans-serif' },
              'font-size': { value: '12px', computedValue: '12px' },
              'font-weight': { value: '400', computedValue: '400' },
              '--theme-background': { value: '#141413', computedValue: '#141413' },
              '--theme-text': { value: '#faf9f5', computedValue: '#faf9f5' },
              '--text-font-family': { value: '"Brand Sans", Arial, sans-serif', computedValue: '"Brand Sans", Arial, sans-serif' },
              '--text-line-height': { value: '1.4', computedValue: '1.4' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      },
      fontSystem: { fonts: [{ family: 'Brand Sans' }] }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _background: { color: { raw: 'rgb(20, 20, 19)' } },
      _typography: {
        color: { raw: 'rgb(250, 249, 245)' },
        'font-family': 'Brand Sans',
        'font-size': '12px',
        'font-weight': '400',
        'line-height': '16.8px',
      },
    });
  });

  it('uses the browser-resolved font family for a text element with a root variable', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'subtitle', name: 'text-basic', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-subtitle' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [{ id: 'desktop', width: 1440, variables: {
          '--display-sans': '"Brand Sans", Arial, sans-serif'
        } }],
        nodesBySourceId: {
          'pf-source-subtitle': [{
            styles: {
              display: 'block',
              'font-family': '"Brand Sans", Arial, sans-serif',
              'font-size': '20px',
              'line-height': '28px'
            },
            authoredProperties: ['font-family', 'font-size', 'line-height'],
            winningDeclarations: {
              'font-family': { value: 'var(--display-sans)', computedValue: '"Brand Sans", Arial, sans-serif' },
              'font-size': { value: '20px', computedValue: '20px' },
              'line-height': { value: '28px', computedValue: '28px' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      },
      fontSystem: { fonts: [{ family: 'Brand Sans' }, { family: 'Brand Mono' }] }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _typography: {
        'font-family': 'Brand Sans',
        fallback: 'Arial, sans-serif',
        'font-size': '20px',
        'line-height': '28px',
      },
    });
  });

  it('projects computed link decoration when the cascade authors decoration longhands', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'hero-link', name: 'text-basic', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-link' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-link': [{
            styles: {
              display: 'inline',
              'font-size': '52px',
              'line-height': '57px',
              'text-decoration': 'underline'
            },
            authoredProperties: [
              'font-size', 'line-height', 'text-decoration-line',
              'text-decoration-style', 'text-decoration-color', 'text-decoration-thickness'
            ],
            winningDeclarations: {
              'font-size': { value: '52px', computedValue: '52px' },
              'line-height': { value: '57px', computedValue: '57px' },
              'text-decoration-line': { value: 'underline', computedValue: 'underline' },
              'text-decoration-style': { value: 'initial', computedValue: 'solid' },
              'text-decoration-color': { value: 'initial', computedValue: 'rgb(20, 20, 19)' },
              'text-decoration-thickness': { value: 'initial', computedValue: 'auto' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _typography: {
        'font-size': '52px',
        'line-height': '57px',
        'text-decoration': 'underline',
      },
    });
  });

  it('reasserts authoritative measured type metrics over retained important utility rules', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'hero-heading', name: 'heading', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-heading' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [
          { id: 'desktop', width: 1440 },
          { id: 'bricks_base', width: 992 },
          { id: 'mobile', width: 478 }
        ],
        nodesBySourceId: {
          'pf-source-heading': [
            {
              styles: { 'font-size': '72px', 'line-height': '72px' },
              authoredProperties: ['font-size', 'line-height'],
              provenance: { viewport: 'desktop' }
            },
            {
              styles: { 'font-size': '60px', 'line-height': '60px' },
              authoredProperties: ['font-size', 'line-height'],
              provenance: { viewport: 'bricks_base' }
            },
            {
              styles: { 'font-size': '32px', 'line-height': '36px' },
              authoredProperties: ['font-size', 'line-height'],
              provenance: { viewport: 'mobile' }
            }
          ]
        }
      },
      bricksBreakpoints: [{ key: 'mobile_portrait', width: 478 }]
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._cssCustom).toContain('#brx-content %root%');
    expect(measured?.settings._cssCustom).toContain('font-size: 72px !important; line-height: 72px !important;');
    expect(measured?.settings._cssCustom).toContain('font-size: 60px !important; line-height: 60px !important;');
    expect(measured?.settings._cssCustom).toContain('font-size: 32px !important; line-height: 36px !important;');
  });

  it('projects decoration onto source-traced links nested inside editable heading text', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'hero-heading', name: 'heading', settings: {
          text: 'Build <a href="/research" data-pf-source-id="pf-source-link"><span data-pf-source-id="pf-source-word">research</span></a>',
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-heading' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-heading': [{
            styles: { display: 'block', 'font-size': '52px', 'line-height': '57px' },
            authoredProperties: ['font-size', 'line-height'],
            provenance: { viewport: 'desktop' }
          }],
          'pf-source-link': [{
            styles: { 'text-decoration': 'underline' },
            authoredProperties: ['text-decoration-line', 'text-underline-offset'],
            winningDeclarations: {
              'text-decoration-line': { value: 'underline', computedValue: 'underline' },
              'text-underline-offset': { value: '0.08em', computedValue: '4.16px' }
            },
            provenance: { viewport: 'desktop' }
          }],
          'pf-source-word': [{
            styles: { 'text-decoration': 'underline' },
            authoredProperties: ['text-decoration-line'],
            winningDeclarations: {
              'text-decoration-line': { value: 'underline', computedValue: 'underline' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as {
      result: { content: Array<{ settings: { text: string } }> };
      report: { measuredInlineDecorationCount: number };
    };

    expect(result.result.content[0].settings.text).toContain(
      'style="text-decoration-line: underline; text-underline-offset: 0.08em;"',
    );
    expect(result.result.content[0].settings.text).toContain(
      'style="text-decoration-line: underline;"',
    );
    expect(result.report.measuredInlineDecorationCount).toBe(2);
  });

  it('uses computed box spacing when cascade provenance reports a stale authored scalar', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'card-title', name: 'heading', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-card-title' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-card-title': [{
            styles: { display: 'flow-root', 'margin-top': '0px', 'margin-bottom': '16px' },
            authoredProperties: ['display', 'margin-top', 'margin-bottom'],
            winningDeclarations: {
              display: { value: 'flow-root', computedValue: 'flow-root' },
              'margin-top': { value: '0px', computedValue: '0px' },
              'margin-bottom': { value: '0px', computedValue: '16px' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({ _margin: { top: '0', bottom: '16px' } });
  });

  it('projects intrinsic measured dimensions onto signed SVG artwork', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'brand-mark', name: 'svg', settings: {
          source: 'code',
          code: '<svg width="45.4" viewBox="0 0 46 32"></svg>',
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-brand-mark' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-brand-mark': [{
            styles: { display: 'block', width: '45.3906px', height: '31.5625px', 'max-width': '100%' },
            authoredProperties: ['display', 'max-width'],
            winningDeclarations: {
              display: { value: 'block', computedValue: 'block' },
              'max-width': { value: '100%', computedValue: '100%' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _width: '45.3906px',
      _height: '31.5625px',
      _widthMax: '100%',
    });
  });

  it('freezes viewport-stable intrinsic image controls that Bricks would expand to 300 by 150', () => {
    const evidence = ['desktop', 'bricks_base', 'mobile'].map((viewport) => ({
      rect: { width: 17, height: 10 },
      styles: { width: '17px', height: '10px', display: 'block', 'object-fit': 'fill', 'object-position': '50% 50%' },
      authoredProperties: ['box-sizing', 'vertical-align'],
      winningDeclarations: {},
      provenance: { viewport },
    }));
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'faq-arrow', name: 'image', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-arrow' }],
          image: { url: './Saved_files/angle-down.svg' }
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        viewports: [{ id: 'desktop', width: 1280 }, { id: 'bricks_base', width: 992 }, { id: 'mobile', width: 478 }],
        nodesBySourceId: { 'pf-source-arrow': ${JSON.stringify(evidence)} }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({ _width: '17px', _height: '10px' });
  });

  it('pins a visible desktop interaction wrapper that is hidden at narrower viewports', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: { content: [{ id: 'nav-wrap', name: 'div', children: ['nav-link'], settings: {
        _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-nav-wrap' }]
      }}], global_classes: [] },
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {
        'pf-source-nav-wrap': [
          { classes: ['relative', 'group'], rect: { width: 123, height: 36 }, styles: { width: '123px', display: 'block', position: 'relative' }, authoredProperties: ['position'], winningDeclarations: { position: { value: 'relative', computedValue: 'relative' } }, provenance: { viewport: 'desktop' } },
          { classes: ['relative', 'group'], rect: { width: 0, height: 0 }, styles: { width: 'auto', display: 'block', position: 'relative' }, authoredProperties: ['position'], winningDeclarations: { position: { value: 'relative', computedValue: 'relative' } }, provenance: { viewport: 'bricks_base' } },
          { classes: ['relative', 'group'], rect: { width: 0, height: 0 }, styles: { width: 'auto', display: 'block', position: 'relative' }, authoredProperties: ['position'], winningDeclarations: { position: { value: 'relative', computedValue: 'relative' } }, provenance: { viewport: 'mobile' } }
        ]
      }}
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._width).toBe('123px');
  });

  it('pins the matching desktop action width inside that hidden navigation wrapper', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: { content: [{ id: 'nav-link', name: 'block', children: ['label', 'icon'], settings: {
        link: { type: 'external', url: '/technologies' },
        _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-nav-link' }]
      }}], global_classes: [] },
      renderedSnapshot: { available: true, inputKind: 'document_bundle', nodesBySourceId: {
        'pf-source-nav-link': [
          { rect: { width: 123, height: 36 }, styles: { width: '123px', display: 'flex' }, authoredProperties: ['display'], winningDeclarations: { display: { value: 'flex', computedValue: 'flex' } }, provenance: { viewport: 'desktop' } },
          { rect: { width: 0, height: 0 }, styles: { width: 'auto', display: 'flex' }, authoredProperties: ['display'], winningDeclarations: { display: { value: 'flex', computedValue: 'flex' } }, provenance: { viewport: 'bricks_base' } },
          { rect: { width: 0, height: 0 }, styles: { width: 'auto', display: 'flex' }, authoredProperties: ['display'], winningDeclarations: { display: { value: 'flex', computedValue: 'flex' } }, provenance: { viewport: 'mobile' } }
        ]
      }}
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };
    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings._width).toBe('123px');
  });

  it('neutralizes the Bricks block max-width cap for source max-content wrappers', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'dropdown-panel', name: 'block', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-dropdown-panel' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-dropdown-panel': [{
            styles: {
              display: 'grid',
              width: '252px',
              'max-width': 'none',
              'grid-template-columns': '252px'
            },
            authoredProperties: ['display', 'width', 'grid-template-columns'],
            winningDeclarations: {
              display: { value: 'grid', computedValue: 'grid' },
              width: { value: 'max-content', computedValue: '252px' },
              'grid-template-columns': { value: 'minmax(0px, 1fr)', computedValue: '252px' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _width: 'max-content',
      _widthMax: 'none',
      _gridTemplateColumns: 'minmax(0px, 1fr)',
    });
  });

  it('keeps max-width-only absolute source blocks shrink-to-fit', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'skip-link', name: 'block', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-skip-link' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-skip-link': [{
            styles: {
              display: 'block',
              position: 'absolute',
              width: '243px',
              'max-width': '100%',
              left: '720px',
              transform: 'matrix(1, 0, 0, 1, -121.5, -73.8)'
            },
            authoredProperties: ['display', 'position', 'max-width', 'left', 'transform'],
            winningDeclarations: {
              display: { value: 'block', computedValue: 'block' },
              position: { value: 'absolute', computedValue: 'absolute' },
              'max-width': { value: '100%', computedValue: '100%' },
              left: { value: '50%', computedValue: '720px' },
              transform: { value: 'translate(-50%, -150%)', computedValue: 'matrix(1, 0, 0, 1, -121.5, -73.8)' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _position: 'absolute',
      _width: 'auto',
      _widthMax: '100%',
    });
  });

  it('pins the measured intrinsic width of an absolute block wrapper without an authored width', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'desktop-nav-group', name: 'div', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-desktop-nav-group' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-desktop-nav-group': [{
            styles: {
              display: 'block',
              position: 'absolute',
              width: '328.609px',
              left: '72px'
            },
            authoredProperties: ['display', 'position', 'left'],
            winningDeclarations: {
              display: { value: 'block', computedValue: 'block' },
              position: { value: 'absolute', computedValue: 'absolute' },
              left: { value: '0px', computedValue: '72px' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _position: 'absolute',
      _width: '328.609px',
      _widthMax: 'none',
    });
  });

  it('pins the measured intrinsic width of a right-anchored absolute block without an authored width', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'technical-callout', name: 'block', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-technical-callout' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-technical-callout': [{
            styles: {
              display: 'block',
              position: 'absolute',
              width: '108.375px',
              right: '17.5px',
              'max-width': 'none'
            },
            authoredProperties: ['display', 'position', 'right'],
            winningDeclarations: {
              display: { value: 'block', computedValue: 'block' },
              position: { value: 'absolute', computedValue: 'absolute' },
              right: { value: '5%', computedValue: '17.5px' }
            },
            provenance: { viewport: 'mobile' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _position: 'absolute',
      _width: '108.375px',
      _widthMax: 'none',
      _right: '5%',
    });
  });

  it('pins the measured intrinsic width of a right-anchored absolute flex callout without an authored width', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'technical-callout', name: 'block', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-technical-callout' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-technical-callout': [{
            styles: {
              display: 'flex',
              position: 'absolute',
              width: '87.3125px',
              right: '16.2969px',
              'max-width': 'none'
            },
            authoredProperties: ['display', 'position', 'flex-direction', 'right'],
            winningDeclarations: {
              display: { value: 'flex', computedValue: 'flex' },
              position: { value: 'absolute', computedValue: 'absolute' },
              'flex-direction': { value: 'column', computedValue: 'column' },
              right: { value: '5%', computedValue: '16.2969px' }
            },
            provenance: { viewport: 'mobile' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _position: 'absolute',
      _width: '87.3125px',
      _widthMax: 'none',
      _right: '5%',
    });
  });

  it('does not clamp an authored-width absolute link to its zero-width overflow parent', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'brand-link', name: 'link', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-brand-link' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-brand-link': [{
            styles: {
              display: 'flex',
              position: 'absolute',
              width: '36px',
              height: '36px',
              'max-width': 'none'
            },
            authoredProperties: ['display', 'position', 'width', 'height'],
            winningDeclarations: {
              display: { value: 'flex', computedValue: 'flex' },
              position: { value: 'absolute', computedValue: 'absolute' },
              width: { value: '36px', computedValue: '36px' },
              height: { value: '36px', computedValue: '36px' }
            },
            provenance: { viewport: 'desktop' }
          }]
        }
      }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _position: 'absolute',
      _width: '36px',
      _widthMax: 'none',
    });
  });

  it('keeps an available captured font family instead of substituting its system fallback', () => {
    const result = evaluateBridge(`bridge.applyStageBMeasuredSourceEvidenceForTest({
      result: {
        content: [{ id: 'heading', name: 'heading', settings: {
          _attributes: [{ name: 'data-pf-source-id', value: 'pf-source-heading' }]
        }}],
        global_classes: []
      },
      renderedSnapshot: {
        available: true,
        inputKind: 'document_bundle',
        nodesBySourceId: {
          'pf-source-heading': [{
            styles: { 'font-family': '\"Brand Sans\", Arial, sans-serif', 'font-size': '64px' },
            authoredProperties: ['font-family', 'font-size'],
            provenance: { viewport: 'desktop' }
          }]
        }
      },
      fontSystem: { fonts: [{ family: 'Brand Sans' }] }
    })`) as { result: { global_classes: Array<{ name: string; settings: Record<string, unknown> }> } };

    const measured = result.result.global_classes.find((item) => item.name.startsWith('pixflow-measured-'));
    expect(measured?.settings).toMatchObject({
      _typography: { 'font-family': 'Brand Sans', fallback: 'Arial, sans-serif' },
    });
  });

  it('keeps the desktop document font when materializing measured page CSS', () => {
    const result = evaluateBridge(`bridge.applyPixflowStageBMeasuredDocumentCssForTest({
      pageSettings: {},
      plan: {
        conversionPolicy: { conversionProfile: 'uploaded_html' },
        sourceEvidence: { renderedSnapshot: { viewports: [
          { id: 'desktop', documentStyles: { body: { 'font-family': '\"Brand Serif\", Georgia, serif', 'font-size': '20px' } } },
          { id: 'bricks_base', documentStyles: { body: { 'font-family': '\"Brand Serif\", Georgia, serif', 'font-size': '18px' } } }
        ] } }
      },
      fontSystem: { fonts: [{ family: 'Brand Serif' }] }
    })`) as { customCss: string };

    expect(result.customCss).toContain('font-family: "Brand Serif"');
    expect(result.customCss).toContain('font-size: 20px');
    expect(result.customCss).not.toContain('font-size: 18px');
  });

  it('applies the active computed root variables to the Bricks content scope', () => {
    const result = evaluateBridge(`bridge.applyPixflowStageBMeasuredDocumentCssForTest({
      pageSettings: {},
      plan: { sourceEvidence: { renderedSnapshot: { viewports: [{
        id: 'desktop',
        variables: {
          '--color-theme-bg': '#14120b',
          '--color-theme-fg': '#edecec'
        },
        documentStyles: {
          body: { 'background-color': 'rgb(20, 18, 11)', color: 'rgb(237, 236, 236)' }
        }
      }] } } }
    })`) as { customCss: string };

    expect(result.customCss).toContain(':root, #brx-content {');
    expect(result.customCss).toContain('--color-theme-bg: #14120b');
    expect(result.customCss).toContain('--color-theme-fg: #edecec');
  });

  it('projects measured responsive body padding onto the Bricks content wrapper for uploaded HTML', () => {
    const result = evaluateBridge(`bridge.applyPixflowStageBMeasuredDocumentCssForTest({
      pageSettings: { customCss: '#brx-content { padding: 0; }' },
      plan: {
        conversionPolicy: { conversionProfile: 'uploaded_html' },
        bricksBreakpoints: [{ key: 'mobile_portrait', width: 478 }],
        sourceEvidence: { renderedSnapshot: { viewports: [
          { id: 'desktop', documentStyles: { body: { 'box-sizing': 'border-box', 'padding-top': '52px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px' } } },
          { id: 'bricks_base', width: 992, documentStyles: { body: { 'box-sizing': 'border-box', 'padding-top': '52px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px' } } },
          { id: 'mobile', documentStyles: { body: { 'box-sizing': 'border-box', 'padding-top': '56px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px' } } }
        ] } }
      }
    })`) as { customCss: string };

    expect(result.customCss).toContain('#brx-content { box-sizing: border-box; padding-top: 52px');
    expect(result.customCss).toContain('@media (max-width: 478px)');
    expect(result.customCss).toContain('padding-top: 56px');
  });

  it('does not project browser document defaults onto ordinary HTML-first Build content', () => {
    const result = evaluateBridge(`bridge.applyPixflowStageBMeasuredDocumentCssForTest({
      pageSettings: {},
      plan: {
        conversionPolicy: {
          conversionProfile: 'uploaded_html',
          sourceContract: 'build-in-bricks-html-first'
        },
        sourceEvidence: { renderedSnapshot: { viewports: [{
          id: 'desktop',
          documentStyles: { body: {
            'box-sizing': 'content-box',
            'margin-top': '8px',
            'margin-right': '8px',
            'margin-bottom': '8px',
            'margin-left': '8px',
            'padding-top': '0px',
            'padding-right': '0px',
            'padding-bottom': '0px',
            'padding-left': '0px',
            'font-family': '"Times New Roman"',
            'font-size': '16px',
            'font-weight': '400',
            'line-height': 'normal'
          } }
        }] } }
      }
    })`) as { customCss?: string };

    expect(result.customCss || '').not.toContain('margin-top: 8px');
    expect(result.customCss || '').not.toContain('box-sizing: content-box');
    expect(result.customCss || '').not.toContain('Times New Roman');
  });

  it('keeps saved-page images materialized under the source resource directory', async () => {
    const workspaceDir = await mkdtemp(resolve(tmpdir(), 'pixflow-saved-page-media-'));
    try {
      const imageDir = resolve(workspaceDir, 'stage-a', 'source-resources', 'Saved_files');
      await mkdir(imageDir, { recursive: true });
      await writeFile(resolve(imageDir, 'hero.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      const result = evaluateBridge(`bridge.normalizeStageBImageElementSettingsForTest({
        workspaceDir: ${JSON.stringify(workspaceDir)},
        result: { content: [{ id: 'hero-image', name: 'image', settings: {
          image: {
            url: './Saved_files/hero.jpg',
            full: './Saved_files/hero.jpg',
            sourceUrl: './Saved_files/hero.jpg'
          }
        }}] }
      })`) as { content: Array<{ settings: { image: { url: string } } }> };

      expect(result.content[0]?.settings.image.url).toBe('./Saved_files/hero.jpg');
      expect(result.content[0]?.settings.image.url).not.toContain('placehold.co');
    } finally {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });
});
