import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildPixflowBricksPageFoundationThemeStyle } from '../html-to-bricks-compatibility.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function buildBaseline(html: string, plan: Record<string, unknown>): Record<string, any> {
  const directory = mkdtempSync(join(tmpdir(), 'pixflow-page-foundation-'));
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
       plan: ${JSON.stringify(plan)},
     });
     process.stdout.write(JSON.stringify(baseline));`,
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function inspectFoundation(payload: Record<string, unknown>): Record<string, any> {
  const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `const { inspectPixflowStageBPageFoundationContract } = await import(${JSON.stringify(bridgeModuleUrl)});
     process.stdout.write(JSON.stringify(inspectPixflowStageBPageFoundationContract(${JSON.stringify(payload)})));`,
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

const completeDocument = `<!doctype html><html><head><style>
  body { color: #202124; background-color: #fafafa; font-family: Inter, sans-serif; font-size: 17px; line-height: 1.6; }
  h1 { color: #111; font-size: 52px; line-height: 1.05; margin: 0; }
  a { color: #1457d9; text-decoration: underline; }
  section { padding: 64px 24px; }
  .container { width: 100%; max-width: 1180px; margin-inline: auto; }
  button { color: white; background-color: #1457d9; border-radius: 8px; padding: 12px 20px; }
  input, textarea, select { color: #202124; background-color: white; border: 1px solid #c7c7c7; padding: 10px 12px; }
  :focus-visible { outline: 2px solid #1457d9; }
  .card { background: white; border-radius: 16px; transform: translateY(-2px); }
</style></head><body>
  <header><a href="/">Brand</a></header>
  <main><section><div class="container"><h1>Title</h1><a href="#more">More</a><button>Go</button><input value="x"><article class="card">Card</article></div></section><section><div class="container">Second</div></section></main>
  <footer><a href="/legal">Legal</a></footer>
</body></html>`;

describe('Pixflow HTML-to-Bricks page foundation', () => {
  it('rejects malformed or globally unsafe page-foundation sidecars before apply', () => {
    const inspection = inspectFoundation({
      schema: 'pixflow.html_to_bricks.page_foundation.v1',
      version: 1,
      mode: 'page_foundation',
      owner: 'pixflow_html_to_bricks',
      scope: 'current_page',
      nativeGlobalScopeSafe: false,
      templateOwnership: { content: 'source_owned', header: 'destination_preserved', footer: 'destination_preserved' },
      settings: { typography: { typographyBody: { 'font-size': '18px' } }, css: { stylesheet: 'body { color: red; }' } },
      ownership: { declarations: [] },
    });

    expect(inspection.errors.map((issue: Record<string, any>) => issue.id)).toEqual(expect.arrayContaining([
      'stage_b_page_foundation_unsafe_native_scope',
      'stage_b_page_foundation_stylesheet_unscoped',
    ]));
  });

  it('maps semantic broad defaults through the versioned compatibility adapter', () => {
    const result = buildPixflowBricksPageFoundationThemeStyle({
      id: 'source-foundation',
      label: 'Source foundation',
      semanticDefaults: {
        bodyTypography: { 'font-family': 'Inter', 'font-size': '17px' },
        siteBackground: { color: { raw: '#fafafa' } },
        link: { typography: { color: { raw: '#1457d9' } }, cssSelectors: '#brx-content a' },
        focusOutline: '2px solid #1457d9',
        section: { padding: { top: '64px', right: '0', bottom: '64px', left: '0' } },
      },
      stylesheet: '/* compatibility */',
    }, { bricksVersion: '2.4-beta', runtimeObserved: true });

    expect(result).toMatchObject({
      ok: true,
      value: {
        settings: {
          typography: {
            typographyBody: { 'font-family': 'Inter', 'font-size': '17px' },
            focusOutline: '2px solid #1457d9',
          },
          general: { siteBackground: { color: { raw: '#fafafa' } } },
          links: { typography: { color: { raw: '#1457d9' } }, cssSelectors: '#brx-content a' },
          section: { padding: { top: '64px', right: '0', bottom: '64px', left: '0' } },
          css: { stylesheet: '/* compatibility */' },
        },
      },
    });
    expect(result.value.compatibility).toMatchObject({ profileId: 'bricks-2.4', supported: true });
  });

  it('emits a versioned native page foundation when source-owned header and footer make page-wide controls safe', () => {
    const baseline = buildBaseline(completeDocument, {
      sourceId: 'foundation-native',
      title: 'Foundation native',
      conversionProfile: 'uploaded_html',
      conversionPolicy: { conversionProfile: 'uploaded_html' },
      headerPlan: { includeHeader: true, scope: 'current-page' },
      footerPlan: { includeFooter: true, scope: 'current-page' },
    });
    const payload = baseline.themeStylePayload;

    expect(payload).toMatchObject({
      schema: 'pixflow.html_to_bricks.page_foundation.v1',
      version: 1,
      mode: 'page_foundation',
      owner: 'pixflow_html_to_bricks',
      scope: 'current_page',
      templateOwnership: { content: 'source_owned', header: 'source_owned', footer: 'source_owned' },
      compatibility: { profileId: 'bricks-2.4', supported: true },
    });
    expect(payload.settings).toEqual(expect.objectContaining({
      typography: expect.objectContaining({ typographyBody: expect.any(Object), typographyHeadingH1: expect.any(Object), focusOutline: '2px solid #1457d9' }),
      general: { siteBackground: { color: { raw: expect.any(String) } } },
      links: expect.objectContaining({ typography: expect.any(Object) }),
      section: expect.objectContaining({ padding: expect.any(Object) }),
      container: expect.objectContaining({ widthMax: '1180px' }),
      button: expect.any(Object),
      form: expect.any(Object),
      css: { stylesheet: expect.stringContaining('Pixflow page-foundation compatibility reset') },
    }));
    expect(payload.ownership.nativeDeclarationCount).toBeGreaterThan(0);
    expect(payload.ownership.stylesheetDeclarationCount).toBeGreaterThan(0);
    expect(payload.dependencies).toMatchObject({ cssVariables: expect.any(Array), paletteOrVariableResources: expect.any(Array) });
    const pageCss = baseline.pageSettings.customCss || '';
    expect(pageCss).not.toContain(':where(#brx-content) :where(h1)');
    expect(pageCss).not.toMatch(/body, #brx-content\s*\{[^}]*font-size:\s*17px/);
    expect(baseline.styleOwnershipReport).toMatchObject({ ok: true, silentLossCount: 0 });
    expect(baseline.styleOwnershipReport.destinations.theme_style_native_control).toBeGreaterThan(0);
    expect(baseline.summary.themeStylePayloadIncluded).toBe(true);
  });

  it('keeps component styles on classes and scopes the foundation stylesheet when shared templates are preserved', () => {
    const baseline = buildBaseline(completeDocument, {
      sourceId: 'foundation-content-only',
      title: 'Foundation content only',
      conversionProfile: 'uploaded_html',
      conversionPolicy: { conversionProfile: 'uploaded_html' },
      headerPlan: { includeHeader: false, scope: 'preserve' },
      footerPlan: { includeFooter: false, scope: 'preserve' },
    });
    const payload = baseline.themeStylePayload;
    const card = baseline.globalClasses.find((item: Record<string, any>) => item.name === 'card');

    expect(payload.templateOwnership).toEqual({ content: 'source_owned', header: 'destination_preserved', footer: 'destination_preserved' });
    expect(payload.nativeGlobalScopeSafe).toBe(false);
    expect(payload.settings).toEqual({
      conditions: expect.any(Object),
      css: { stylesheet: expect.stringMatching(/#brx-content\.pixflow-generated-page/) },
    });
    expect(payload.settings.css.stylesheet).not.toMatch(/#brx-header|#brx-footer/);
    expect(payload.settings.css.stylesheet).not.toMatch(/(?:^|[},])\s*(?::root|html|body)\b/im);
    expect(inspectFoundation(payload).errors).toEqual([]);
    expect(card.settings._background).toBeDefined();
    expect(card.settings._transform).toBeDefined();
    expect(baseline.styleOwnershipReport).toMatchObject({ ok: true, silentLossCount: 0 });
  });

  it('scopes direct foundation selectors without outranking class-owned component styles', () => {
    const baseline = buildBaseline(`<!doctype html><html><head><style>
      h2 { font-size: inherit; font-weight: inherit; }
      .text-h2 { font-size: 48px; font-weight: 500; }
    </style></head><body>
      <header><h2 class="text-h2">Header title</h2></header>
      <main><h2 class="text-h2">Get started with ChatGPT</h2></main>
      <footer>Destination footer</footer>
    </body></html>`, {
      sourceId: 'foundation-specificity',
      title: 'Foundation specificity',
      conversionProfile: 'uploaded_html',
      conversionPolicy: { conversionProfile: 'uploaded_html' },
      headerPlan: { includeHeader: true, scope: 'current-page' },
      footerPlan: { includeFooter: false, scope: 'preserve' },
    });
    const stylesheet = baseline.themeStylePayload.settings.css.stylesheet;
    const headingClass = baseline.globalClasses.find((item: Record<string, any>) => item.name === 'text-h2');

    expect(stylesheet).toContain(':where(#brx-content.pixflow-generated-page, #brx-header) h2.brxe-heading { font-size: inherit; }');
    expect(stylesheet).toContain(':where(#brx-content.pixflow-generated-page, #brx-header) h2.brxe-heading { font-weight: inherit; }');
    expect(stylesheet).not.toContain('#brx-content.pixflow-generated-page h2, #brx-header h2');
    expect(stylesheet).not.toContain('#brx-footer');
    expect(headingClass.settings._typography).toEqual(expect.objectContaining({
      'font-size': '48px',
      'font-weight': '500',
    }));
    expect(baseline.themeStylePayload.ownership.declarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: 'h2', property: 'font-size', destination: 'theme_style_stylesheet' }),
    ]));
    expect(baseline.styleOwnershipReport).toMatchObject({ ok: true, silentLossCount: 0 });
  });

  it('uses frozen browser document evidence when broad defaults are inherited without a direct body rule', () => {
    const baseline = buildBaseline('<!doctype html><html><body><header>Head</header><main><h1>Title</h1></main><footer>Foot</footer></body></html>', {
      sourceId: 'foundation-browser-evidence',
      title: 'Foundation browser evidence',
      conversionProfile: 'uploaded_html',
      conversionPolicy: { conversionProfile: 'uploaded_html' },
      headerPlan: { includeHeader: true, scope: 'current-page' },
      footerPlan: { includeFooter: true, scope: 'current-page' },
      sourceEvidence: { renderedSnapshot: { viewports: [{
        id: 'desktop',
        documentStyles: {
          html: { 'font-size': '16px', 'background-color': 'rgb(250, 250, 250)' },
          body: { color: 'rgb(32, 33, 36)', 'font-family': 'Inter, sans-serif', 'font-size': '18px', 'font-weight': '400', 'line-height': '28px', 'background-color': 'rgba(0, 0, 0, 0)' },
        },
      }] } },
    });

    expect(baseline.themeStylePayload.settings).toEqual(expect.objectContaining({
      typography: expect.objectContaining({ typographyBody: expect.objectContaining({ 'font-size': '18px', 'line-height': '28px' }) }),
      general: { siteBackground: { color: { raw: 'rgb(250, 250, 250)' } } },
    }));
    expect(baseline.themeStylePayload.ownership.declarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ selector: 'body', property: 'font-size', provenance: 'browser_computed_page_wide_evidence', destination: 'theme_style_native_control' }),
    ]));
    expect(baseline.pageSettings.customCss || '').not.toMatch(/body, #brx-content\s*\{[^}]*font-size:\s*18px/);
  });
});
