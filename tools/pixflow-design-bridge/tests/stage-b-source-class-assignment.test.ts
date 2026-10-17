import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Stage A source-class assignment', () => {
  it('attaches every source class as a Bricks global class, including allowed utility classes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pixflow-stage-b-source-classes-'));
    temporaryDirectories.push(directory);
    const htmlFile = join(directory, 'index.html');
    writeFileSync(htmlFile, `<!doctype html>
      <html><head><style>
        .section { padding-block: 48px; }
        .container { max-width: 1140px; margin-inline: auto; }
        .hero-split { display: grid; grid-template-columns: 1fr 1fr; }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; }
      </style></head><body>
        <section class="section" data-od-id="hero">
          <div class="container hero-split"><div class="status-dot"></div></div>
        </section>
      </body></html>`);

    const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const { buildPixflowStageBHtmlBaseline } = await import(${JSON.stringify(bridgeModuleUrl)});
       const baseline = await buildPixflowStageBHtmlBaseline({
         htmlFile: ${JSON.stringify(htmlFile)},
         plan: {
           sourceId: 'source-class-test',
           title: 'Source class test',
           routeContract: { variableAuthority: { allowedUtilityClasses: ['section', 'container', 'hero-split'] } },
         },
       });
       process.stdout.write(JSON.stringify(baseline));`,
    ], { encoding: 'utf8' });
    const baseline = JSON.parse(output);

    const classNameById = new Map(
      baseline.globalClasses.map((classItem) => [classItem.id, classItem.name]),
    );
    const section = baseline.content.find((element) => element.name === 'section');
    const container = baseline.content.find((element) => element.name === 'container');

    expect(section?.settings._attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'data-od-id', value: 'hero' }),
    ]));
    expect(container?.settings._attributes?.filter((attribute) => attribute.name !== 'data-pf-source-id')).toEqual([]);
    // A source max-width is only a cap. Bricks containers otherwise retain
    // their native fixed width and overflow narrow viewports when the source
    // div relied on width:auto to shrink to its containing block.
    expect(container?.settings._width).toBe('100%');
    expect(container?.settings._cssGlobalClasses?.map((id) => classNameById.get(id))).toEqual(
      expect.arrayContaining(['container', 'hero-split']),
    );
    expect(
      baseline.globalClasses.some((classItem) => String(classItem.settings?._cssCustom || '').includes('.brx-draggable')),
    ).toBe(false);
  });

  it('reuses compatible project classes and records an explicit rename for incompatible collisions', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pixflow-stage-b-class-collision-'));
    temporaryDirectories.push(directory);
    const htmlFile = join(directory, 'index.html');
    writeFileSync(htmlFile, `<!doctype html><html><head><style>
      .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { padding: 20px; }
      .card__title { color: rgb(240, 80, 40); }
      .card:hover .card__title { mask-image: linear-gradient(black, transparent); }
      .card:hover .text-white\\/58 { mask-image: linear-gradient(white, transparent); }
      [class~="card"][data-state="open"] > .card__title { clip-path: inset(0); }
      [data-theme="dark"] .card { --card-glow: rgb(240, 80, 40); }
      .is-active { opacity: 1; }
    </style></head><body><main class="grid-2"><article class="card" data-state="open">
      <h2 class="card__title"><span class="text-white/58">Card</span></h2>
    </article></main><script>
      document.querySelector('.card')?.classList.add('is-active');
    </script></body></html>`);

    const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const { buildPixflowStageBHtmlBaseline } = await import(${JSON.stringify(bridgeModuleUrl)});
       const baseline = await buildPixflowStageBHtmlBaseline({
         htmlFile: ${JSON.stringify(htmlFile)},
         plan: {
           sourceId: 'class-collision-test',
           title: 'Class collision test',
           existingGlobalClasses: [
             { id: 'existing-grid', name: 'grid-2', settings: {} },
             { id: 'existing-card', name: 'card', settings: { _padding: { top: '40px' } } },
             { id: 'existing-card-title', name: 'card__title', settings: { _typography: { color: { raw: 'blue' } } } },
             { id: 'existing-text-white', name: 'text-white-58', settings: { _typography: { color: { raw: 'white' } } } },
             { id: 'existing-active', name: 'is-active', settings: { _opacity: '0.25' } }
           ],
           routeContract: { variableAuthority: { allowedUtilityClasses: ['grid-2'] } }
         },
       });
       process.stdout.write(JSON.stringify(baseline));`,
    ], { encoding: 'utf8' });
    const baseline = JSON.parse(output);

    expect(baseline.classPlan.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: 'grid-2', status: 'reused-compatible', id: 'existing-grid' }),
      expect.objectContaining({ sourceName: 'card', status: 'renamed-conflict', reason: 'existing-class-manager-name-has-different-settings' }),
    ]));
    expect(baseline.classPlan.preservedUtilityClasses).toContain('grid-2');

    const decisionBySourceName = new Map(
      baseline.classPlan.decisions.map((decision: Record<string, any>) => [decision.sourceName, decision]),
    );
    const renamedCard = decisionBySourceName.get('card')?.finalName;
    const renamedTitle = decisionBySourceName.get('card__title')?.finalName;
    const renamedActive = decisionBySourceName.get('is-active')?.finalName;
    const renamedEscapedUtility = decisionBySourceName.get('text-white/58')?.finalName;
    expect(renamedCard).toBeTruthy();
    expect(renamedTitle).toBeTruthy();
    expect(renamedActive).toBeTruthy();
    expect(renamedEscapedUtility).toBeTruthy();
    expect(renamedCard).not.toBe('card');
    expect(renamedTitle).not.toBe('card__title');
    expect(renamedActive).not.toBe('is-active');
    expect(renamedEscapedUtility).not.toBe('text-white-58');

    const cssConsumers = [
      baseline.pageSettings?.customCss,
      baseline.themeStylePayload?.settings?.css?.stylesheet,
      ...baseline.globalClasses.map((classItem: Record<string, any>) => classItem.settings?._cssCustom),
      ...baseline.content.map((element: Record<string, any>) => element.settings?._cssCustom),
    ].filter(Boolean).join('\n');
    expect(cssConsumers).toContain(`.${renamedTitle}`);
    expect(cssConsumers).toContain(`[class~="${renamedCard}"]`);
    expect(cssConsumers).toContain('.card__title');
    expect(cssConsumers).toContain('.text-white\\/58');
    expect(cssConsumers).toContain(`.${renamedEscapedUtility}`);

    expect(baseline.pageSettings?.customCss).toContain(
      '[data-theme="dark"] :is(.card,.' + renamedCard + ') { --card-glow: rgb(240, 80, 40); }',
    );

    const scriptConsumers = String(baseline.pageSettings?.customScriptsBodyFooter || '');
    expect(scriptConsumers).toContain(`:is(.card,.${renamedCard})`);
    expect(scriptConsumers).toContain(`classList.add('${renamedActive}')`);
    expect(baseline.classLifecycleReport).toMatchObject({
      ok: true,
      orphanReferenceCount: 0,
      rawClassAttributeCount: 0,
      renameDependencies: {
        ok: true,
        unresolvedBindingCount: 0,
        cssSelectorAliasCount: expect.any(Number),
        scriptHookRewriteCount: expect.any(Number),
      },
    });
  });

  it('keeps markup inside raw-text scripts from swallowing the page tree', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pixflow-stage-b-raw-text-'));
    temporaryDirectories.push(directory);
    const htmlFile = join(directory, 'index.html');
    writeFileSync(htmlFile, `<!doctype html><html><head><style>
      .hero { padding: 24px; }
    </style></head><body>
      <script type="application/json">{"markup":"<div><main>not DOM</main></div>"}</script>
      <main><section class="hero"><h1>Visible page content</h1></section></main>
      <script>const template = '<section>still script text</section>';</script>
    </body></html>`);

    const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const { buildPixflowStageBHtmlBaseline } = await import(${JSON.stringify(bridgeModuleUrl)});
       const baseline = await buildPixflowStageBHtmlBaseline({
         htmlFile: ${JSON.stringify(htmlFile)},
         plan: { sourceId: 'raw-text-test', title: 'Raw text test' },
       });
       process.stdout.write(JSON.stringify(baseline));`,
    ], { encoding: 'utf8' });
    const baseline = JSON.parse(output);

    expect(baseline.content.filter((element) => !element.parent)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'section' }),
      ]),
    );
    expect(baseline.content.some((element) => element.settings?.text === 'Visible page content')).toBe(true);
    expect(baseline.content.some((element) => String(element.settings?.html || '').includes('not DOM'))).toBe(false);
    expect(baseline.content.some((element) => String(element.settings?.html || '').includes('still script text'))).toBe(false);
  });

  it('keeps greater-than characters inside quoted attributes within their HTML tag', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pixflow-stage-b-quoted-angle-'));
    temporaryDirectories.push(directory);
    const htmlFile = join(directory, 'index.html');
    writeFileSync(htmlFile, `<!doctype html><html><body><main><section>
      <img alt="Health in ChatGPT > Cover Image" src="assets/cover.png">
      <p>Visible caption</p>
    </section></main></body></html>`);

    const bridgeModuleUrl = new URL('../bricks-handoff-cli.mjs', import.meta.url).href;
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const { buildPixflowStageBHtmlBaseline } = await import(${JSON.stringify(bridgeModuleUrl)});
       const baseline = await buildPixflowStageBHtmlBaseline({
         htmlFile: ${JSON.stringify(htmlFile)},
         plan: { sourceId: 'quoted-angle-test', title: 'Quoted angle test', conversionProfile: 'uploaded_html' },
       });
       process.stdout.write(JSON.stringify(baseline));`,
    ], { encoding: 'utf8' });
    const baseline = JSON.parse(output);

    expect(baseline.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'image', settings: expect.objectContaining({
        altText: 'Health in ChatGPT > Cover Image',
        image: expect.objectContaining({ url: 'assets/cover.png' }),
      }) }),
      expect.objectContaining({ name: 'text-basic', settings: expect.objectContaining({ text: 'Visible caption' }) }),
    ]));
    expect(baseline.content.some((element) => String(element.settings?.text || '').includes('data-nosnippet'))).toBe(false);
  });
});
