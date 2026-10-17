import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  attachPixflowStageBBaselinePreviewContent,
  PIXFLOW_HTML_STRUCTURE_IR_SCHEMA,
  buildPixflowHtmlStructureIr,
  createPixflowStructureProjectionRecorder,
  finalizePixflowHtmlStructureProjection,
  validatePixflowBricksStructureProjection,
} from '../html-to-bricks-structure.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function buildBaseline(html: string, plan: Record<string, any> = {}): Record<string, any> {
  const directory = mkdtempSync(join(tmpdir(), 'pixflow-structure-'));
  temporaryDirectories.push(directory);
  const htmlFile = join(directory, 'index.html');
  writeFileSync(htmlFile, html);
  const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const { buildPixflowStageBHtmlBaseline } = await import(${JSON.stringify(bridgeModuleUrl)});
     const baseline = await buildPixflowStageBHtmlBaseline({
       htmlFile: ${JSON.stringify(htmlFile)},
       plan: {
         sourceId: 'structure-test',
         title: 'Structure test',
         conversionProfile: 'uploaded_html',
         conversionPolicy: { conversionProfile: 'uploaded_html' },
         ...${JSON.stringify(plan)},
       },
     });
     process.stdout.write(JSON.stringify(baseline));`,
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function attributeValue(element: Record<string, any>, name: string): string {
  return String(element.settings?._attributes?.find((attribute: Record<string, any>) => attribute.name === name)?.value || '');
}

function normalizeTemplateAreaSeparation(
  result: Record<string, any>,
  headerPlan: Record<string, any>,
  footerPlan: Record<string, any>,
): Record<string, any> {
  const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const { normalizeStageBTemplateAreaSeparation } = await import(${JSON.stringify(bridgeModuleUrl)});
     const result = ${JSON.stringify(result)};
     const report = normalizeStageBTemplateAreaSeparation(
       result,
       ${JSON.stringify(headerPlan)},
       ${JSON.stringify(footerPlan)},
     );
     process.stdout.write(JSON.stringify({ result, report }));`,
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

describe('Pixflow HTML structure IR', () => {
  it('preserves class-scoped cascade custom properties used by responsive utilities', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .text-6xl { font-size: 60px; line-height: var(--tw-leading, 24px) !important; }
      .leading-tight { --tw-leading: 1.02; line-height: var(--tw-leading); }
    </style></head><body><main><h1 class="text-6xl leading-tight">Faithful heading</h1></main></body></html>`);

    const leadingClass = baseline.globalClasses.find((item: Record<string, any>) => item.name === 'leading-tight');
    expect(leadingClass?.settings?._cssCustom).toContain('--tw-leading: 1.02');
  });

  it('attaches the complete uploaded document before the baseline can be streamed without duplicating extracted templates', () => {
    const page = [{ id: 'page-header' }, { id: 'page-main' }, { id: 'page-footer' }];
    const result: Record<string, any> = {
      content: page,
      stage_b_header: { content: [{ id: 'template-header-copy' }] },
      stage_b_footer: { content: [{ id: 'template-footer-copy' }] },
    };

    attachPixflowStageBBaselinePreviewContent(result, page, { sourceFidelityClone: true });

    expect(result.baseline_preview_content).toEqual(page);
    expect(result.baseline_preview_content).not.toBe(page);
    expect(result.baselinePreviewContent).toBe(result.baseline_preview_content);
    expect(result.baseline_preview_content).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'template-header-copy' }),
      expect.objectContaining({ id: 'template-footer-copy' }),
    ]));

    const scopedResult: Record<string, any> = { content: page };
    attachPixflowStageBBaselinePreviewContent(scopedResult, page, { sourceFidelityClone: false });
    expect(scopedResult.baseline_preview_content).toBeUndefined();
  });

  it('keeps source order, semantics, attributes, text, and runtime evidence independent from Bricks JSON', () => {
    const textNode: Record<string, any> = { type: 'text', text: 'Hello', sourceIndex: 3, children: [] };
    const heading = {
      type: 'element',
      tag: 'h1',
      sourceIndex: 2,
      attrs: { 'data-pf-source-id': 'heading', role: 'heading', class: 'hero-title' },
      attrList: [
        { name: 'data-pf-source-id', value: 'heading' },
        { name: 'role', value: 'heading' },
        { name: 'class', value: 'hero-title' },
      ],
      children: [textNode],
    };
    textNode.parent = heading;

    const ir = buildPixflowHtmlStructureIr({
      scope: 'page',
      roots: [heading],
      runtimeEvidenceBySourceId: {
        heading: [{ provenance: { viewport: 'desktop' }, geometry: { x: 20, y: 40, width: 600, height: 80 }, styles: { display: 'block', visibility: 'visible' } }],
      },
    });

    expect(ir.schema).toBe(PIXFLOW_HTML_STRUCTURE_IR_SCHEMA);
    expect(ir.nodes).toEqual([
      expect.objectContaining({
        nodeId: 'heading',
        type: 'element',
        tag: 'h1',
        role: 'heading',
        classes: ['hero-title'],
        childNodeIds: ['page:text:3'],
        runtimeEvidence: expect.objectContaining({ available: true, viewportCount: 1 }),
      }),
      expect.objectContaining({
        nodeId: 'page:text:3',
        type: 'text',
        text: 'Hello',
        parentNodeId: 'heading',
      }),
    ]);
  });

  it('reports complete source/synthetic provenance and valid flat Bricks links', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main><section id="hero">
      <p>Hello <strong>world</strong> and <a href="/docs">docs</a>.</p>
    </section></main></body></html>`);

    expect(baseline.structureIr.schema).toBe(PIXFLOW_HTML_STRUCTURE_IR_SCHEMA);
    expect(baseline.structureReport).toMatchObject({
      ok: true,
      errorCount: 0,
      uncoveredVisibleSourceNodeCount: 0,
    });
    expect(baseline.structureReport.sourceNodeCount).toBeGreaterThan(0);
    expect(baseline.structureReport.provenanceRecordCount).toBe(baseline.content.length);
    expect(baseline.structureReport.sourceCoverageRatio).toBe(1);
  });

  it('resolves deterministic Bricks ID hash collisions without changing source order or provenance', () => {
    const html = '<!doctype html><html><head><style>.desktop-nav{display:flex}.mobile-nav{display:none}@media (max-width:991px){.desktop-nav{display:none}.mobile-nav{display:flex}}</style></head><body><main><nav class="desktop-nav">Desktop</nav><nav class="mobile-nav">Mobile</nav></main></body></html>';
    const plan = { headerPlan: { detected: true, includeHeader: true } };
    const baseline = buildBaseline(html, plan);
    const rerun = buildBaseline(html, plan);
    const navigation = baseline.content.filter((element: Record<string, any>) => element.settings?.tag === 'nav');
    const ids = navigation.map((element: Record<string, any>) => element.id);
    const allElements = [...baseline.content, ...baseline.headerContent, ...baseline.footerContent];
    const allIds = allElements.map((element: Record<string, any>) => element.id);

    expect(navigation).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(baseline.headerContent.length).toBeGreaterThan(0);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect([
      ...rerun.content,
      ...rerun.headerContent,
      ...rerun.footerContent,
    ].map((element: Record<string, any>) => element.id)).toEqual(allIds);
    expect(baseline.structureReport).toMatchObject({
      ok: true,
      errorCount: 0,
      sourceCoverageRatio: 1,
    });
    expect(baseline.structureReport.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'deterministic_element_id_collision_resolved',
        preferredBricksElementId: 'ldfbxe',
        collisionIndex: 1,
      }),
    ]));
    expect(baseline.structureReport.provenance).toEqual(expect.arrayContaining(ids.map((id: string) => (
      expect.objectContaining({ bricksElementId: id, kind: 'source_node' })
    ))));
  });

  it('keeps linked containers editable without emitting a nested link', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main><section>
      <a class="outer" href="/outer"><div>Outer <a href="/inner">Inner</a></div></a>
    </section></main></body></html>`);
    const outer = baseline.content.find((element: Record<string, any>) => (
      ['block', 'div'].includes(element.name)
      && element.settings?._cssGlobalClasses?.length
      && element.children?.length
    ));
    const inner = baseline.content.find((element: Record<string, any>) => element.name === 'text-link');

    expect(outer?.settings?.link).toBeUndefined();
    expect(inner?.settings?.link?.url).toBe('/inner');
    expect(baseline.structureReport.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'nested_interactive_link_suppressed', severity: 'warning' }),
    ]));
    expect(baseline.structureReport.uncoveredVisibleSourceNodeCount).toBe(0);
  });

  it('keeps mixed inline prose flowing while preserving native controls', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main><section>
      <p class="legal">Read <button type="button" class="underline">Manage choices</button> or <a class="policy" href="/terms">the terms</a> carefully.</p>
      <feature-card role="region" aria-label="Feature"><h2>Fast setup</h2><p>Details</p></feature-card>
    </section></main></body></html>`);
    const paragraph = baseline.content.find((element: Record<string, any>) => (
      ['div', 'block'].includes(element.name)
      && element.settings?.tag === 'p'
    ));
    const custom = baseline.content.find((element: Record<string, any>) => element.settings?.customTag === 'feature-card');
    const children = (paragraph?.children || []).map((id: string) => baseline.content.find((element: Record<string, any>) => element.id === id));
    const button = children.find((element: Record<string, any>) => element?.name === 'button');
    const link = children.find((element: Record<string, any>) => element?.name === 'text-link');
    const textLeaves = children.filter((element: Record<string, any>) => element?.name === 'text-basic');

    expect(paragraph).toBeTruthy();
    expect(button).toMatchObject({ settings: expect.objectContaining({ text: 'Manage choices', _display: 'inline-flex', _width: 'auto' }) });
    expect(link).toMatchObject({ settings: expect.objectContaining({ text: 'the terms', _display: 'inline', _width: 'auto' }) });
    expect(textLeaves.length).toBeGreaterThanOrEqual(2);
    expect(textLeaves.every((element: Record<string, any>) => element.settings?.tag === 'span' && element.settings?._display === 'inline')).toBe(true);
    expect(textLeaves.some((element: Record<string, any>) => String(element.settings?.text || '').endsWith('&#32;'))).toBe(true);
    expect(textLeaves.some((element: Record<string, any>) => String(element.settings?.text || '').startsWith('&#32;'))).toBe(true);
    expect(baseline.content.some((element: Record<string, any>) => /<button\b/i.test(String(element.settings?.text || '')))).toBe(false);
    expect(custom).toMatchObject({ name: expect.stringMatching(/^(?:div|block)$/), settings: expect.objectContaining({ tag: 'custom', customTag: 'feature-card' }) });
    expect(attributeValue(custom, 'role')).toBe('region');
    expect(custom.children.length).toBeGreaterThan(0);
    expect(baseline.content.some((element: Record<string, any>) => String(element.settings?.html || '').includes('<feature-card'))).toBe(false);
  });

  it('keeps interactive FAQ headings structural instead of flattening controls into heading HTML', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main><section>
      <h5 class="faq-title"><button class="faq-trigger" type="button" aria-expanded="false">What is Biofarma?<img src="arrow.svg" alt=""></button></h5>
    </section></main></body></html>`);
    const heading = baseline.content.find((element: Record<string, any>) => (
      ['div', 'block'].includes(element.name) && element.settings?.tag === 'h5'
    ));
    const button = baseline.content.find((element: Record<string, any>) => (
      element.parent === heading?.id && element.settings?.tag === 'button'
    ));

    expect(heading?.children).toContain(button?.id);
    expect(button?.name).toBe('block');
    expect(baseline.content.some((element: Record<string, any>) => /<button\b/i.test(String(element.settings?.text || '')))).toBe(false);
    expect(baseline.structureReport.uncoveredVisibleSourceNodeCount).toBe(0);
  });

  it('maps flex-flow direction and wrapping into authoritative Bricks controls', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .section-right { display: flex; flex-flow: column; }
      .wrapping-row { display: flex; flex-flow: row wrap; }
    </style></head><body><main><section class="section-right"><div>Story</div></section><div class="wrapping-row"><span>A</span><span>B</span></div></main></body></html>`);
    const sectionClass = baseline.globalClasses.find((item: Record<string, any>) => item.name === 'section-right');
    const rowClass = baseline.globalClasses.find((item: Record<string, any>) => item.name === 'wrapping-row');

    expect(sectionClass?.settings).toMatchObject({ _display: 'flex', _direction: 'column', _flexWrap: 'nowrap' });
    expect(rowClass?.settings).toMatchObject({ _display: 'flex', _direction: 'row', _flexWrap: 'wrap' });
  });

  it('preserves a nested authored main as a structural layout wrapper', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>.wrapper{padding:0 32px;display:flex;flex-flow:column}</style></head><body>
      <div class="global"><div class="sub"><main class="wrapper"><section><h1>Page</h1></section></main></div></div>
    </body></html>`);
    const wrapperClass = baseline.globalClasses.find((item: Record<string, any>) => item.name === 'wrapper');
    const wrapper = baseline.content.find((element: Record<string, any>) => element.settings?._cssGlobalClasses?.includes(wrapperClass?.id));
    const child = baseline.content.find((element: Record<string, any>) => element.parent === wrapper?.id);

    expect(wrapper).toMatchObject({ name: expect.stringMatching(/^(?:div|block)$/) });
    expect(wrapper?.settings?.tag).not.toBe('main');
    expect(child?.name).toBe('section');
  });

  it('preserves authored skip navigation as an accessible editable link', () => {
    const baseline = buildBaseline(`<!doctype html><html><body>
      <a class="skip-link" href="#main-content">Skip to content</a>
      <main id="main-content"><section><h1>Page</h1></section></main>
    </body></html>`);
    const skipLink = baseline.content.find((element: Record<string, any>) => element.name === 'text-link' && element.settings?.text === 'Skip to content');

    expect(skipLink?.settings?.link?.url).toBe('#main-content');
    expect(baseline.structureReport.uncoveredVisibleSourceNodeCount).toBe(0);
  });

  it('does not flatten screen-reader-only copy into a native CTA label', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main><section>
      <a class="button primary" href="/chat">Try ChatGPT <svg width="11" viewBox="0 0 11 12"><path d="M1 9 9 1"></path></svg><span class="sr-only">(opens in a new window)</span></a>
    </section></main></body></html>`);
    const cta = baseline.content.find((element: Record<string, any>) => element.name === 'button');

    expect(cta?.settings?.text).toBe('Try ChatGPT');
    expect(cta?.settings?.link?.url).toBe('/chat');
    expect(cta?.settings?.icon).toMatchObject({ width: '11', height: '12' });
    expect(baseline.structureReport.uncoveredVisibleSourceNodeCount).toBe(0);
  });

  it('preserves visible text that is authored directly under the page body', () => {
    const baseline = buildBaseline('<!doctype html><html><body>Standalone introduction</body></html>');
    const text = baseline.content.find((element: Record<string, any>) => element.settings?.text === 'Standalone introduction');
    const root = baseline.content.find((element: Record<string, any>) => !element.parent);

    expect(root?.name).toBe('section');
    expect(text?.parent).toBe(root?.id);
    expect(baseline.structureReport.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'synthetic', reason: 'body_root_text_section_contract' }),
    ]));
  });

  it('projects direct source text as inline spans instead of adding nested div wrappers', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .metric { display: flex; gap: .5rem; }
    </style></head><body><main><div class="metric">20+ <span>Years of R&amp;D</span></div></main></body></html>`);
    const directText = baseline.content.find((element: Record<string, any>) => (
      element.name === 'text-basic' && element.settings?.text === '20+'
    ));

    expect(directText?.settings?.tag).toBe('span');
  });

  it('makes larger min-width utility breakpoints win independently of Bricks class stylesheet order', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .grid { display: grid; }
      .items-center { align-items: center; }
      @media (min-width: 640px) { .sm-grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (min-width: 1024px) { .lg-grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    </style></head><body><main><div class="grid items-center sm-grid-cols-2 lg-grid-cols-3"><div>A</div><div>B</div><div>C</div></div></main></body></html>`);
    const sm = baseline.globalClasses.find((item: Record<string, any>) => item.name === 'sm-grid-cols-2');
    const lg = baseline.globalClasses.find((item: Record<string, any>) => item.name === 'lg-grid-cols-3');
    const itemsCenter = baseline.globalClasses.find((item: Record<string, any>) => item.name === 'items-center');

    expect(sm?.settings?._cssCustom).toContain('%root%%root%%root%');
    expect(lg?.settings?._cssCustom).toContain('%root%%root%%root%%root%');
    expect(itemsCenter?.settings).toMatchObject({ _alignItems: 'center', _alignItemsGrid: 'center' });
    expect(itemsCenter?.settings?._display).toBeUndefined();
    expect(itemsCenter?.settings?._cssCustom).toContain('align-items: center !important');
  });

  it('preserves source element resets that neutralize browser figure margins', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      *, :before, :after { border-width: 0; border-style: solid; }
      blockquote, dd, dl, figure, h1, h2, h3, h4, h5, h6, hr, p, pre { margin: 0; }
      .border { border-width: 1px; }
    </style></head><body><main><figure class="border"><img src="/image.jpg" alt="Test"></figure></main></body></html>`);
    const borderClass = baseline.globalClasses.find((item: Record<string, any>) => item.name === 'border');

    expect(baseline.pageSettings.customCss).toContain(':where(#brx-content) :where(figure)');
    expect(baseline.pageSettings.customCss).toContain('margin: 0');
    expect(baseline.pageSettings.customCss).toContain(':where(#brx-content) *');
    expect(baseline.pageSettings.customCss).not.toContain('#brx-content * { box-sizing');
    expect(borderClass?.settings?._border).toMatchObject({ style: 'solid' });
  });

  it('projects an authored flattened main boundary onto the Bricks page root instead of only the first section', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .page-shell { display: flex; flex-direction: column; min-height: 100svh; overflow: clip; }
    </style></head><body>
    <a href="#page-root" class="skip-link">Skip to content</a>
    <main data-pf-source-id="page-root" class="page-shell">
      <section><h1>First section</h1></section>
      <section><p>Second section with an off-canvas animation clone.</p></section>
    </main></body></html>`, {
      sourceEvidence: {
        renderedSnapshot: {
          available: true,
          viewports: [
            { id: 'desktop', width: 1440, variables: {} },
            { id: 'bricks_base', width: 992, variables: {} },
            { id: 'mobile', width: 390, variables: {} },
          ],
          nodesBySourceId: {
            'page-root': ['desktop', 'bricks_base', 'mobile'].map((viewport) => ({
              sourceNodeId: 'page-root',
              tag: 'main',
              styles: {
                display: 'flex',
                'flex-direction': 'column',
                'min-height': viewport === 'desktop' ? '1000px' : '844px',
                overflow: 'clip',
                'overflow-x': 'clip',
                'overflow-y': 'clip',
              },
              authoredProperties: ['display', 'flex-direction', 'min-height', 'overflow'],
              winningDeclarations: {
                display: { value: 'flex', computedValue: 'flex' },
                'flex-direction': { value: 'column', computedValue: 'column' },
                'min-height': { value: '100svh', computedValue: viewport === 'desktop' ? '1000px' : '844px' },
                overflow: { value: 'clip', computedValue: 'clip' },
              },
              provenance: { viewport },
            })),
          },
        },
      },
    });
    const pageCss = String(baseline.pageSettings?.customCss || '');
    const firstRoot = baseline.content.find((element: Record<string, any>) => !element.parent);
    const pageShellClass = baseline.globalClasses.find((item: Record<string, any>) => item.name.endsWith('page-shell'));

    expect(pageCss).toMatch(/#brx-content\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*min-height:\s*100svh;[^}]*overflow:\s*clip;/);
    expect(pageCss).not.toContain('#brx-content .page-shell');
    expect(firstRoot?.settings?._cssGlobalClasses || []).not.toContain(pageShellClass?.id);
    expect(attributeValue(firstRoot, 'data-pf-source-id')).not.toBe('page-root');
    expect(baseline.summary.flattenedPageBoundaryProjection).toMatchObject({
      applied: true,
      sourceNodeId: 'page-root',
      target: '#brx-content',
    });
  });

  it('keeps nonvisual source bodies out of Bricks content while preserving authored code and page-scoped visual JavaScript', () => {
    const baseline = buildBaseline(`<!doctype html><html><head>
      <meta name="fixture" content="nonvisual">
      <style>.hero { opacity: 1; }</style>
    </head><body><main>
      <section class="hero"><h1>Visible</h1><pre><code>const theme = { accent: "#f00" };</code></pre></section>
      <template><p>Template-only copy</p></template>
      <noscript>Inert fallback copy</noscript>
      <script>gsap.to(".hero", { opacity: 1 });</script>
    </main></body></html>`);
    const visibleText = baseline.content
      .map((element: Record<string, any>) => String(element.settings?.text || element.settings?.html || ''))
      .join('\n');

    expect(visibleText).toContain('const theme = { accent: "#f00" };');
    expect(visibleText).not.toContain('Template-only copy');
    expect(visibleText).not.toContain('Inert fallback copy');
    expect(visibleText).not.toContain('gsap.to');
    expect(baseline.pageSettings?.customScriptsBodyFooter).toContain('gsap.to');
    expect(baseline.pageSettings?.pixflowScriptFragments).toEqual([
      expect.objectContaining({ id: 'prototype-bricks-stage-b' }),
    ]);
    expect(baseline.structureReport).toMatchObject({
      ok: true,
      sourceCoverageRatio: 1,
      uncoveredVisibleSourceNodeCount: 0,
    });
  });

  it('gives ordinary Build JavaScript canonical Build ownership without changing compatibility flows', () => {
    const baseline = buildBaseline(
      '<!doctype html><html><body><main><section><h1>Build</h1></section><script>document.body.dataset.ready = "true";</script></main></body></html>',
      {
        conversionProfile: 'prototype_bricks',
        conversionPolicy: {
          conversionProfile: 'prototype_bricks',
          sourceContract: 'build-in-bricks-html-first',
        },
      },
    );

    expect(baseline.pageSettings?.pixflowScriptFragments).toEqual([
      expect.objectContaining({
        id: 'build-in-bricks-source',
        placement: 'bodyFooter',
      }),
    ]);
    expect(baseline.pageSettings?.customScriptsBodyFooter).toContain('data-pixflow-fragment="build-in-bricks-source"');
    expect(baseline.pageSettings?.customScriptsBodyFooter).not.toContain('prototype-bricks-stage-b');
  });

  it('uses native forms only when Bricks can preserve the source behaviour', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main><section>
      <form class="search" action="/search" method="get"><label>Query <input name="q"></label><button>Search</button></form>
      <form class="signup"><label>Email <input type="email" name="email" required></label><button type="submit">Join</button></form>
    </section></main></body></html>`);
    const exact = baseline.content.find((element: Record<string, any>) => element.name === 'html' && String(element.settings?.html || '').includes('action="/search"'));
    const native = baseline.content.find((element: Record<string, any>) => element.name === 'form');

    expect(exact).toBeTruthy();
    expect(native?.settings?.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'email', name: 'email', required: true }),
    ]));
    expect(baseline.structureReport.exactFallbackElementCount).toBe(1);
    expect(baseline.structureReport.nativeEditableElementCount).toBeGreaterThan(0);
  });

  it('keeps authored form destinations exact while method-only visual forms remain native', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main><section>
      <form class="signup" action="/signup" method="post"><label>Email <input type="email" name="email"></label><button>Join</button></form>
      <form class="composer" method="post"><label>Message <textarea name="message"></textarea></label><button>Send</button></form>
    </section></main></body></html>`);

    expect(baseline.content).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'html',
        settings: expect.objectContaining({ html: expect.stringContaining('action="/signup"') }),
      }),
      expect.objectContaining({
        name: 'form',
        settings: expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({ type: 'textarea', name: 'message' }),
          ]),
        }),
      }),
    ]));
    expect(baseline.structureReport.exactFallbackElementCount).toBe(1);
  });

  it('treats a same-page placeholder action as a visual form and projects it to native Bricks fields', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main><section>
      <form class="contact" action="#" method="post">
        <label>Name <input type="text" name="name" required></label>
        <label>Scope <select name="scope"><option value="residential">Residential</option></select></label>
        <label>Message <textarea name="message" rows="4"></textarea></label>
        <button type="submit">Submit inquiry</button>
      </form>
    </section></main></body></html>`);
    const native = baseline.content.find((element: Record<string, any>) => element.name === 'form');
    const rawForm = baseline.content.find((element: Record<string, any>) => (
      element.name === 'html' && /<form\b/i.test(String(element.settings?.html || ''))
    ));

    expect(rawForm).toBeUndefined();
    expect(native?.settings?.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', name: 'name', required: true }),
      expect.objectContaining({ type: 'select', name: 'scope' }),
      expect.objectContaining({ type: 'textarea', name: 'message' }),
    ]));
    expect(baseline.structureReport.exactFallbackElementCount).toBe(0);
  });

  it('preserves bounded CSS-state radio components instead of splitting them into Bricks forms', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .svc-tab__radio:checked ~ .svc-tab__title { color: blue; }
      .svc-tab__radio:checked ~ .svc-tab__panel { display: block; }
    </style></head><body><main><section><div class="svc-tabs">
      <div class="svc-tab"><input class="svc-tab__radio" type="radio" name="svc" id="svc-1" value="1" checked><label class="svc-tab__title" for="svc-1">Discovery</label><div class="svc-tab__panel">First panel</div></div>
      <div class="svc-tab"><input class="svc-tab__radio" type="radio" name="svc" id="svc-2" value="2"><label class="svc-tab__title" for="svc-2">Maintenance</label><div class="svc-tab__panel">Second panel</div></div>
    </div></section></main></body></html>`);
    const interactionIsland = baseline.content.find((element: Record<string, any>) => (
      element.name === 'html' && String(element.settings?.html || '').includes('class="svc-tabs"')
    ));

    expect(interactionIsland?.settings?.html).toContain('<input class="svc-tab__radio" type="radio" name="svc" id="svc-1"');
    expect(interactionIsland?.settings?.html).toContain('<label class="svc-tab__title" for="svc-2">Maintenance</label>');
    expect(baseline.content.filter((element: Record<string, any>) => element.name === 'form')).toHaveLength(0);
    expect(baseline.structureReport.exactFallbackElementCount).toBe(1);
  });

  it('preserves text-only semantic tags, attributes, and editable inline content', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main><section>
      <div class="metadata"><time class="published" datetime="2026-08-10">today</time><abbr title="Cascading Style Sheets">CSS</abbr></div>
      <div class="callouts"><mark>Important</mark><kbd>Ctrl</kbd><q cite="/source">quoted</q></div>
      <p>Inline <time datetime="2026-08-10">today</time> remains rich text.</p>
    </section></main></body></html>`);
    const byTag = new Map(baseline.content
      .filter((element: Record<string, any>) => element.settings?.customTag)
      .map((element: Record<string, any>) => [element.settings.customTag, element]));

    expect([...byTag.keys()]).toEqual(expect.arrayContaining(['time', 'abbr', 'mark', 'kbd', 'q']));
    expect(byTag.get('time')).toMatchObject({
      name: 'text-basic',
      settings: expect.objectContaining({ tag: 'custom', customTag: 'time', text: 'today' }),
    });
    expect(attributeValue(byTag.get('time'), 'datetime')).toBe('2026-08-10');
    expect(attributeValue(byTag.get('abbr'), 'title')).toBe('Cascading Style Sheets');
    expect(attributeValue(byTag.get('q'), 'cite')).toBe('/source');
    expect(baseline.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'text-basic', settings: expect.objectContaining({ text: expect.stringContaining('<time datetime="2026-08-10">today</time>') }) }),
    ]));
    expect(baseline.structureReport.uncoveredVisibleSourceNodeCount).toBe(0);
  });

  it('keeps semantic navigation, media, SVG, and rich controls valid and editable', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main>
      <nav aria-label="Primary"><ul><li><a href="/work">Work</a></li></ul></nav>
      <figure><img src="/media/hero.jpg" alt="Hero"><figcaption>Hero <a href="/credits">credit</a></figcaption></figure>
      <video controls poster="/media/poster.jpg"><source src="/media/demo.mp4" type="video/mp4"></video>
      <svg class="icon" viewBox="0 0 24 24" aria-label="Arrow"><path d="M2 12h20"></path></svg>
      <button type="button"><span class="label">Open menu</span><span class="bar"></span></button>
    </main></body></html>`);
    const tags = baseline.content.map((element: Record<string, any>) => element.settings?.tag || element.settings?.customTag);
    const linkedCredit = baseline.content.find((element: Record<string, any>) => element.name === 'text-link' && element.settings?.link?.url === '/credits');
    const video = baseline.content.find((element: Record<string, any>) => element.name === 'video');
    const icon = baseline.content.find((element: Record<string, any>) => element.name === 'icon');
    const semanticButton = baseline.content.find((element: Record<string, any>) => element.settings?.tag === 'button' && element.children?.length);

    expect(tags).toEqual(expect.arrayContaining(['nav', 'ul', 'li', 'figure', 'figcaption']));
    expect(linkedCredit).toBeTruthy();
    expect(video).toBeTruthy();
    expect(icon).toBeTruthy();
    expect(semanticButton?.name).toMatch(/^(?:block|div)$/);
    expect(baseline.structureReport).toMatchObject({ ok: true, uncoveredVisibleSourceNodeCount: 0 });
  });

  it('preserves an exact Lucide icon identity and includes its install sidecar in converter-only output', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>.w-4{width:1rem}.h-4{height:1rem}</style></head><body><main><section>
      <a href="/technologies">Explore Technologies <svg class="lucide lucide-arrow-right w-4 h-4" width="24" height="24" viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></a>
      <div>20+ years of research</div>
    </section></main></body></html>`);
    const icon = baseline.content.find((element: Record<string, any>) => element.name === 'icon');

    expect(icon?.settings?.icon).toMatchObject({
      library: 'pixflowSvg',
      icon: 'pixflow:tabler-outline:arrow-right',
      width: '1rem',
      height: '1rem',
    });
    expect(attributeValue(icon, 'width')).toBe('');
    expect(attributeValue(icon, 'height')).toBe('');
    const widthClass = baseline.globalClasses.find((classItem: Record<string, any>) => classItem.name === 'w-4');
    const heightClass = baseline.globalClasses.find((classItem: Record<string, any>) => classItem.name === 'h-4');
    expect(widthClass?.settings?.icon?.width).toBe('1rem');
    expect(heightClass?.settings?.icon?.height).toBe('1rem');
    expect(widthClass?.settings?._cssCustom).toContain('width: 1rem');
    expect(heightClass?.settings?._cssCustom).toContain('height: 1rem');
    expect(baseline.pageSettings.customCss).toContain('.w-4.brxe-icon { width: 1rem; }');
    expect(baseline.pageSettings.customCss).toContain('.h-4.brxe-icon { height: 1rem; }');
    expect(baseline.stage_b_icon_system.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ setId: 'tabler-outline', id: 'arrow-right' }),
    ]));
  });

  it('maps Lucide-only names to installable visual equivalents in the Pixflow Tabler set', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main>
      <a href="/lab">Lab <svg class="lucide lucide-flask-conical" width="24" height="24" viewBox="0 0 24 24"><path d="M10 2v8L4 21h16l-6-11V2"></path></svg></a>
      <a href="/linkedin">LinkedIn <svg class="lucide lucide-linkedin" width="24" height="24" viewBox="0 0 24 24"><path d="M16 8a6 6 0 0 1 6 6v7"></path></svg></a>
    </main></body></html>`);
    const placeholders = baseline.content
      .filter((element: Record<string, any>) => element.name === 'icon')
      .map((element: Record<string, any>) => element.settings?.icon?.icon);

    expect(placeholders).toEqual(expect.arrayContaining([
      'pixflow:tabler-outline:flask-2',
      'pixflow:tabler-outline:brand-linkedin',
    ]));
  });

  it('accepts an authored runtime data-image slot without weakening missing-image validation', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main><section>
      <img data-img="badge" alt="Accreditation badge">
    </section></main></body></html>`);
    const image = baseline.content.find((element: Record<string, any>) => element.name === 'image');

    expect(image?.settings?.image?.url).toBe('badge');
    expect(attributeValue(image, 'data-img')).toBe('badge');
    expect(baseline.structureReport).toMatchObject({ ok: true, errorCount: 0, sourceCoverageRatio: 1 });
  });

  it('keeps same-source structural projection independent from conversion policy', () => {
    const html = `<!doctype html><html><body><section class="feature">
      <div class="feature__tabs"><button>Strategy</button><article>Panel</article></div>
      <div><div class="feature__grid"><h1>Profile comparison</h1><p>Same source.</p></div></div>
    </section></body></html>`;
    const uploaded = buildBaseline(html, {
      conversionProfile: 'uploaded_html',
      conversionPolicy: { conversionProfile: 'uploaded_html' },
    });
    const prototype = buildBaseline(html, {
      conversionProfile: 'prototype_bricks',
      conversionPolicy: { conversionProfile: 'prototype_bricks' },
    });
    const structuralProjection = (baseline: Record<string, any>) => baseline.content.map((element: Record<string, any>) => ({
      id: element.id,
      name: element.name,
      parent: element.parent || '',
      children: element.children || [],
    }));

    expect(structuralProjection(uploaded)).toEqual(structuralProjection(prototype));
    expect(uploaded.structureReport.sourceCoverageRatio).toBe(1);
    expect(prototype.structureReport.sourceCoverageRatio).toBe(1);
    expect(uploaded.structureReport.syntheticElementCount).toBe(prototype.structureReport.syntheticElementCount);
  });

  it('preserves source-auto width for structural containers inside flex rows', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .card { display: flex; justify-content: center; }
    </style></head><body><main><section class="card">
      <div class="card__inner"><h1>Intrinsic card</h1><p>Source-auto content.</p></div>
    </section></main></body></html>`);
    const inner = baseline.content.find((element: Record<string, any>) => element.name === 'container');

    expect(inner).toBeTruthy();
    expect(inner.settings._width).toBe('auto');
    expect(inner.settings._widthMax).toBe('100%');
    expect(baseline.structureReport).toMatchObject({
      ok: true,
      sourceCoverageRatio: 1,
      errorCount: 0,
    });
  });

  it('keeps uploaded page landmarks on the page while separately compiling opted-in templates', () => {
    const baseline = buildBaseline(`<!doctype html><html><body>
      <header data-od-id="site-header"><nav><a href="/">Home</a></nav></header>
      <main><section><h1>Page</h1></section></main>
      <footer data-od-id="site-footer"><p>Copyright</p></footer>
    </body></html>`, {
      headerPlan: { detected: true, includeHeader: true, selectedSectionOdId: 'site-header' },
      footerPlan: { detected: true, includeFooter: true, selectedSectionOdId: 'site-footer' },
    });

    expect(baseline.content.some((element: Record<string, any>) => element.settings?.tag === 'header')).toBe(true);
    expect(baseline.content.some((element: Record<string, any>) => element.settings?.tag === 'footer')).toBe(true);
    expect(baseline.headerContent.some((element: Record<string, any>) => element.settings?.tag === 'header')).toBe(true);
    expect(baseline.footerContent.some((element: Record<string, any>) => element.settings?.tag === 'footer')).toBe(true);
    expect(baseline.structureIr.scopes.map((scope: Record<string, any>) => scope.scope)).toEqual(['page', 'header', 'footer']);
    expect(baseline.structureReport).toMatchObject({ ok: true, uncoveredVisibleSourceNodeCount: 0 });
  });

  it('accounts for ordinary Build landmarks extracted into header and footer templates', () => {
    const baseline = buildBaseline(`<!doctype html><html><body>
      <header data-od-id="site-header"><nav><a href="/">Home</a></nav></header>
      <main><section><h1>Page</h1></section></main>
      <footer data-od-id="site-footer"><p>Copyright</p></footer>
    </body></html>`, {
      conversionPolicy: {
        conversionProfile: 'uploaded_html',
        sourceContract: 'build-in-bricks-html-first',
      },
      headerPlan: { detected: true, includeHeader: true, selectedSectionOdId: 'site-header' },
      footerPlan: { detected: true, includeFooter: true, selectedSectionOdId: 'site-footer' },
    });

    expect(baseline.content.some((element: Record<string, any>) => element.settings?.tag === 'header')).toBe(false);
    expect(baseline.content.some((element: Record<string, any>) => element.settings?.tag === 'footer')).toBe(false);
    expect(baseline.headerContent.some((element: Record<string, any>) => element.settings?.tag === 'header')).toBe(true);
    expect(baseline.footerContent.some((element: Record<string, any>) => element.settings?.tag === 'footer')).toBe(true);
    expect(baseline.structureReport).toMatchObject({
      ok: true,
      sourceCoverageRatio: 1,
      uncoveredVisibleSourceNodeCount: 0,
    });
    expect(baseline.structureReport.dispositions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        disposition: 'normalized_into_header_template',
        reason: 'source_landmark_extracted_into_header_template',
      }),
      expect.objectContaining({
        disposition: 'normalized_into_footer_template',
        reason: 'source_landmark_extracted_into_footer_template',
      }),
    ]));
  });

  it('compiles the responsive navigation boundary around the exact planned generated-id navigation instead of a semantic hero header', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><div class="page">
      <header data-pf-source-id="hero-header" class="hero"><h1>Hero title</h1><p>Hero copy</p></header>
      <div data-pf-source-id="navigation-boundary" class="nav_component">
        <a href="#main">Skip to main content</a>
        <nav data-pf-source-id="desktop-navigation" class="nav_desktop_layout"><a href="/">Desktop navigation</a></nav>
        <div data-pf-source-id="planned-navigation" class="nav-wrap is-mobile"><nav><a href="/">Mobile navigation</a></nav></div>
      </div>
      <main><section><h2>Page content</h2></section></main>
    </div></body></html>`, {
      headerPlan: {
        detected: true,
        includeHeader: true,
        selectedSectionOdId: 'planned-navigation',
        selectedSection: { index: 99, sourceTag: 'div', classList: ['nav-wrap'] },
      },
    });
    const headerText = baseline.headerContent
      .map((element: Record<string, any>) => String(element.settings?.text || ''))
      .join(' ');
    const pageText = baseline.content
      .map((element: Record<string, any>) => String(element.settings?.text || ''))
      .join(' ');

    const headerRoot = baseline.headerContent.find((element: Record<string, any>) => !element.parent);
    const headerRootProvenance = baseline.structureReport.provenance.find(
      (record: Record<string, any>) => record.bricksElementId === headerRoot?.id,
    );

    expect(headerText).toContain('Desktop navigation');
    expect(headerText).toContain('Mobile navigation');
    expect(headerText).not.toContain('Hero title');
    expect(headerRootProvenance).toMatchObject({ sourceNodeId: 'navigation-boundary' });
    expect(pageText).toContain('Hero title');
    expect(pageText).toContain('Desktop navigation');
    expect(pageText).toContain('Mobile navigation');
    expect(baseline.structureReport).toMatchObject({
      ok: true,
      sourceCoverageRatio: 1,
      uncoveredVisibleSourceNodeCount: 0,
    });
  });

  it('separates the exact template source boundary from page content without removing a semantic hero', () => {
    const result = {
      content: [
        { id: 'hero', name: 'section', settings: { tag: 'header' }, parent: '' },
        { id: 'hero-copy', name: 'heading', settings: { text: 'Hero title' }, parent: 'hero' },
        { id: 'page-nav', name: 'section', settings: {}, parent: '' },
        { id: 'page-nav-link', name: 'text-link', settings: { text: 'Navigation' }, parent: 'page-nav' },
        { id: 'main', name: 'section', settings: { tag: 'main' }, parent: '' },
      ],
      stage_b_header: {
        includeHeader: true,
        content: [
          {
            id: 'template-nav',
            name: 'section',
            settings: { _attributes: [{ name: 'data-od-id', value: 'planned-navigation' }] },
            parent: '',
          },
          { id: 'template-nav-link', name: 'text-link', settings: { text: 'Navigation' }, parent: 'template-nav' },
        ],
      },
      stage_b_source_provenance: [
        { bricksElementId: 'hero', sourceNodeId: 'hero-header', kind: 'source_node' },
        { bricksElementId: 'hero-copy', sourceNodeId: 'hero-copy', kind: 'source_node' },
        { bricksElementId: 'page-nav', sourceNodeId: 'navigation-boundary', kind: 'source_node' },
        { bricksElementId: 'page-nav-link', sourceNodeId: 'planned-navigation', kind: 'source_node' },
        { bricksElementId: 'template-nav', sourceNodeId: 'navigation-boundary', kind: 'source_node' },
        { bricksElementId: 'template-nav-link', sourceNodeId: 'navigation-link', kind: 'source_node' },
        { bricksElementId: 'main', sourceNodeId: 'main', kind: 'source_node' },
      ],
    };

    const normalized = normalizeTemplateAreaSeparation(
      result,
      { detected: true, includeHeader: true, selectedSectionOdId: 'planned-navigation' },
      {},
    );

    expect(normalized.result.content.map((element: Record<string, any>) => element.id)).toEqual([
      'hero',
      'hero-copy',
      'main',
    ]);
    expect(normalized.report).toMatchObject({
      applied: true,
      removedElementCount: 2,
      removedAreas: [expect.objectContaining({ area: 'header', sourceNodeId: 'navigation-boundary' })],
    });
  });

  it('compiles the exact planned generated-id footer instead of an unrelated semantic footer', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><div class="page">
      <main><section><h1>Page content</h1></section></main>
      <footer data-pf-source-id="closing-cta" class="closing"><p>Closing call to action</p></footer>
      <div class="footer-shell">
        <div data-pf-source-id="planned-footer" class="footer-wrap"><nav><a href="/privacy">Privacy navigation</a></nav></div>
      </div>
    </div></body></html>`, {
      footerPlan: {
        detected: true,
        includeFooter: true,
        selectedSectionOdId: 'planned-footer',
        selectedSection: { index: 99, sourceTag: 'div', classList: ['footer-wrap'] },
      },
    });
    const footerText = baseline.footerContent
      .map((element: Record<string, any>) => String(element.settings?.text || ''))
      .join(' ');
    const pageText = baseline.content
      .map((element: Record<string, any>) => String(element.settings?.text || ''))
      .join(' ');

    expect(footerText).toContain('Privacy navigation');
    expect(footerText).not.toContain('Closing call to action');
    expect(pageText).toContain('Closing call to action');
    expect(pageText).toContain('Privacy navigation');
    expect(baseline.structureReport).toMatchObject({ ok: true, sourceCoverageRatio: 1 });
  });

  it('keeps a detected landmark on the page when its template is not included', () => {
    const baseline = buildBaseline(`<!doctype html><html><body><main>
      <section><h1>Page</h1></section>
      <nav class="footer-nav"><a href="#top">Top</a></nav>
    </main></body></html>`, {
      conversionProfile: 'prototype_bricks',
      conversionPolicy: { conversionProfile: 'prototype_bricks' },
      headerPlan: { detected: true, includeHeader: false },
    });

    expect(baseline.headerContent).toEqual([]);
    expect(baseline.content.some((element: Record<string, any>) => element.settings?.tag === 'nav')).toBe(true);
    expect(baseline.structureReport).toMatchObject({
      ok: true,
      uncoveredVisibleSourceNodeCount: 0,
      sourceCoverageRatio: 1,
    });
  });

  it('rejects duplicate IDs, broken flat links, and incompatible parent capabilities', () => {
    const result = validatePixflowBricksStructureProjection({
      elements: [
        { id: 'same', name: 'heading', settings: {}, children: ['child'] },
        { id: 'same', name: 'text-basic', parent: 'missing', settings: {}, children: [] },
        { id: 'child', name: 'text-basic', parent: 'same', settings: {}, children: [] },
        { id: 'shell', name: 'html', settings: { html: '<body><main>Duplicate app shell</main></body>' }, children: [] },
        { id: 'image', name: 'image', settings: { image: {} }, children: [] },
      ],
      provenance: [],
      compatibilityContext: {},
    });

    expect(result.ok).toBe(false);
    expect(result.errors.map((error: Record<string, any>) => error.code)).toEqual(expect.arrayContaining([
      'duplicate_bricks_element_id',
      'missing_parent_element',
      'non_nestable_parent_element',
      'missing_element_provenance',
      'document_shell_fallback_forbidden',
      'missing_image_reference',
    ]));
  });

  it('does not count an omitted visible source node as successful coverage', () => {
    const node = {
      type: 'element',
      tag: 'p',
      sourceIndex: 1,
      attrs: { 'data-pf-source-id': 'visible-copy' },
      attrList: [{ name: 'data-pf-source-id', value: 'visible-copy' }],
      children: [],
    };
    const ir = buildPixflowHtmlStructureIr({ roots: [node], scope: 'page' });
    const recorder = createPixflowStructureProjectionRecorder({ ir });
    recorder.recordDisposition(node, 'omitted', 'unsupported_visible_copy');
    const result = finalizePixflowHtmlStructureProjection({ recorders: [recorder], elements: [] });

    expect(result.report.ok).toBe(false);
    expect(result.report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'visible_source_node_omitted', sourceNodeId: 'visible-copy' }),
    ]));
  });

  it('rejects stale provenance whose projected element was removed', () => {
    const result = validatePixflowBricksStructureProjection({
      elements: [],
      provenance: [{
        bricksElementId: 'removed',
        bricksElementName: 'block',
        kind: 'source_node',
        sourceNodeId: 'card-2',
        reason: 'source_article_to_block',
      }],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'stale_element_provenance', bricksElementId: 'removed' }),
    ]));
  });
});
