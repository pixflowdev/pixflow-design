import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildPixflowStyleOwnershipReport,
  extractPixflowCssClassNames,
  parsePixflowStylesheetDeclarations,
  replacePixflowCssClassSelector,
  resolvePixflowSimpleClassCascade,
} from '../html-to-bricks-style-ownership.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function buildBaseline(html: string): Record<string, any> {
  const directory = mkdtempSync(join(tmpdir(), 'pixflow-style-ownership-'));
  temporaryDirectories.push(directory);
  const htmlFile = join(directory, 'index.html');
  writeFileSync(htmlFile, html);
  const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const { buildPixflowStageBHtmlBaseline, normalizeStageBRootOnlyCustomCssForTest } = await import(${JSON.stringify(bridgeModuleUrl)});
     const baseline = await buildPixflowStageBHtmlBaseline({
       htmlFile: ${JSON.stringify(htmlFile)},
       plan: {
         sourceId: 'style-ownership-test',
         title: 'Style ownership test',
         conversionProfile: 'uploaded_html',
         conversionPolicy: { conversionProfile: 'uploaded_html' },
       },
     });
     normalizeStageBRootOnlyCustomCssForTest(baseline);
     process.stdout.write(JSON.stringify(baseline));`,
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function classByName(baseline: Record<string, any>, name: string): Record<string, any> {
  return baseline.globalClasses.find((item: Record<string, any>) => item.name === name);
}

describe('Pixflow HTML style ownership', () => {
  it('preserves Tailwind arbitrary values, CSS-variable gradients, and min-width media queries', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      :root {
        --gradient-hero: radial-gradient(ellipse at top right, hsl(195 80% 28%) 0%, hsl(220 60% 10%) 55%, hsl(222 70% 6%) 100%);
      }
      h1 { font-size: inherit; font-weight: inherit; font-family: Arial, sans-serif; }
      .bg-gradient-hero { background-image: var(--gradient-hero); }
      .text-\\[2\\.75rem\\] { font-size: 2.75rem; line-height: 1.05; }
      .font-bold { font-weight: 700; }
      .hidden { display: none; }
      @media (min-width: 1024px) {
        .lg\\:text-\\[4\\.5rem\\] { font-size: 4.5rem; }
        .lg\\:flex { display: flex; }
      }
    </style></head><body><main><section class="bg-gradient-hero"><nav class="hidden lg:flex">Links</nav>
      <h1 class="text-[2.75rem] lg:text-[4.5rem] font-bold">Engineering materials</h1>
    </section></main></body></html>`);
    const background = classByName(baseline, 'bg-gradient-hero');
    const mobileHeading = classByName(baseline, 'text--2-75rem');
    const desktopHeading = classByName(baseline, 'lg-text--4-5rem');
    const boldHeading = classByName(baseline, 'font-bold');
    const desktopFlex = classByName(baseline, 'lg-flex');

    expect(baseline.globalClasses.map((item: Record<string, any>) => item.name)).toEqual(expect.arrayContaining([
      'bg-gradient-hero',
      'text--2-75rem',
      'lg-text--4-5rem',
    ]));
    expect(background.settings._gradient).toEqual(expect.objectContaining({
      gradientType: 'radial',
      colors: expect.arrayContaining([
        expect.objectContaining({ color: { raw: 'hsl(195 80% 28%)' } }),
        expect.objectContaining({ color: { raw: 'hsl(222 70% 6%)' } }),
      ]),
    }));
    expect(background.settings?._background?.color?.raw).not.toBe('var(--gradient-hero)');
    expect(mobileHeading.settings._typography).toMatchObject({
      'font-size': '2.75rem',
      'line-height': '1.05',
    });
    expect(desktopHeading.settings._cssCustom).toMatch(
      /@media \(min-width: 1024px\).*%root%\s*\{\s*font-size:\s*4\.5rem !important;/s,
    );
    expect(desktopHeading.settings['_typography:tablet_portrait']).toBeUndefined();
    expect(boldHeading.settings._typography).toEqual({ 'font-weight': '700' });
    expect(desktopFlex.settings._cssCustom).toMatch(
      /@media \(min-width: 1024px\).*display:\s*flex !important;\s*flex-direction:\s*row !important;/s,
    );
    expect(baseline.pageSettings.customCss).toContain('html { font-size: 16px; }');
    // Theme-style compatibility CSS is scoped to the generated content root;
    // the page-level source baseline remains separately covered above. This
    // prevents imported HTML from mutating the destination site's global html
    // defaults while preserving the authored 16px baseline inside the owned
    // Bricks content tree.
    expect(baseline.themeStylePayload.settings.css.stylesheet).toContain(
      '#brx-content.pixflow-generated-page { font-size: 16px !important; }',
    );
    expect(baseline.themeStylePayload.settings.css.stylesheet).toContain(
      '#brx-content.pixflow-generated-page { --gradient-hero: radial-gradient(ellipse at top right, hsl(195 80% 28%) 0%, hsl(220 60% 10%) 55%, hsl(222 70% 6%) 100%); }',
    );
    expect(baseline.styleOwnershipReport).toMatchObject({ ok: true, silentLossCount: 0 });
    expect(baseline.globalClasses.map((item: Record<string, any>) => item.name))
      .not.toEqual(expect.arrayContaining([expect.stringMatching(/^stage-a-/)]));
  });

  it('keeps authored web-font identity in the deterministic converter and delegates delivery to its font sidecar', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      body { font-family: Inter, system-ui, sans-serif; }
      h1 { font-family: "Space Grotesk", Inter, sans-serif; letter-spacing: -.02em; }
      .hero-title { font-size: 4.5rem; line-height: 1.02; }
    </style></head><body><main><h1 class="hero-title">Material science</h1></main></body></html>`);
    const heading = baseline.content.find((item: Record<string, any>) => item.name === 'heading');
    const classes = new Map(baseline.globalClasses.map((item: Record<string, any>) => [item.id, item]));
    const headingClasses = (heading.settings._cssGlobalClasses || []).map((id: string) => classes.get(id));

    expect(headingClasses.map((item: Record<string, any>) => item.name)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^stage-a-/)]),
    );
    expect(baseline.themeStylePayload.settings.css.stylesheet).toContain(
      ':where(#brx-content.pixflow-generated-page) h1.brxe-heading { font-family: "Space Grotesk", Inter, sans-serif; }',
    );
    expect(baseline.stage_b_font_system.fonts).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: 'Space Grotesk', installAction: 'install_before_stage_b_insert' }),
    ]));
    expect(baseline.stage_b_font_system.fonts).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: 'Inter', installAction: 'install_before_stage_b_insert' }),
    ]));
  });

  it('recognises collision-aliased relationship selectors as emitted page CSS', () => {
    const report = buildPixflowStyleOwnershipReport({
      cssText: '.grid-cursor .grid-prose__w-full { max-width: 1140px; margin-inline: auto; }',
      sourceHtml: '<main class="grid-cursor"><div class="grid-prose__w-full">Content</div></main>',
      globalClasses: [
        { id: 'grid-id', name: 'cur-grid-cursor', settings: {} },
        { id: 'prose-id', name: 'cur-grid-prose__w-full', settings: {} },
      ],
      sourceClassIdByName: new Map([
        ['grid-cursor', 'grid-id'],
        ['grid-prose__w-full', 'prose-id'],
      ]),
      pageSettings: {
        customCss: '#brx-content :is(.grid-cursor,.cur-grid-cursor) :is(.grid-prose__w-full,.cur-grid-prose__w-full) { max-width: 1140px; margin-inline: auto; }',
      },
    });

    expect(report).toMatchObject({ ok: true, silentLossCount: 0 });
    expect(report.declarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: '.grid-cursor .grid-prose__w-full', property: 'max-width', destination: 'page_css', emitted: true }),
      expect.objectContaining({ selector: '.grid-cursor .grid-prose__w-full', property: 'margin-inline', destination: 'page_css', emitted: true }),
    ]));
  });

  it('keeps CSS-escaped class identifiers whole through selector extraction and root scoping', () => {
    const selector = '.card:hover .text-white\\/58';

    expect(extractPixflowCssClassNames(selector)).toEqual(['card', 'text-white/58']);
    expect(replacePixflowCssClassSelector(selector, 'text-white/58', '%root%')).toBe('.card:hover %root%');
    expect(replacePixflowCssClassSelector(selector, 'card', '%root%')).toBe('%root%:hover .text-white\\/58');
  });

  it('retains identical media provenance for compact and spaced media-query syntax', () => {
    const declarations = parsePixflowStylesheetDeclarations([
      'body { width: 60vw; }',
      '@media(max-width:480px) { body { width: 70vw; } }',
      '@media (max-width: 767px) { body { margin: 10vh auto; } }',
    ].join('\n'));

    expect(declarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: 'body', property: 'width', value: '60vw', media: '' }),
      expect.objectContaining({ selector: 'body', property: 'width', value: '70vw', media: '(max-width:480px)' }),
      expect.objectContaining({ selector: 'body', property: 'margin', value: '10vh auto', media: '(max-width: 767px)' }),
    ]));
  });

  it('resolves grouped rules, specificity, important declarations, states, and fluid values without flattening the cascade', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .card, .panel { display: grid; gap: clamp(12px, 2vw, 28px); color: blue; }
      div.card { color: red; }
      .card { color: green; padding: 1rem !important; }
      .card { padding: 2rem; }
      .card:hover, .panel:focus-visible { color: purple; transform: translateY(-2px); }
      @media (max-width: 478px) {
        .card, .panel { grid-template-columns: 1fr; clip-path: inset(0 round 12px); }
      }
    </style></head><body><main><div class="card">Card</div><section class="panel" tabindex="0">Panel</section></main></body></html>`);
    const card = classByName(baseline, 'card');
    const panel = classByName(baseline, 'panel');

    expect(card.settings._display).toBe('grid');
    expect(panel.settings._display).toBe('grid');
    expect(card.settings._columnGap).toMatch(/^var\(--pf-source-spacing-/);
    expect(panel.settings._rowGap).toBe(card.settings._columnGap);
    expect(baseline.tokenGraphReport.mutationIntent.resourceAdditions.variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'clamp(12px, 2vw, 28px)', semanticRole: 'spacing' }),
    ]));
    expect(card.settings._typography.color.raw).toBe('red');
    expect(card.settings._padding).toBeUndefined();
    expect(card.settings._cssCustom).toContain('padding: 1rem !important');
    expect(card.settings['_typography:hover'].color.raw).toBe('purple');
    expect(panel.settings['_typography:focus-visible'].color.raw).toBe('purple');
    expect(card.settings['_gridTemplateColumns:mobile_portrait']).toBe('1fr');
    expect(panel.settings['_gridTemplateColumns:mobile_portrait']).toBe('1fr');
    expect(card.settings._cssCustom).toContain('@media (max-width: 478px)');
    expect(card.settings._cssCustom).toContain('clip-path: inset(0 round 12px)');
    expect(
      baseline.styleOwnershipReport,
      JSON.stringify(baseline.styleOwnershipReport.errors, null, 2),
    ).toMatchObject({
      ok: true,
      unresolvedDeclarationCount: 0,
      silentLossCount: 0,
    });
  });

  it('does not lift unrelated same-class selectors from elements that are absent from the source DOM', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .d-none { display: none; }
      .dropdown-menu.d-none { opacity: 0; transform: translateX(-45%) scale(.8); }
      @media (min-width: 576px) { .d-sm-block { display: block !important; } }
    </style></head><body><main>
      <img class="d-none d-sm-block" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
    </main></body></html>`);
    const hidden = classByName(baseline, 'd-none');

    expect(hidden.settings._display).toBe('none');
    expect(hidden.settings._opacity).toBeUndefined();
    expect(hidden.settings._transform).toBeUndefined();
  });

  it('preserves isolated gap axes on their global class without duplicating two-axis gap ownership', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      :root { --spacing: 4px; }
      .gap-x { display: flex; column-gap: calc(var(--spacing) * 3); }
      .gap-y { display: flex; row-gap: calc(var(--spacing) * 2); }
      .gap-both { display: flex; gap: calc(var(--spacing) * 4) calc(var(--spacing) * 5); }
      .gap-responsive { display: flex; }
      @media (max-width: 478px) {
        .gap-responsive { column-gap: calc(var(--spacing) * 6); }
      }
    </style></head><body><main>
      <p class="gap-x"><span>Column</span><span>gap</span></p>
      <p class="gap-y"><span>Row</span><span>gap</span></p>
      <p class="gap-both"><span>Both</span><span>axes</span></p>
      <p class="gap-responsive"><span>Responsive</span><span>gap</span></p>
    </main></body></html>`);
    const gapX = classByName(baseline, 'gap-x');
    const gapY = classByName(baseline, 'gap-y');
    const gapBoth = classByName(baseline, 'gap-both');
    const gapResponsive = classByName(baseline, 'gap-responsive');

    expect(gapX.settings._columnGap).toBeUndefined();
    expect(gapX.settings._rowGap).toBeUndefined();
    expect(gapX.settings._cssCustom).toMatch(/%root%\s*\{\s*column-gap:\s*calc\(var\(--spacing\) \* 3\);\s*\}/);
    expect(gapX.settings._cssCustom).not.toContain('row-gap:');

    expect(gapY.settings._columnGap).toBeUndefined();
    expect(gapY.settings._rowGap).toBeUndefined();
    expect(gapY.settings._cssCustom).toMatch(/%root%\s*\{\s*row-gap:\s*calc\(var\(--spacing\) \* 2\);\s*\}/);
    expect(gapY.settings._cssCustom).not.toContain('column-gap:');

    expect(gapBoth.settings._rowGap).toBe('calc(var(--spacing) * 4)');
    expect(gapBoth.settings._columnGap).toBe('calc(var(--spacing) * 5)');
    expect(gapBoth.settings._cssCustom || '').not.toMatch(/(?:^|[;{]\s*)(?:column-gap|row-gap|gap)\s*:/);

    expect(gapResponsive.settings['_columnGap:mobile_portrait']).toBeUndefined();
    expect(gapResponsive.settings._cssCustom).toMatch(/@media \(max-width: 478px\).*%root%\s*\{\s*column-gap:\s*calc\(var\(--spacing\) \* 6\);/s);

    expect(baseline.styleOwnershipReport.declarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: '.gap-x', property: 'column-gap', destination: 'scoped_class_css', emitted: true }),
      expect.objectContaining({ selector: '.gap-y', property: 'row-gap', destination: 'scoped_class_css', emitted: true }),
      expect.objectContaining({ selector: '.gap-both', property: 'gap', destination: 'global_class_native_control', emitted: true }),
      expect.objectContaining({ selector: '.gap-responsive', property: 'column-gap', media: '(max-width: 478px)', destination: 'scoped_class_css', emitted: true }),
    ]));
    expect(baseline.styleOwnershipReport).toMatchObject({
      ok: true,
      unresolvedDeclarationCount: 0,
      silentLossCount: 0,
    });
  });

  it('keeps relationship, pseudo-element, attribute, and keyframe behaviour at a scoped fallback owner', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .grid > .card + .card { margin-top: 8px; }
      .card[data-active="true"] { filter: blur(1px); }
      .card::before { content: ""; mask-image: linear-gradient(#000, transparent); }
      .card { animation: pulse 1s ease-in-out infinite; }
      @keyframes pulse { from { opacity: .6; } to { opacity: 1; } }
    </style></head><body><main><div class="grid"><article class="card" data-active="true">One</article><article class="card">Two</article></div></main></body></html>`);
    const grid = classByName(baseline, 'grid');
    const card = classByName(baseline, 'card');

    expect(`${grid.settings._cssCustom || ''}\n${card.settings._cssCustom || ''}`).toContain('%root%');
    expect(`${grid.settings._cssCustom || ''}\n${card.settings._cssCustom || ''}`).toContain('[data-active="true"]');
    expect(card.settings._cssCustom).toContain('::before');
    expect(card.settings._cssCustom).toContain('mask-image');
    expect(card.settings._cssCustom).toContain('animation: pulse 1s ease-in-out infinite');
    expect(baseline.pageSettings.customCss).toContain('@keyframes pulse');
    expect(baseline.styleOwnershipReport).toMatchObject({
      ok: true,
      unresolvedDeclarationCount: 0,
      silentLossCount: 0,
    });
    expect(baseline.styleOwnershipReport.destinations).toEqual(expect.objectContaining({
      global_class_native_control: expect.any(Number),
      scoped_class_css: expect.any(Number),
      page_css: expect.any(Number),
    }));
    expect(baseline.styleOwnershipReport.declarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: '.card::before', property: 'mask-image', destination: 'scoped_class_css' }),
      expect.objectContaining({ selector: '@keyframes pulse', destination: 'page_css' }),
    ]));
  });

  it('keeps shorthand order, important longhands, and inherited parent typography semantically distinct', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      .parent { color: rgb(12, 34, 56); font-family: Arial, sans-serif; }
      .box { margin-left: 20px; margin: 10px; }
      .box { margin: 12px; margin-left: 24px !important; }
    </style></head><body><main><div class="parent"><span class="child">Inherited</span></div><div class="box">Box</div></main></body></html>`);
    const parent = classByName(baseline, 'parent');
    const child = classByName(baseline, 'child');
    const box = classByName(baseline, 'box');

    expect(parent.settings._typography.color.raw).toBe('rgb(12, 34, 56)');
    expect(parent.settings._typography['font-family']).toBe('Arial');
    expect(child?.settings?._typography?.color).toBeUndefined();
    expect(box.settings._margin).toEqual({
      top: expect.stringMatching(/^var\(--pf-source-spacing-/),
      right: expect.stringMatching(/^var\(--pf-source-spacing-/),
      bottom: expect.stringMatching(/^var\(--pf-source-spacing-/),
      left: expect.stringMatching(/^var\(--pf-source-spacing-/),
    });
    expect(new Set(Object.values(box.settings._margin))).toHaveLength(1);
    expect(box.settings._cssCustom).toContain('margin-left: 24px !important');
    expect(baseline.styleOwnershipReport).toMatchObject({ ok: true, silentLossCount: 0 });
  });

  it('does not lift a tag-qualified class rule when the class is used by mixed element tags', () => {
    const usageByClass = new Map([
      ['item', { tags: ['div', 'span'] }],
    ]);
    const resolved = resolvePixflowSimpleClassCascade({
      usageByClass,
      rules: [{ index: 1, selector: 'div.item', declarations: { color: 'red' } }],
    });

    expect(resolved.declarationsByClass.get('item')).toEqual({});
    expect(resolved.decisions).toEqual([
      expect.objectContaining({
        selector: 'div.item',
        property: 'color',
        safelyLiftable: false,
        destination: 'scoped_class_css',
      }),
    ]);
  });
});
