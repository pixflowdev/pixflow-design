import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  buildBricksHandoffRepairCliArgs,
  convertHtmlForBricksBaseline,
  hydrateHandoffProjectTextContextFiles,
  materializeFinalVisualEvidenceScreenshots,
  resolveReusableBricksHandoffWorkspace,
} from '../../src/pixflow/bricks-handoff-conversion.js';

const execFileAsync = promisify(execFile);

describe('HTML to Bricks saved-bundle project paths', () => {
  it('accepts the deterministic baseline workspace for the optional cleanup next action', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pixflow-bricks-baseline-'));
    const workspace = join(root, 'bricks-handoff-baseline', 'source-id');
    try {
      await mkdir(workspace, { recursive: true });
      await Promise.all([
        writeFile(join(workspace, 'bricks-result.json'), '{}'),
        writeFile(join(workspace, 'bricks-baseline.json'), '{}'),
        writeFile(join(workspace, 'AGENTS.md'), '# Stage B'),
      ]);
      expect(resolveReusableBricksHandoffWorkspace(workspace)).toBe(resolve(workspace));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('hydrates a nested stylesheet from the legacy flattened project-store path', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'pixflow-flattened-bundle-'));
    try {
      const css = '.hero{display:flex;justify-content:space-between}';
      await writeFile(join(projectRoot, 'Alexium_files_index-CPB4I8id.css'), css, 'utf8');

      const [stylesheet] = await hydrateHandoffProjectTextContextFiles([{
        role: 'context',
        name: 'index-CPB4I8id.css',
        path: 'Alexium_files/index-CPB4I8id.css',
        mime: 'text/css',
        size: Buffer.byteLength(css),
        order: 0,
        projectFile: true,
      }], projectRoot);

      expect(stylesheet).toMatchObject({
        path: 'Alexium_files/index-CPB4I8id.css',
        text: css,
      });
      expect(stylesheet).not.toHaveProperty('readError');

      const exactCss = '.hero{display:grid}';
      await mkdir(join(projectRoot, 'Alexium_files'), { recursive: true });
      await writeFile(join(projectRoot, 'Alexium_files', 'index-CPB4I8id.css'), exactCss, 'utf8');
      const [exactStylesheet] = await hydrateHandoffProjectTextContextFiles([{
        role: 'context',
        name: 'index-CPB4I8id.css',
        path: 'Alexium_files/index-CPB4I8id.css',
        mime: 'text/css',
        size: Buffer.byteLength(exactCss),
        order: 0,
        projectFile: true,
      }], projectRoot);
      expect(exactStylesheet).toMatchObject({ text: exactCss });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

function effectiveClassOwnedSettings(
  element: { settings?: Record<string, unknown> & { _cssGlobalClasses?: string[] } } | undefined,
  classes: Array<{ id: string; settings: Record<string, unknown> }>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const id of element?.settings?._cssGlobalClasses || []) {
    const settings = classes.find((item) => item.id === id)?.settings || {};
    for (const [key, value] of Object.entries(settings)) {
      if (
        value && typeof value === 'object' && !Array.isArray(value)
        && merged[key] && typeof merged[key] === 'object' && !Array.isArray(merged[key])
      ) {
        merged[key] = { ...(merged[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
      } else {
        merged[key] = value;
      }
    }
  }
  return { ...merged, ...(element?.settings || {}) };
}

function expectDefinedCssVariableValue(reference: unknown, css: string, expectedValue: string): void {
  const match = /^var\((--[a-z0-9_-]+)\)$/i.exec(String(reference || ''));
  expect(match, `expected a CSS variable reference, received ${String(reference)}`).toBeTruthy();
  const variableName = match?.[1] || '';
  const escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(`${escapedName}\\s*:\\s*([^;\\n}]+)`, 'i').exec(css);
  expect(declaration, `missing definition for ${variableName}`).toBeTruthy();
  expect(declaration?.[1]?.trim()).toBe(expectedValue);
}

describe('Prototype Bricks baseline layout fidelity', () => {
  it.each([
    {
      block: 'hero',
      layoutClass: 'hero__inner',
      expectedLayout: {
        _display: 'flex',
        _direction: 'column',
        _alignItems: 'center',
        _justifyContent: 'center',
        _rowGap: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
        _width: '100%',
        _widthMax: '1120px',
        '_alignItems:mobile_portrait': 'stretch',
        '_rowGap:mobile_portrait': expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
      },
      title: 'Scoped hero BEM fixture',
      html: [
        '<!doctype html><html><head><style>',
        '.hero{display:flex;padding:72px 24px}.hero__inner{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;width:100%;max-width:1120px;margin:0 auto;text-align:center}',
        '.hero__eyebrow{font-size:14px}.hero__title{font-size:56px}.hero__text{max-width:60ch}.hero__actions{display:flex;gap:12px}.hero__button{display:inline-flex}.hero__button--primary{background:#111;color:#fff}.hero__button--secondary{border:1px solid #111}.hero__media{width:100%;min-height:320px}',
        '@media(max-width:700px){.hero{padding:48px 20px}.hero__inner{align-items:stretch;gap:18px}.hero__actions{flex-direction:column}.hero__media{min-height:220px}}',
        '</style></head><body><main><section class="hero"><div class="hero__inner"><span class="hero__eyebrow">Made for teams</span><h2 class="hero__title">A clear hero</h2><p class="hero__text">Placeholder content that explains the offer.</p><div class="hero__actions"><a class="hero__button hero__button--primary" href="#next">Continue</a><a class="hero__button hero__button--secondary" href="#details">Details</a></div><div class="hero__media" aria-label="Placeholder media"></div></div></section></main></body></html>',
      ].join(''),
    },
    {
      block: 'testimonial',
      layoutClass: 'quote-shell',
      expectedLayout: {
        _display: 'flex',
        _direction: 'row',
        _alignItems: 'center',
        _justifyContent: 'space-between',
        _rowGap: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
        _width: '100%',
        _widthMax: '960px',
        '_direction:mobile_portrait': 'column',
        '_alignItems:mobile_portrait': 'flex-start',
        '_rowGap:mobile_portrait': expect.stringMatching(/^(?:20px|var\(--[a-z0-9_-]+\))$/),
      },
      title: 'Scoped testimonial BEM fixture',
      html: [
        '<!doctype html><html><head><style>',
        '.testimonial{display:flex;padding:64px 24px}.quote-shell{display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:32px;width:100%;max-width:960px;margin:0 auto}.quote-copy{max-width:58ch}.quote-author{font-weight:700}',
        '@media(max-width:760px){.quote-shell{flex-direction:column;align-items:flex-start;gap:20px}}',
        '</style></head><body><main><section class="testimonial"><div class="quote-shell"><blockquote class="quote-copy">Placeholder testimonial copy.</blockquote><p class="quote-author">Customer name</p></div></section></main></body></html>',
      ].join(''),
    },
  ])('preserves the source class namespace with native responsive layout parity for $block', async ({ block, layoutClass, expectedLayout, title, html }) => {
    const dataDir = await mkdtemp(resolve(tmpdir(), `pixflow-scoped-${block}-bem-parity-test-`));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: `stage-a-${block}-fixture`,
        title,
        conversionProfile: 'prototype_bricks',
        generationScope: 'section',
        html,
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const sourceClassNames = [...html.matchAll(/class="([^"]+)"/g)]
        .flatMap((match) => match[1]!.split(/\s+/))
        .filter(Boolean);
      expect(classes.map((item) => item.name)).toEqual(expect.arrayContaining(sourceClassNames));
      if (block === 'hero') {
        expect(classes.map((item) => item.name)).toEqual(expect.arrayContaining([
          'hero__button--primary',
          'hero__button--secondary',
        ]));
        const classById = new Map(classes.map((item) => [item.id, item.name]));
        const elementClassNames = (result.result.content as Array<{ settings: { _cssGlobalClasses?: string[] } }>)
          .map((element) => (element.settings._cssGlobalClasses || []).map((id) => classById.get(id)));
        expect(elementClassNames).toEqual(expect.arrayContaining([
          expect.arrayContaining(['hero__button--primary']),
          expect.arrayContaining(['hero__button--secondary']),
        ]));
      }

      const innerClass = classes.find((item) => item.name === layoutClass);
      expect(innerClass, classes.map((item) => item.name).join(', ')).toBeDefined();
      expect(innerClass?.settings).toMatchObject(expectedLayout);
      const pageCss = String((result.result.page_settings as { customCss?: string }).customCss || '');
      expectDefinedCssVariableValue(innerClass?.settings._rowGap, pageCss, block === 'hero' ? '24px' : '32px');
      expectDefinedCssVariableValue(
        innerClass?.settings['_rowGap:mobile_portrait'],
        pageCss,
        block === 'hero' ? '18px' : '20px',
      );
      const innerElement = (result.result.content as Array<{ settings: { _cssGlobalClasses?: string[] } }>).find(
        (element) => element.settings._cssGlobalClasses?.includes(innerClass?.id || ''),
      );
      expect(innerElement).toBeDefined();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('restores approved scoped layout and BEM identity after a Stage B model drops them', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-stage-b-preview-layout-restore-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'stage-b-preview-layout-restore-fixture',
        title: 'Stage B preview layout restore fixture',
        conversionProfile: 'prototype_bricks',
        generationScope: 'section',
        html: '<!doctype html><html><head><style>.hero{display:flex;padding:64px 24px}.hero__inner{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;width:100%;max-width:1120px;margin:0 auto}@media(max-width:700px){.hero__inner{align-items:stretch;gap:18px}}</style></head><body><main><section class="hero"><div class="hero__inner"><h2>Approved layout</h2><p>The final Bricks structure must retain this preview rhythm.</p></div></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const resultFile = resolve(result.workspaceDir, 'bricks-result.json');
      const baselineFile = resolve(result.workspaceDir, 'bricks-baseline.json');
      const payload = JSON.parse(await readFile(resultFile, 'utf8')) as {
        content: Array<{ id?: string; settings: Record<string, unknown> & { _cssGlobalClasses?: string[] } }>;
        global_classes: Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      };
      const baseline = JSON.parse(await readFile(baselineFile, 'utf8')) as typeof payload;
      const innerClass = payload.global_classes.find((item) => item.name === 'hero__inner');
      expect(innerClass).toBeDefined();
      if (!innerClass) return;
      innerClass.name = 'temporary-layout';
      for (const key of Object.keys(innerClass.settings)) {
        if (/^_(?:display|direction|alignItems|justifyContent|rowGap|width|widthMax)(?::|$)/.test(key)) {
          delete innerClass.settings[key];
        }
      }
      const innerElement = payload.content.find((element) => element.settings._cssGlobalClasses?.includes(innerClass.id));
      await writeFile(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
      if (innerElement) {
        innerElement.settings._cssGlobalClasses = [];
        delete innerElement.settings._direction;
        innerElement.settings._background = { color: '#123456' };
      }
      await writeFile(resultFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

      await execFileAsync(process.execPath, [
        resolve(process.cwd(), '../../tools/pixflow-design-bridge/bricks-handoff-cli.mjs'),
        'repair-stage-b',
        '--workspace',
        result.workspaceDir,
        '--repair-attempts',
        '0',
        '--json',
      ], { cwd: resolve(process.cwd(), '../..') });

      const repaired = JSON.parse(await readFile(resultFile, 'utf8')) as typeof payload & {
        diagnostics?: { sourceLayoutRestoration?: { restoredGlobalClassCount?: number } };
      };
      const repairedInner = repaired.global_classes.find((item) => item.id === innerClass.id);
      expect(repairedInner).toMatchObject({
        name: 'hero__inner',
        settings: {
          _display: 'flex',
          _direction: 'column',
          _alignItems: 'center',
          _justifyContent: 'center',
          _rowGap: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
          _width: '100%',
          _widthMax: '1120px',
          '_alignItems:mobile_portrait': 'stretch',
        },
      });
      const baselineInner = baseline.global_classes.find((item) => item.id === innerClass.id);
      expect(repairedInner?.settings._rowGap).toBe(baselineInner?.settings._rowGap);
      expect(repaired.content.some((element) => element.settings._cssGlobalClasses?.includes(innerClass.id))).toBe(true);
      const repairedInnerElement = repaired.content.find((element) => element.id === innerElement?.id);
      const repairedInnerClasses = (repairedInnerElement?.settings._cssGlobalClasses || [])
        .map((id) => repaired.global_classes.find((item) => item.id === id))
        .filter(Boolean);
      expect(repairedInnerClasses).toEqual(expect.arrayContaining([
        expect.objectContaining({ settings: expect.objectContaining({ _background: { color: '#123456' } }) }),
      ]));
      expect(repaired.diagnostics?.sourceLayoutRestoration?.restoredGlobalClassCount).toBeGreaterThan(0);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('never renames an authoritative existing framework class during the post-Stage-B BEM pass', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-existing-framework-class-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'existing-framework-class-fixture',
        title: 'Existing framework class fixture',
        conversionProfile: 'prototype_bricks',
        generationScope: 'section',
        html: '<!doctype html><html><head><style>.hero{padding:64px}.framework-container{max-width:var(--max-screen-width);margin:0 auto}.feature-card{padding:24px}</style></head><body><main><section class="hero"><div class="framework-container"><article class="feature-card"><h2>Framework ownership</h2></article></div></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const resultFile = resolve(result.workspaceDir, 'bricks-result.json');
      const baselineFile = resolve(result.workspaceDir, 'bricks-baseline.json');
      const conversionPlanFile = resolve(result.workspaceDir, 'stage-b-conversion-plan.json');
      const current = JSON.parse(await readFile(resultFile, 'utf8')) as {
        global_classes: Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      };
      const baseline = JSON.parse(await readFile(baselineFile, 'utf8')) as typeof current;
      const existingClass = current.global_classes.find((item) => item.name.endsWith('framework-container'));
      const generatedCardClass = current.global_classes.find((item) => item.name.endsWith('feature-card'));
      expect(existingClass).toBeDefined();
      expect(generatedCardClass).toBeDefined();
      if (!existingClass || !generatedCardClass) return;
      existingClass.name = 'framework-container';
      const baselineExistingClass = baseline.global_classes.find((item) => item.id === existingClass.id);
      if (baselineExistingClass) baselineExistingClass.name = 'framework-container';
      const conversionPlan = JSON.parse(await readFile(conversionPlanFile, 'utf8')) as {
        existingGlobalClasses?: Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      };
      conversionPlan.existingGlobalClasses = [
        { id: existingClass.id, name: 'framework-container', settings: existingClass.settings },
        { id: 'existing-hero-card', name: 'hero__feature-card', settings: { _padding: '40px' } },
      ];
      current.global_classes.push({ id: 'existing-hero-card', name: 'hero__feature-card', settings: { _padding: '40px' } });
      baseline.global_classes.push({ id: 'existing-hero-card', name: 'hero__feature-card', settings: { _padding: '40px' } });
      await Promise.all([
        writeFile(resultFile, `${JSON.stringify(current, null, 2)}\n`, 'utf8'),
        writeFile(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8'),
        writeFile(conversionPlanFile, `${JSON.stringify(conversionPlan, null, 2)}\n`, 'utf8'),
      ]);

      await execFileAsync(process.execPath, [
        resolve(process.cwd(), '../../tools/pixflow-design-bridge/bricks-handoff-cli.mjs'),
        'repair-stage-b',
        '--workspace',
        result.workspaceDir,
        '--repair-attempts',
        '0',
        '--json',
      ], { cwd: resolve(process.cwd(), '../..') });

      const repaired = JSON.parse(await readFile(resultFile, 'utf8')) as {
        global_classes: Array<{ id: string; name: string }>;
      };
      expect(repaired.global_classes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: existingClass.id, name: 'framework-container' }),
        expect.objectContaining({ id: 'existing-hero-card', name: 'hero__feature-card' }),
      ]));
      expect(repaired.global_classes.find((item) => item.id === existingClass.id)?.name).not.toContain('hero__');
      expect(repaired.global_classes.find((item) => item.id === generatedCardClass.id)?.name).toBe('feature-card');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it.each(['section', 'component'] as const)(
    'preserves %s scope in conversion policy and accepts an H2-only Stage B payload',
    async (generationScope) => {
    const dataDir = await mkdtemp(resolve(tmpdir(), `pixflow-stage-b-${generationScope}-heading-test-`));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: `stage-b-${generationScope}-heading-fixture`,
        title: `Stage B ${generationScope} heading fixture`,
        conversionProfile: 'prototype_bricks',
        generationScope,
        html: '<!doctype html><html><head><style>.notice{padding:64px}.notice__inner{display:flex;flex-direction:column;gap:16px}</style></head><body><main><section class="notice"><div class="notice__inner"><h2>Scoped update</h2><p>This section extends an existing page without replacing its page-level heading.</p><a href="#contact">Continue</a></div></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const conversionPolicy = JSON.parse(
        await readFile(resolve(result.workspaceDir, 'stage-a', 'conversion-policy.json'), 'utf8'),
      ) as { generationScope?: string };
      const qa = JSON.parse(
        await readFile(resolve(result.workspaceDir, 'stage-b-qa.json'), 'utf8'),
      ) as { issues?: Array<{ id?: string }>; summary?: { headingTagCounts?: Record<string, number> } };
      const runnerPrompt = await readFile(resolve(result.workspaceDir, 'codex-stage-b-prompt.txt'), 'utf8');

      expect(conversionPolicy.generationScope).toBe(generationScope);
      expect(qa.issues || []).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'stage_b_page_h1_missing' }),
      ]));
      expect(qa.summary?.headingTagCounts).toMatchObject({ h1: 0, h2: 1 });
      expect(runnerPrompt).toContain(`Scoped ${generationScope} heading contract`);
      expect(runnerPrompt).toContain('preserve the existing page-level H1');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
    },
    60_000,
  );

  it('keeps the Stage B H1 requirement for full-page conversion', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-stage-b-full-page-heading-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'stage-b-full-page-heading-fixture',
        title: 'Stage B full page heading fixture',
        conversionProfile: 'prototype_bricks',
        generationScope: 'full_page',
        html: '<!doctype html><html><head><style>.notice{padding:64px}.notice__inner{display:flex;flex-direction:column;gap:16px}</style></head><body><main><section class="notice"><div class="notice__inner"><h2>Standalone page</h2><p>This complete page intentionally omits its required page-level heading.</p><a href="#contact">Continue</a></div></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const qa = JSON.parse(
        await readFile(resolve(result.workspaceDir, 'stage-b-qa.json'), 'utf8'),
      ) as { issues?: Array<{ id?: string }> };
      expect(qa.issues || []).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'stage_b_page_h1_missing' }),
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('removes colour-system token buckets before authoritative Stage B QA', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-stage-b-token-bucket-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'stage-b-token-bucket-fixture',
        title: 'Stage B token bucket fixture',
        conversionProfile: 'prototype_bricks',
        html: '<!doctype html><html><head><style>:root{--ink:rgb(17 17 17)}.token-band{color:var(--ink)}</style></head><body><main><section class="token-band"><h1>Managed colour</h1></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const resultFile = resolve(result.workspaceDir, 'bricks-result.json');
      const payload = JSON.parse(await readFile(resultFile, 'utf8')) as {
        global_classes: Array<{ settings?: Record<string, unknown> }>;
      };
      const managedVariable = '--pixflow-managed-ink';
      const colorSystemFile = resolve(result.workspaceDir, 'stage-b-color-system.json');
      const colorSystem = JSON.parse(await readFile(colorSystemFile, 'utf8')) as {
        tokenAliases?: Record<string, string>;
        variables?: Array<Record<string, unknown>>;
      };
      colorSystem.tokenAliases = {
        ...(colorSystem.tokenAliases || {}),
        '--ink': managedVariable,
      };
      colorSystem.variables = [
        ...(colorSystem.variables || []),
        {
          sourceCssVariable: '--ink',
          cssVariable: managedVariable,
          external: true,
          create: false,
        },
      ];
      await writeFile(colorSystemFile, `${JSON.stringify(colorSystem, null, 2)}\n`, 'utf8');
      payload.global_classes[0]!.settings = {
        ...(payload.global_classes[0]!.settings || {}),
        _cssCustom: `%root% { ${managedVariable}: rgb(17 17 17); }`,
      };
      await writeFile(resultFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

      await execFileAsync(process.execPath, [
        resolve(process.cwd(), '../../tools/pixflow-design-bridge/bricks-handoff-cli.mjs'),
        'repair-stage-b',
        '--workspace',
        result.workspaceDir,
        '--repair-attempts',
        '0',
        '--json',
      ], {
        cwd: resolve(process.cwd(), '../..'),
      });

      const repaired = JSON.parse(await readFile(resultFile, 'utf8')) as {
        global_classes: Array<{ settings?: Record<string, unknown> }>;
      };
      expect(repaired.global_classes[0]?.settings?._cssCustom).toBeUndefined();
      const qa = JSON.parse(await readFile(resolve(result.workspaceDir, 'stage-b-qa.json'), 'utf8')) as {
        qualityGate?: { passed?: boolean };
        score?: number;
      };
      expect(qa.qualityGate?.passed).toBe(true);
      expect(qa.score).toBe(100);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('repairs the accepted Stage B workspace directly with the selected model settings', () => {
    expect(buildBricksHandoffRepairCliArgs({
      workspaceDir: 'C:\\Temp\\pixflow-bricks-handoff-a\\bricks-handoff-conversion\\project',
      runnerId: 'codex',
      model: 'gpt-5.5',
      reasoning: 'medium',
    })).toEqual([
      'repair-bricks-handoff',
      '--workspace',
      'C:\\Temp\\pixflow-bricks-handoff-a\\bricks-handoff-conversion\\project',
      '--runner',
      'codex',
      '--repair-attempts',
      '1',
      '--json',
      '--model',
      'gpt-5.5',
      '--reasoning',
      'medium',
    ]);
  });

  it('does not move a flattened main wrapper id onto the first Bricks section', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-main-anchor-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-main-anchor-fixture',
        title: 'Baseline main anchor fixture',
        conversionProfile: 'prototype_bricks',
        html: '<!doctype html><html><body><main id="top"><section class="hero"><h1>Anchored page</h1></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const firstRoot = (result.result.content as Array<{
        parent?: string;
        settings: { _attributes?: Array<{ name?: string; value?: string }> };
      }>).find((element) => !element.parent);
      expect(firstRoot?.settings._attributes || []).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'id', value: 'top' }),
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('promotes a source BEM container to the native Bricks container without adding a neutral wrapper', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-bem-container-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-bem-container-fixture',
        title: 'Baseline BEM container fixture',
        conversionProfile: 'prototype_bricks',
        generationScope: 'full_page',
        html: [
          '<!doctype html><html><head><style>',
          ':root{--max-screen-width:1180px}.ns-hero{padding:96px 0}.ns-container{width:min(calc(100% - 40px),var(--max-screen-width,1180px));margin:0 auto}',
          '.ns-hero__inner{display:flex;align-items:center;justify-content:space-between;gap:clamp(44px,7vw,96px)}',
          '@media(max-width:991px){.ns-hero__inner{flex-direction:column;align-items:stretch}}',
          '</style></head><body><main><section class="ns-hero"><div class="ns-container ns-hero__inner"><div><h1>Northstar operations</h1><p>One source width owner should remain one editable Bricks container.</p></div><a class="ns-action" href="#contact">Talk to us</a></div></section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const containerClassId = classes.find((item) => item.name === 'ns-container')?.id;
      expect(classes.find((item) => item.name === 'ns-container')?.settings).toMatchObject({
        _width: 'calc(100% - 40px)',
        _widthMax: '1180px',
      });
      const content = result.result.content as Array<{
        id: string;
        name: string;
        parent?: string;
        children?: string[];
        settings: { _cssGlobalClasses?: string[] };
      }>;
      const section = content.find((item) => item.name === 'section');
      const sourceContainer = content.find((item) => item.settings._cssGlobalClasses?.includes(containerClassId || ''));

      expect(sourceContainer).toMatchObject({ name: 'container', parent: section?.id });
      expect(section?.children).toEqual([sourceContainer?.id]);
      expect(content.filter((item) => item.name === 'container' && item.parent === section?.id)).toHaveLength(1);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps fragment CTA links and interactive control attributes exact in the compiled payload', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-interaction-contract-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-interaction-contract-fixture',
        title: 'Baseline interaction contract fixture',
        conversionProfile: 'prototype_bricks',
        generationScope: 'full_page',
        html: '<!doctype html><html><body><main><section><h1>Operational clarity</h1><a class="cta" href="#contact">Book a call</a><button class="focus-chip" type="button" aria-pressed="false" data-focus="growth">Growth</button><p class="focus-status" aria-live="polite">Growth selected</p></section><section id="contact"><h2>Contact</h2></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{
        name: string;
        settings: Record<string, unknown> & {
          link?: { type?: string; url?: string };
          _attributes?: Array<{ name?: string; value?: string }>;
        };
      }>;
      const cta = content.find((item) => item.settings.link?.url === '#contact');
      const chip = content.find((item) => item.settings._attributes?.some((attribute) => attribute.name === 'data-focus'));
      const status = content.find((item) => item.settings._attributes?.some((attribute) => attribute.name === 'aria-live'));

      expect(cta?.settings.link).toEqual({ type: 'external', url: '#contact' });
      expect(cta?.settings._attributes).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'href' }),
      ]));
      expect(chip).toMatchObject({ name: 'button', settings: { tag: 'button' } });
      expect(chip?.settings._attributes).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'type', value: 'button' }),
        expect.objectContaining({ name: 'aria-pressed', value: 'false' }),
        expect.objectContaining({ name: 'data-focus', value: 'growth' }),
      ]));
      expect(status?.settings._attributes).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'aria-live', value: 'polite' }),
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('repairs a repeated static CTA target deterministically without a model pass', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-repeated-link-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-repeated-link-fixture',
        title: 'Baseline repeated link fixture',
        conversionProfile: 'prototype_bricks',
        generationScope: 'full_page',
        html: '<!doctype html><html><body><main><section><h1>Exact CTA</h1><a class="cta" href="#contact">Contact</a></section><section id="contact"><h2>Contact form</h2></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const resultFile = resolve(result.workspaceDir, 'bricks-result.json');
      const payload = JSON.parse(await readFile(resultFile, 'utf8')) as {
        content: Array<{ settings: { link?: { type?: string; url?: string } } }>;
      };
      const cta = payload.content.find((item) => item.settings.link?.url === '#contact');
      expect(cta).toBeDefined();
      if (!cta?.settings.link) return;
      cta.settings.link.url = '#contact #contact';
      await writeFile(resultFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

      await execFileAsync(process.execPath, [
        resolve(process.cwd(), '../../tools/pixflow-design-bridge/bricks-handoff-cli.mjs'),
        'repair-stage-b',
        '--workspace',
        result.workspaceDir,
        '--repair-attempts',
        '0',
        '--json',
      ], { cwd: resolve(process.cwd(), '../..') });

      const repaired = JSON.parse(await readFile(resultFile, 'utf8')) as typeof payload;
      expect(repaired.content.find((item) => item.settings.link)?.settings.link).toEqual({
        type: 'external',
        url: '#contact',
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('emits Bricks-complete shadow color controls for source card classes', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-shadow-control-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-shadow-control-fixture',
        title: 'Baseline shadow control fixture',
        conversionProfile: 'prototype_bricks',
        generationScope: 'section',
        html: '<section class="contact"><div class="contact__inner"><h2>Focused support</h2></div></section><style>.contact__inner{padding:32px;background:#fff;box-shadow:0 22px 70px rgba(7,26,51,.12)}</style>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const card = (result.result.global_classes as Array<{ name: string; settings: Record<string, unknown> }>)
        .find((item) => item.name === 'contact__inner');
      expect(card?.settings).toMatchObject({
        _boxShadow: {
          values: {
            offsetX: '0',
            offsetY: '22px',
            blur: '70px',
            spread: '0',
            color: 'rgba(7,26,51,.12)',
          },
          color: { raw: 'rgba(7,26,51,.12)' },
        },
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('preserves media nested inside an interactive button as an editable child', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-button-media-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-button-media-fixture',
        title: 'Baseline button media fixture',
        conversionProfile: 'prototype_bricks',
        html: '<!doctype html><html><body><main><section><button class="icon-button" type="button" data-open-form><img src="assets/access.svg" alt=""><span>Open</span></button></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const elements = result.result.content as Array<{
        id: string;
        name: string;
        parent?: string;
        children?: string[];
        settings: Record<string, unknown>;
      }>;
      const button = elements.find((element) => (
        element.settings.tag === 'button'
        && Array.isArray(element.settings._attributes)
        && (element.settings._attributes as Array<{ name?: string }>).some((attribute) => attribute.name === 'data-open-form')
      ));
      const image = elements.find((element) => element.name === 'image' && element.parent === button?.id);

      expect(button).toMatchObject({ name: 'block' });
      expect(button?.children).toContain(image?.id);
      expect(image).toBeDefined();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('does not duplicate an authored glyph CTA as an icon or infer its sibling action', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-button-glyph-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-button-glyph-fixture',
        title: 'Baseline button glyph fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><body><main><section><div class="actions">',
          '<a class="btn" href="/download">Download for Windows<span class="btn-icon">⤳</span></a>',
          '<a class="btn" href="/login">Get started<span class="btn-icon">→</span></a>',
          '</div></section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const button = (result.result.content as Array<{
        name: string;
        settings: Record<string, unknown>;
      }>).find((element) => element.name === 'button' && element.settings.text === 'Get started →');

      expect(button).toBeDefined();
      expect(button?.settings).not.toHaveProperty('icon');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('uses the installed Bricks video control names without duplicating media fit settings', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-video-controls-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-video-controls-fixture',
        title: 'Baseline video controls fixture',
        conversionProfile: 'prototype_bricks',
        html: '<!doctype html><html><body><main><section><video class="hero-video" src="assets/hero.mp4" autoplay loop muted playsinline style="object-fit:cover"></video></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const video = (result.result.content as Array<{
        name: string;
        settings: Record<string, unknown>;
      }>).find((element) => element.name === 'video');

      expect(video?.settings).toMatchObject({
        fileAutoplay: true,
        fileLoop: true,
        fileMuted: true,
        fileInline: true,
      });
      expect(video?.settings).not.toHaveProperty('fileMute');
      expect(video?.settings).not.toHaveProperty('objectFit');
      const videoClassIds = Array.isArray(video?.settings._cssGlobalClasses)
        ? video.settings._cssGlobalClasses as string[]
        : [];
      const globalClasses = result.result.global_classes as Array<{
        id: string;
        settings: Record<string, unknown>;
      }>;
      expect(globalClasses.some((globalClass) => (
        videoClassIds.includes(globalClass.id) && globalClass.settings._objectFit === 'cover'
      ))).toBe(true);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('allows exact native display and padding on semantic header and footer section roots', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-template-section-style-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-template-section-style-fixture',
        title: 'Baseline template section style fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '.site-header{display:block;padding:0}.site-header__inner{display:flex;align-items:center;justify-content:space-between}.site-footer{display:block;padding:48px 0}',
          '</style></head><body>',
          '<header class="site-header"><div class="site-header__inner"><a href="#top">Brand</a><nav>Header navigation</nav></div></header>',
          '<main><section><h1>Page content</h1></section></main>',
          '<footer class="site-footer"><p>Footer content</p></footer>',
          '</body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const headerRoot = (result.result.stage_b_header as { content?: Array<{ name: string; settings: Record<string, unknown> }> })
        ?.content?.find((element) => element.name === 'section');
      const footerRoot = (result.result.stage_b_footer as { content?: Array<{ name: string; settings: Record<string, unknown> }> })
        ?.content?.find((element) => element.name === 'section');
      expect(effectiveClassOwnedSettings(headerRoot, classes)).toMatchObject({
        _display: 'block',
        _padding: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      expect(effectiveClassOwnedSettings(footerRoot, classes)).toMatchObject({
        _display: 'block',
        _padding: { top: '48px', right: '0', bottom: '48px', left: '0' },
      });
      const headerInnerClass = classes.find((item) => item.name === 'site-header__inner');
      const headerInner = (result.result.stage_b_header as { content?: Array<{ settings: Record<string, unknown> }> })
        ?.content?.find((element) => (element.settings._cssGlobalClasses as string[] | undefined)
          ?.includes(headerInnerClass?.id || ''));
      expect(effectiveClassOwnedSettings(headerInner, classes)).toMatchObject({
        '_direction:mobile_portrait': 'row',
        '_flexWrap:mobile_portrait': 'nowrap',
      });
      const qa = result.artifacts.json.qa as { issues?: Array<{ id?: string; message?: string }> };
      expect(qa.issues || []).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'stage_b_header_stage_b_element_direct_style_disallowed' }),
        expect.objectContaining({ id: 'stage_b_header_inner_responsive_direction_missing' }),
        expect.objectContaining({ id: 'stage_b_footer_stage_b_element_direct_style_disallowed' }),
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps uploaded HTML landmarks in their original page-content order', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-uploaded-document-order-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-uploaded-document-order-fixture',
        title: 'Uploaded document order fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '.site-nav,.hero,.body-section,.site-footer{display:block}',
          '</style></head><body><main>',
          '<div class="site-nav">Navigation</div>',
          '<header class="hero"><h1>Hero</h1></header>',
          '<section class="body-section"><p>Body</p></section>',
          '<footer class="site-footer"><p>Footer</p></footer>',
          '</main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect((result.result.diagnostics as { htmlBaseline?: Record<string, unknown> }).htmlBaseline).toMatchObject({
        conversionProfile: 'uploaded_html',
        sourceFidelityClone: true,
      });
      const content = result.result.baseline_preview_content as Array<{
        id: string;
        parent?: string;
        settings?: { tag?: string; _cssGlobalClasses?: string[] };
      }>;
      const classes = result.result.global_classes as Array<{ id: string; name: string }>;
      const classNamesById = new Map(classes.map((item) => [item.id, item.name]));
      const documentLabels = content
        .map((element) => {
          const sourceClass = (element.settings?._cssGlobalClasses || [])
            .map((id) => classNamesById.get(id))
            .find((name) => ['site-nav', 'hero', 'body-section', 'site-footer'].includes(name || ''));
          return sourceClass || element.settings?.tag || '';
        })
        .filter((label) => ['site-nav', 'hero', 'body-section', 'site-footer'].includes(label));

      expect(documentLabels).toEqual(['site-nav', 'hero', 'body-section', 'site-footer']);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('preserves valid class CSS when a sibling rule contains an unresolved variable', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-partial-custom-css-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-partial-custom-css-fixture',
        title: 'Partial custom CSS fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '.grid{display:grid;grid-template-columns:repeat(12,1fr)}',
          '.u-column-5{grid-column:auto/span 5}',
          '.tabs-menu.u-column-5{padding:var(--missing-space);flex-flow:column}',
          '</style></head><body><main><div class="grid">',
          '<div class="u-column-5">Five columns</div>',
          '</div></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const columnClass = (result.result.global_classes as Array<{
        name: string;
        settings: { _cssCustom?: string; _gridColumn?: string };
      }>).find((item) => item.name === 'u-column-5');

      expect(columnClass?.settings._gridColumn).toBe('auto/span 5');
      expect(columnClass?.settings._cssCustom).toContain('flex-flow: column');
      expect(columnClass?.settings._cssCustom).not.toContain('--missing-space');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('preserves authored whitespace inside inline animation spans', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-inline-space-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-inline-space-fixture',
        title: 'Inline space fixture',
        conversionProfile: 'uploaded_html',
        html: '<!doctype html><html><body><main><h1><span class="animate-word">Hello</span><span class="animate-space"> </span><span class="animate-word">world</span></h1></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const heading = (result.result.baseline_preview_content as Array<{
        name: string;
        settings?: { text?: string };
      }>).find((element) => element.name === 'heading');
      expect(heading?.settings?.text).toContain('<span class="animate-space"> </span>');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('materializes flex display when a responsive modifier owns flex-container controls', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-responsive-flex-modifier-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-responsive-flex-modifier-fixture',
        title: 'Baseline responsive flex modifier fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          '.project{display:flex}.project--compact{flex:1 1 55%}',
          '@media (max-width:991px){.project--compact{flex-direction:column;align-items:stretch}}',
          '</style></head><body><main><section><article class="project project--compact"><h2>Compact project</h2></article></section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const compact = classes.find((item) => item.name === 'project--compact');
      expect(compact?.settings).toMatchObject({
        _display: 'flex',
        '_display:tablet_portrait': 'flex',
        '_direction:tablet_portrait': 'column',
      });
      const qa = result.artifacts.json.qa as { issues?: Array<{ id?: string }> };
      expect(qa.issues || []).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'stage_b_flex_controls_without_display' }),
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('does not flatten responsive visibility rules into the desktop base class', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-responsive-visibility-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-responsive-visibility-fixture',
        title: 'Baseline responsive visibility fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '.desktop-nav{display:flex}.mobile-nav{display:none}',
          '@media (max-width:991px){.desktop-nav{display:none}.mobile-nav{display:flex}}',
          '</style></head><body><main><nav class="desktop-nav">Desktop</nav><nav class="mobile-nav">Mobile</nav></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      expect(classes.find((item) => item.name === 'desktop-nav')?.settings).toMatchObject({
        _display: 'flex',
        '_display:tablet_portrait': 'none',
      });
      expect(classes.find((item) => item.name === 'mobile-nav')?.settings).toMatchObject({
        _display: 'none',
        '_display:tablet_portrait': 'flex',
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('preserves structural list layout, flex-item sizing, and contextual type inheritance', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-contextual-descendant-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-contextual-descendant-fixture',
        title: 'Baseline contextual descendant fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          'body{font-size:16px;color:#171713}.process{color:#fff;background:#171713}',
          '.process__steps li{display:flex;align-items:flex-start;gap:52px;padding:34px 0;border-bottom:1px solid rgba(255,255,255,.18)}',
          '.process__steps h3{flex:0 0 28%}.process__steps p{flex:1 1 auto}',
          '.footer-nav{display:flex;color:#777;font-size:14px}',
          '</style></head><body><main>',
          '<section class="process"><ol class="process__steps"><li><h3>Observe</h3><p>Read the room.</p></li></ol></section>',
          '<nav class="footer-nav"><a href="#top">Top</a></nav>',
          '</main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const classById = new Map(classes.map((item) => [item.id, item]));
      const content = result.result.content as Array<{
        name: string;
        settings: { text?: string; tag?: string; _cssGlobalClasses?: string[] };
      }>;
      const classNamesFor = (text: string) => (content.find((element) => element.settings.text === text)
        ?.settings._cssGlobalClasses || []).map((id) => classById.get(id)?.name);

      const listItem = content.find((element) => element.settings.tag === 'li');
      const listItemClasses = (listItem?.settings._cssGlobalClasses || []).map((id) => classById.get(id));
      const sourceListItemClass = listItemClasses.find((item) => item?.name.includes('process-steps-li-style'));
      expect(listItemClasses).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringContaining('process-steps-li-style'),
          settings: expect.objectContaining({
            _display: 'flex',
            _alignItems: 'flex-start',
            _columnGap: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
            _rowGap: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
            _padding: {
              top: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
              right: '0',
              bottom: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
              left: '0',
            },
            _border: expect.objectContaining({ style: 'solid' }),
          }),
        }),
      ]));
      const pageCss = String((result.result.page_settings as { customCss?: string }).customCss || '');
      expectDefinedCssVariableValue(sourceListItemClass?.settings._rowGap, pageCss, '52px');
      expectDefinedCssVariableValue(
        (sourceListItemClass?.settings._padding as { top?: unknown } | undefined)?.top,
        pageCss,
        '34px',
      );
      expect(classNamesFor('Observe')).toEqual(expect.arrayContaining([
        expect.stringContaining('process-steps-h3-style'),
      ]));
      expect(classes.find((item) => classNamesFor('Observe').includes(item.name) && item.name.includes('process-steps-h3-style'))?.settings)
        .toMatchObject({ _flexBasis: '28%', _flexGrow: '0', _flexShrink: '0' });
      expect(classes.find((item) => classNamesFor('Read the room.').includes(item.name) && item.name.includes('process-steps-p-style'))?.settings)
        .toMatchObject({ _flexGrow: '1', _flexShrink: '1', _flexBasis: 'auto' });
      expect(classNamesFor('Top')).not.toEqual(expect.arrayContaining([
        expect.stringContaining('body-type'),
      ]));
      expect((listItem?.settings._cssGlobalClasses || []).map((id) => classById.get(id)?.name)).not.toEqual(expect.arrayContaining([
        expect.stringContaining('body-type'),
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('materializes adjacent sibling rules onto only the matching Bricks sections', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-adjacent-section-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-adjacent-section-fixture',
        title: 'Baseline adjacent section fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          '.section + .section{border-top:1px solid #ddd}.section--dark + .section{border-top:0}',
          '</style></head><body><main>',
          '<section class="section"><h1>First</h1></section>',
          '<section class="section section--dark"><h2>Second</h2></section>',
          '<section class="section"><h2>Third</h2></section>',
          '</main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      expect(classes.filter((item) => item.settings._cssCustom && !/^pixflow-measured-/.test(item.name))).toEqual([]);
      const afterSection = classes.find((item) => item.name === 'pixflow-source-section-after-section-style');
      const afterDark = classes.find((item) => item.name === 'pixflow-source-section-after-section-dark-style');
      expect(afterSection?.settings).toMatchObject({
        _border: { width: { top: '1' }, style: 'solid', color: { raw: '#ddd' } },
      });
      expect(afterDark?.settings).toMatchObject({ _border: { width: { top: '0' } } });
      const sections = (result.result.content as Array<{ name: string; settings: { _cssGlobalClasses?: string[] } }>)
        .filter((element) => element.name === 'section');
      expect(sections[0]?.settings._cssGlobalClasses).not.toContain(afterSection?.id);
      expect(sections[1]?.settings._cssGlobalClasses).toContain(afterSection?.id);
      expect(sections[2]?.settings._cssGlobalClasses).toEqual(expect.arrayContaining([
        afterSection?.id,
        afterDark?.id,
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('copies rejected Stage B screenshots into the focused visual-repair workspace', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'pixflow-visual-repair-evidence-test-'));
    try {
      const projectRoot = resolve(root, 'project');
      const stageAWorkspace = resolve(root, 'stage-a');
      await mkdir(resolve(projectRoot, 'stage-b/screenshots'), { recursive: true });
      await writeFile(resolve(projectRoot, 'stage-b/screenshots/frontend-mobile.png'), Buffer.from('mobile-pixels'));
      const evidence = await materializeFinalVisualEvidenceScreenshots(stageAWorkspace, projectRoot, {
        finalScreenshots: ['stage-b/screenshots/frontend-mobile.png'],
        captures: [{ viewport: 'mobile', path: 'stage-b/screenshots/frontend-mobile.png' }],
      });

      expect(evidence).toMatchObject({
        finalScreenshots: ['stage-a/screenshots/rejected-stage-b-frontend-mobile.png'],
        captures: [{ viewport: 'mobile', path: 'stage-a/screenshots/rejected-stage-b-frontend-mobile.png' }],
      });
      await expect(readFile(resolve(stageAWorkspace, 'screenshots/rejected-stage-b-frontend-mobile.png'), 'utf8'))
        .resolves.toBe('mobile-pixels');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('materializes static relationship, state, and structural selectors as native Bricks classes', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-selector-materialization-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-selector-materialization-fixture',
        title: 'Baseline selector materialization fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          '.nav{display:flex}.nav a{border-bottom:1px solid transparent;color:#555}.nav a:hover{border-bottom-color:currentColor;color:#111}',
          '.copy p:not(.meta){max-width:44ch;color:#333}.item{padding-top:24px;border-top:1px solid #ddd}.item:first-child{padding-top:0;border-top:0}.item:first-of-type{margin-top:0}',
          '.process-step{display:flex}.process-step span{flex:0 0 44px}',
          '.project:hover .project__media img{transform:scale(1.02)}.project--compact .project__media img{min-height:420px}',
          '.work{padding-block:64px;border-top:1px solid #ddd}',
          '@media (max-width:980px){.item:nth-child(2){padding-right:0}.item:nth-of-type(3){border-top:2px solid #aaa}}',
          '@media (max-width:680px){.nav{width:100%;justify-content:space-between}}',
          '</style></head><body><main><section><h1>Native selector mapping</h1>',
          '<nav class="nav"><a href="#one">One</a></nav>',
          '<div class="copy"><p class="meta">Meta</p><p>Body copy</p></div>',
          '<div><article class="item">First</article><article class="item">Second</article><article class="item">Third</article></div>',
          '<article class="process-step"><span>01</span><p>Discovery</p></article>',
          '<article class="project project--compact"><figure class="project__media"><img src="project.jpg" alt="Project"></figure></article>',
          '<section class="work"><h2>Selected work</h2></section>',
          '</section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const sourceCustomCssClasses = classes.filter((item) => (
        item.settings._cssCustom && !/^pixflow-measured-/.test(item.name)
      ));
      expect(sourceCustomCssClasses.map((item) => item.name)).toEqual(['item']);
      expect(String(sourceCustomCssClasses[0]?.settings._cssCustom || '')).toContain(
        '@media (max-width:980px) { %root%:nth-child(2) { padding-right: 0; } }',
      );
      expect(String(sourceCustomCssClasses[0]?.settings._cssCustom || '')).toContain(
        '@media (max-width:980px) { %root%:nth-of-type(3) { border-top: 2px solid #aaa; } }',
      );
      expect(classes.find((item) => item.name === 'nav')?.settings).toMatchObject({
        _display: 'flex',
        _direction: 'row',
        _flexWrap: 'nowrap',
        _justifyContent: 'flex-start',
        _alignItems: 'stretch',
        _width: 'auto',
        '_width:mobile_portrait': '100%',
        '_justifyContent:mobile_portrait': 'space-between',
      });
      expect(classes.find((item) => item.name === 'pixflow-source-nav-a-hover-style')?.settings).toMatchObject({
        '_typography:hover': { color: { raw: '#111' } },
        '_border:hover': { color: { raw: 'currentColor' } },
      });
      expect(classes.find((item) => item.name === 'pixflow-source-copy-p-except-meta-style')?.settings).toMatchObject({
        _widthMax: '44ch',
        _typography: { color: { raw: '#333' } },
      });
      expect(classes.find((item) => item.name === 'pixflow-source-item-first-child-style')?.settings).toMatchObject({
        _padding: { top: '0' },
        _border: { width: { top: '0' } },
      });
      expect(classes.find((item) => item.name === 'pixflow-source-item-first-of-type-style')?.settings).toMatchObject({
        _margin: { top: '0' },
      });
      expect(classes.find((item) => item.name === 'pixflow-source-item-nth-child-2-style')?.settings).toMatchObject({
        '_padding:tablet_portrait': { right: '0' },
      });
      expect(classes.find((item) => item.name === 'pixflow-source-item-nth-of-type-3-style')?.settings).toMatchObject({
        '_border:tablet_portrait': { width: { top: '2' }, style: 'solid', color: { raw: '#aaa' } },
      });
      const itemElements = (result.result.content as Array<{ settings: { _cssGlobalClasses?: string[] } }>).filter((element) => (
        element.settings._cssGlobalClasses?.includes(classes.find((item) => item.name === 'item')?.id || '')
      ));
      expect(itemElements[1]?.settings._cssGlobalClasses).toContain(
        classes.find((item) => item.name === 'pixflow-source-item-nth-child-2-style')?.id,
      );
      expect(itemElements[2]?.settings._cssGlobalClasses).toContain(
        classes.find((item) => item.name === 'pixflow-source-item-nth-of-type-3-style')?.id,
      );
      expect(classes.find((item) => item.name === 'pixflow-source-project-media-img-hover-style')?.settings).toMatchObject({
        '_transform:hover': { scaleX: '1.02', scaleY: '1.02' },
      });
      expect(classes.find((item) => item.name === 'pixflow-source-project-compact-project-media-img-style')?.settings).toMatchObject({
        _heightMin: '420px',
      });
      expect(classes.find((item) => item.name === 'pixflow-source-process-step-span-style')?.settings).toMatchObject({
        _flexGrow: '0',
        _flexShrink: '0',
        _flexBasis: '44px',
      });
      const workClass = classes.find((item) => item.name === 'work');
      expect(workClass?.settings).toMatchObject({
        _padding: {
          top: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
          bottom: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
        },
        _border: { width: { top: '1' }, style: 'solid' },
      });
      const pageCss = String((result.result.page_settings as { customCss?: string }).customCss || '');
      expectDefinedCssVariableValue(
        (workClass?.settings._padding as { top?: unknown } | undefined)?.top,
        pageCss,
        '64px',
      );
      const workSection = (result.result.content as Array<{
        name: string;
        settings: {
          _cssGlobalClasses?: string[];
          _display?: string;
          _padding?: Record<string, string>;
        };
      }>)
        .find((item) => item.name === 'section' && item.settings._cssGlobalClasses?.includes(workClass?.id || ''));
      expect(classes.map((item) => item.name)).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/^stage-a-/),
      ]));
      expect(effectiveClassOwnedSettings(workSection, classes)).toMatchObject({
        _display: 'block',
        _padding: expect.objectContaining({ top: '64px', bottom: '64px' }),
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('uses an existing source site shell as the native Bricks container without doubling its gutter', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-site-shell-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-site-shell-fixture',
        title: 'Baseline site shell fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          '.site-shell{width:100%;max-width:70rem;margin-inline:auto;padding-inline:20px}',
          '</style></head><body>',
          '<main><section id="hero"><div class="site-shell"><h1>Exact mobile gutter</h1></div></section></main>',
          '</body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const elements = result.result.content as Array<{
        id: string;
        name: string;
        children?: string[];
        settings: { _cssGlobalClasses?: string[] };
      }>;
      const classes = result.result.global_classes as Array<{
        id: string;
        name: string;
        settings: Record<string, unknown>;
      }>;
      const section = elements.find((element) => element.name === 'section');
      const shell = elements.find((element) => element.id === section?.children?.[0]);
      expect(shell?.name).toBe('container');
      expect(elements.find((element) => element.id === shell?.children?.[0])?.name).toBe('heading');
      const shellClass = classes.find((item) => (
        shell?.settings._cssGlobalClasses?.includes(item.id)
        && item.name === 'site-shell'
      ));
      expect(shellClass?.settings).toMatchObject({
        _width: '100%',
        _widthMax: '1120px',
        _padding: {
          right: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
          left: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
        },
      });
      const pageCss = String((result.result.page_settings as { customCss?: string }).customCss || '');
      expectDefinedCssVariableValue(
        (shellClass?.settings._padding as { left?: unknown } | undefined)?.left,
        pageCss,
        '20px',
      );
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('reserves _cssCustom for declarations without a faithful Bricks control', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-native-control-boundary-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-native-control-boundary-fixture',
        title: 'Baseline native control boundary fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          '.pf-native-controls{display:flex;flex-grow:1;flex-shrink:0;flex-basis:20rem;align-self:center;order:2;visibility:hidden;isolation:isolate;mix-blend-mode:multiply;pointer-events:none;perspective:800px;perspective-origin:50% 25%;transform:translate(4px,6px) rotate(3deg) scale(.9);transform-origin:center top;filter:blur(4px) brightness(.8);background-repeat:no-repeat;background-position:20% 30%;background-size:40px 50px;background-attachment:fixed;background-blend-mode:multiply;white-space:nowrap;text-wrap:balance;font-variation-settings:"wght" 650;text-shadow:1px 2px 3px rgba(0,0,0,.2);box-shadow:inset 0 8px 20px 2px rgba(0,0,0,.25)}',
          '.pf-css-required{backdrop-filter:blur(8px);filter:drop-shadow(0 8px 20px rgba(0,0,0,.2));background-size:cover,contain}',
          '</style></head><body>',
          '<main><section><div class="pf-native-controls">Native</div><div class="pf-css-required">Fallback</div></section></main>',
          '</body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const nativeClass = classes.find((item) => item.name === 'pf-native-controls');
      expect(nativeClass?.settings).toMatchObject({
        _flexGrow: '1',
        _flexShrink: '0',
        _flexBasis: '320px',
        _alignSelf: 'center',
        _order: '2',
        _visibility: 'hidden',
        _isolation: 'isolate',
        _mixBlendMode: 'multiply',
        _pointerEvents: 'none',
        _perspective: '800px',
        _perspectiveOrigin: '50% 25%',
        _transform: { translateX: '4px', translateY: '6px', rotateZ: '3', scaleX: '.9', scaleY: '.9' },
        _transformOrigin: 'center top',
        _cssFilters: { blur: '4', brightness: '80' },
        _typography: {
          'white-space': 'nowrap',
          'text-wrap': 'balance',
          'font-variation-settings': '"wght" 650',
          'text-shadow': {
            values: { offsetX: '1px', offsetY: '2px', blur: '3px' },
            color: { raw: expect.stringMatching(/^var\(--pf-source-color-[a-z0-9]+\)$/) },
          },
        },
        _boxShadow: {
          inset: true,
          values: { offsetX: '0', offsetY: '8px', blur: '20px', spread: '2px' },
          color: { raw: 'rgba(0,0,0,.25)' },
        },
        _background: {
          repeat: 'no-repeat',
          position: 'custom',
          positionX: '20%',
          positionY: '30%',
          size: 'custom',
          custom: '40px 50px',
          attachment: 'fixed',
          blendMode: 'multiply',
        },
      });
      expect(nativeClass?.settings).not.toHaveProperty('_cssCustom');
      const pageCss = String((result.result.page_settings as { customCss?: string }).customCss || '');
      const textShadow = ((nativeClass?.settings._typography as Record<string, unknown> | undefined)?.['text-shadow']) as {
        color?: { raw?: unknown };
      } | undefined;
      const boxShadow = nativeClass?.settings._boxShadow as { color?: { raw?: unknown } } | undefined;
      expectDefinedCssVariableValue(textShadow?.color?.raw, pageCss, 'rgba(0,0,0,.2)');
      expect(boxShadow?.color?.raw).toBe('rgba(0,0,0,.25)');
      expect(nativeClass?.settings).not.toHaveProperty('_filter');
      expect(nativeClass?.settings).not.toHaveProperty('_backdropFilter');

      const fallbackClass = classes.find((item) => item.name === 'pf-css-required');
      expect(String(fallbackClass?.settings._cssCustom || '')).toMatch(/backdrop-filter:\s*blur\(8px\)/i);
      expect(String(fallbackClass?.settings._cssCustom || '')).toMatch(/filter:\s*drop-shadow/i);
      expect(String(fallbackClass?.settings._cssCustom || '')).toMatch(/background-size:\s*cover,contain/i);
      expect(fallbackClass?.settings).not.toHaveProperty('_cssFilters');
      expect(fallbackClass?.settings).not.toHaveProperty('_backdropFilter');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('uses native Bricks controls for link decoration, transitions, transforms, and a simple gradient layer', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-native-style-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-native-style-fixture',
        title: 'Baseline native style fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          ':root{--paper:#f4f0e8}.hero{background:radial-gradient(circle at 80% 20%,rgba(255,93,54,.24),transparent 34%),var(--paper)}',
          '.button{display:inline-flex;border:1px solid #17171b;border-radius:999px;text-decoration:none;transition:transform .2s ease}.button:hover{transform:translateY(-2px)}.button--primary{background:#17171b;color:#fff}',
          '.complex-effect{background:linear-gradient(90deg,#111,#333),radial-gradient(circle,#fff,transparent);transform:matrix(1,0,0,1,8,0)}',
          '</style></head><body>',
          '<main><section class="hero"><a class="button button--primary" href="#work">Explore</a><div class="complex-effect">Effect</div></section></main>',
          '</body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const buttonClass = classes.find((item) => item.name === 'button');
      expect(buttonClass?.settings).toMatchObject({
        _typography: expect.objectContaining({ 'text-decoration': 'none' }),
        _cssTransition: 'transform .2s ease',
        '_transform:hover': { translateY: '-2px' },
      });
      expect(buttonClass?.settings).not.toHaveProperty('_transition');
      expect(String(buttonClass?.settings._cssCustom || '')).not.toMatch(/text-decoration|transition|transform/i);
      expect(buttonClass?.settings).not.toHaveProperty('_cssCustom');
      const primaryClass = classes.find((item) => item.name === 'button--primary');
      expect(primaryClass?.settings).toMatchObject({
        _background: { color: { raw: expect.stringMatching(/^var\(--pf-source-color-[a-z0-9]+\)$/) } },
        _typography: { color: { raw: expect.stringMatching(/^var\(--pf-source-color-[a-z0-9]+\)$/) } },
      });
      const pageCss = String((result.result.page_settings as { customCss?: string }).customCss || '');
      expectDefinedCssVariableValue(
        ((primaryClass?.settings._background as { color?: { raw?: unknown } } | undefined)?.color?.raw),
        pageCss,
        '#17171b',
      );
      expectDefinedCssVariableValue(
        ((primaryClass?.settings._typography as { color?: { raw?: unknown } } | undefined)?.color?.raw),
        pageCss,
        '#fff',
      );
      expect(primaryClass?.settings).not.toHaveProperty('_cssCustom');
      const buttonElement = (result.result.content as Array<{ name: string; settings: Record<string, unknown> }>)
        .find((item) => item.name === 'button');
      expect(buttonElement?.settings).not.toHaveProperty('style');
      const buttonClassIds = (buttonElement?.settings._cssGlobalClasses || []) as string[];
      expect(buttonClassIds.indexOf(buttonClass?.id || '')).toBeLessThan(
        buttonClassIds.indexOf(primaryClass?.id || ''),
      );
      const qa = result.artifacts.json.qa as { issues?: Array<{ id?: string }> };
      expect(qa.issues || []).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'stage_b_button_native_style_missing' }),
      ]));

      const heroClass = classes.find((item) => item.name === 'hero');
      expect(heroClass?.settings).toMatchObject({
        _background: { color: { raw: 'var(--paper)' } },
        _gradient: {
          gradientType: 'radial',
          radialShape: 'circle',
          radialPosition: 'custom',
          radialCustomPosition: '80% 20%',
          colors: [
            { color: { raw: 'rgba(255,93,54,.24)' } },
            { color: { raw: 'transparent' }, stop: '34' },
          ],
        },
      });
      expect(String(heroClass?.settings._cssCustom || '')).not.toMatch(/radial-gradient/i);

      const complexClass = classes.find((item) => item.name === 'complex-effect');
      expect(String(complexClass?.settings._cssCustom || '')).toMatch(/linear-gradient/i);
      expect(String(complexClass?.settings._cssCustom || '')).toMatch(/radial-gradient/i);
      expect(String(complexClass?.settings._cssCustom || '')).not.toMatch(/matrix\(/i);
      expect(complexClass?.settings).not.toHaveProperty('_gradient');
      expect(complexClass?.settings._transform).toMatchObject({
        scaleX: '1',
        scaleY: '1',
        translateX: '8',
        translateY: '0',
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps function-valued responsive flex shorthand and descendant font shorthand native', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-flex-font-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-flex-font-fixture',
        title: 'Baseline flex and font fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          '.cards{display:flex;gap:16px}.card{display:flex;flex:1 1 0%}.card .card__title{font:600 1.25rem/1.4 "Segoe UI",sans-serif;letter-spacing:-.02em}',
          '@media (max-width:991px){.card{flex:1 1 calc(50% - .5rem)}}',
          '</style></head><body>',
          '<main><section><div class="cards"><article class="card"><h2 class="card__title">First card</h2></article><article class="card"><h2 class="card__title">Second card</h2></article></div></section></main>',
          '</body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const cardClass = classes.find((item) => item.name === 'card');
      expect(cardClass?.settings).toMatchObject({
        _flexGrow: '1',
        _flexShrink: '1',
        _flexBasis: '0%',
        '_flexGrow:tablet_portrait': '1',
        '_flexShrink:tablet_portrait': '1',
        '_flexBasis:tablet_portrait': 'calc(50% - 8px)',
      });

      const relationshipClass = classes.find((item) => item.name.includes('card-card-title-style'));
      expect(relationshipClass?.settings).toMatchObject({
        _typography: expect.objectContaining({
          'font-family': 'Segoe UI',
          'font-size': '20px',
          'font-weight': '600',
          'line-height': '1.4',
          'letter-spacing': '-.02em',
        }),
      });
      expect(relationshipClass?.settings).not.toHaveProperty('_cssCustom');
      expect(String(cardClass?.settings._cssCustom || '')).not.toMatch(/card__title/);
      expect(String(classes.find((item) => item.name === 'card__title')?.settings._cssCustom || '')).not.toMatch(/\.card\s+%root%/);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('resets Bricks section inline padding and preserves the declared display-font stack', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-section-font-parity-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-section-font-parity-fixture',
        title: 'Baseline section and font parity fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          'h2{font-family:"Cormorant Garamond","Iowan Old Style",Charter,Georgia,"Times New Roman",serif}',
          '.feature{padding-block:72px}',
          '</style></head><body><main><section class="feature"><h2>Metric-safe heading</h2></section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const featureClass = classes.find((item) => item.name === 'feature');
      expect(featureClass?.settings).toMatchObject({
        _padding: { top: expect.any(String), bottom: expect.any(String) },
      });
      const featureSection = (result.result.content as Array<{
        name?: string;
        settings?: Record<string, unknown> & { _cssGlobalClasses?: string[] };
      }>).find((item) => item.name === 'section' && item.settings?._cssGlobalClasses?.includes(featureClass?.id || ''));
      expect(effectiveClassOwnedSettings(featureSection, classes)).toMatchObject({ _display: 'block' });
      const foundationCss = String((result.result.stage_b_theme_style_payload as {
        settings?: { css?: { stylesheet?: string } };
      }).settings?.css?.stylesheet || '');
      expect(foundationCss).toMatch(/h2[^{}]*\{[^}]*font-family:\s*"Cormorant Garamond",\s*"Iowan Old Style",\s*Charter,\s*Georgia,\s*"Times New Roman",\s*serif/i);
      expect(classes.map((item) => item.name)).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/^stage-a-/),
      ]));
      expect((result.result.stage_b_font_system as { fonts?: Array<{ family?: string }> }).fonts).toEqual(
        expect.arrayContaining([expect.objectContaining({ family: 'Cormorant Garamond' })]),
      );
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('preserves an authored web-font identity for the font installation sidecar', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-uploaded-font-fallback-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-uploaded-font-fallback-fixture',
        title: 'Uploaded font fallback fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          'html{font-family:"figmaSans","figmaSans Fallback","SF Pro Display",system-ui,helvetica,sans-serif}',
          '</style></head><body><main><footer><a class="footer-link">Products</a></footer></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const foundationCss = String((result.result.stage_b_theme_style_payload as {
        settings?: { css?: { stylesheet?: string } };
      }).settings?.css?.stylesheet || '');
      expect(foundationCss).toMatch(/font-family:\s*figmaSans,\s*"figmaSans Fallback",\s*"SF Pro Display",\s*system-ui,\s*helvetica,\s*sans-serif/i);
      expect(classes.map((item) => item.name)).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/^stage-a-/),
      ]));
      expect((result.result.stage_b_font_system as { fonts?: Array<{ family?: string; installAction?: string }> }).fonts)
        .toEqual(expect.arrayContaining([expect.objectContaining({
          family: 'figmaSans',
          installAction: 'install_before_stage_b_insert',
        })]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('preserves source SVG layout classes on native icon elements', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-svg-icon-layout-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-svg-icon-layout-fixture',
        title: 'SVG icon layout fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '.btn-inner{position:relative}.btn-icon{position:absolute;top:50%;right:-10px;width:20px;height:20px;translate:0 -50%}',
          '</style></head><body><main><a href="#" class="source-link"><span class="btn-inner"><span>Get started</span>',
          '<svg class="btn-icon" width="24" height="24" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
          '</span></a></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const iconClass = classes.find((item) => item.name === 'btn-icon');
      const icon = (result.result.content as Array<{ name: string; settings: Record<string, unknown> }>).find((item) => item.name === 'icon');
      expect(iconClass?.settings).toMatchObject({
        _position: 'absolute',
        _top: '50%',
        _right: '-10px',
        _width: '20px',
        _height: '20px',
      });
      expect(icon?.settings._cssGlobalClasses).toContain(iconClass?.id);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps remote custom font faces installable and rejects non-family font tokens', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-remote-font-parity-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-remote-font-parity-fixture',
        title: 'Remote font parity fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '@font-face{font-family:"Acme Display";src:url("https://cdn.example.com/acme-display.woff2") format("woff2");font-weight:300 800;font-style:normal}',
          ':root{--font--display:"Acme Display",sans-serif;--font-size--display:4rem;--font--display-bold:700;--font--display-state:unset}',
          'h1{font-family:"Acme Display",sans-serif}',
          '</style></head><body><main><h1>Metric-safe heading</h1></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const fontSystem = result.result.stage_b_font_system as {
        fonts?: Array<{
          family?: string;
          provider?: string;
          variants?: Array<{ sourceUrl?: string; weight?: string }>;
        }>;
      };
      expect(fontSystem.fonts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          family: 'Acme Display',
          provider: 'remote_asset',
          variants: expect.arrayContaining([
            expect.objectContaining({
              sourceUrl: 'https://cdn.example.com/acme-display.woff2',
              weight: '300 800',
            }),
          ]),
        }),
      ]));
      expect(fontSystem.fonts?.map((font) => font.family)).not.toEqual(expect.arrayContaining([
        '4rem',
        '700',
        'unset',
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('matches saved-page font preloads to relative font faces and excludes generic or unused families', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-saved-page-font-parity-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-saved-page-font-parity-fixture',
        title: 'Saved page font parity fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head>',
          '<link rel="preload" as="font" href="https://cdn.example.com/media/AcmeDisplay-Regular.woff2" type="font/woff2" crossorigin>',
          '<style>',
          '@font-face{font-family:"Acme Display";src:url(../media/AcmeDisplay-Regular.woff2) format("woff2");font-weight:400;font-style:normal}',
          '@font-face{font-family:"Unused Math";src:url(../media/UnusedMath-Regular.woff2) format("woff2");font-weight:400;font-style:normal}',
          ':root{--font-sans:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji"}',
          'h1{font-family:"Acme Display",system-ui,sans-serif}',
          '</style></head><body><main><h1>Metric-safe heading</h1></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const fontSystem = result.result.stage_b_font_system as {
        fonts?: Array<{
          family?: string;
          provider?: string;
          variants?: Array<{ sourceUrl?: string; sourceRef?: string }>;
        }>;
        roleTokens?: Array<{ name?: string; primaryFamily?: string }>;
      };
      expect(fontSystem.fonts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          family: 'Acme Display',
          provider: 'remote_asset',
          variants: expect.arrayContaining([
            expect.objectContaining({
              sourceUrl: 'https://cdn.example.com/media/AcmeDisplay-Regular.woff2',
            }),
          ]),
        }),
      ]));
      expect(fontSystem.fonts?.map((font) => font.family)).not.toEqual(expect.arrayContaining([
        'Apple Color Emoji',
        'Unused Math',
      ]));
      expect(fontSystem.roleTokens).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: '--font-sans', primaryFamily: 'ui-sans-serif' }),
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('reconciles an active source root theme when WordPress cannot retain html data attributes', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-root-theme-parity-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-root-theme-parity-fixture',
        title: 'Root theme parity fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html data-theme="dark" style="color-scheme:dark"><head><style>',
          '.media-light,[data-theme="dark"] .media-light{display:none}',
          '.media-dark,[data-theme="light"] .media-dark{display:none}',
          '[data-theme="dark"] .media-dark{display:block!important}',
          '</style></head><body><main><div class="media-light">Light</div><div class="media-dark">Dark</div></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const pageSettings = result.result.page_settings as { customCss?: string };
      expect(pageSettings.customCss).toContain('html:not([data-theme]) .media-dark');
      expect(pageSettings.customCss).toContain('display: block !important');
      expect(pageSettings.customCss).toContain('html:not([data-theme]) .media-light');
      expect(pageSettings.customCss).toContain('display: none !important');
      expect(pageSettings.customCss).toContain('color-scheme: dark');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('maps the individual CSS translate property to a native Bricks transform', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-individual-translate-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-individual-translate-fixture',
        title: 'Individual translate parity fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          'body{margin:0}.frame{position:relative;width:320px;height:900px}',
          '.phone{position:absolute;left:50%;width:120px;height:180px}',
          '.-translate-x-1\\/2{--tw-translate-x:-50%;--tw-translate-y:0px;translate:var(--tw-translate-x) var(--tw-translate-y)}',
          '</style></head><body><main><div class="frame"><h1>Centred phone preview</h1><p>The responsive preview remains centred using the individual translate property.</p><div class="phone -translate-x-1/2">Phone content</div></div></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const phoneClass = classes.find((item) => item.name === 'phone');
      const content = result.result.content as Array<{ name: string; settings?: Record<string, unknown> & { _cssGlobalClasses?: string[] } }>;
      const phone = content.find((item) => item.settings?._cssGlobalClasses?.includes(phoneClass?.id || ''));
      expect(effectiveClassOwnedSettings(phone, classes)).toMatchObject({
        _transform: { translateX: '-50%', translateY: '0' },
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps the declared Iowan primary and Palatino fallback stack intact', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-palatino-parity-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-palatino-parity-fixture',
        title: 'Baseline Palatino parity fixture',
        conversionProfile: 'prototype_bricks',
        html: '<!doctype html><html><head><style>h1{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}</style></head><body><main><h1>Metric-safe display heading</h1></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ name: string; settings: Record<string, unknown> }>;
      const foundationCss = String((result.result.stage_b_theme_style_payload as {
        settings?: { css?: { stylesheet?: string } };
      }).settings?.css?.stylesheet || '');
      expect(foundationCss).toMatch(/h1[^{}]*\{[^}]*font-family:\s*"Iowan Old Style",\s*"Palatino Linotype",\s*Palatino,\s*Georgia,\s*serif/i);
      expect(classes.map((item) => item.name)).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/^stage-a-/),
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('maps mixed simple and adjacent structural selectors without duplicating native declarations in _cssCustom', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-mixed-structural-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-mixed-structural-fixture',
        title: 'Baseline mixed structural fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          '.project + .project, .project-pair{margin-top:48px}',
          '</style></head><body><main>',
          '<article class="project">One</article><article class="project project-pair">Two</article>',
          '</main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const projectClass = classes.find((item) => item.name === 'project');
      const pairClass = classes.find((item) => item.name === 'project-pair');
      const adjacentClass = classes.find((item) => item.name === 'pixflow-source-project-after-project-style');
      expect(pairClass?.settings).toMatchObject({
        _margin: { top: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/) },
      });
      expect(adjacentClass?.settings).toMatchObject({
        _margin: { top: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/) },
      });
      const pageCss = String((result.result.page_settings as { customCss?: string }).customCss || '');
      expectDefinedCssVariableValue(
        (pairClass?.settings._margin as { top?: unknown } | undefined)?.top,
        pageCss,
        '48px',
      );
      expect((adjacentClass?.settings._margin as { top?: unknown } | undefined)?.top).toBe(
        (pairClass?.settings._margin as { top?: unknown } | undefined)?.top,
      );
      expect(String(projectClass?.settings._cssCustom || '')).not.toMatch(/margin-top/i);
      expect(String(pairClass?.settings._cssCustom || '')).not.toMatch(/margin-top/i);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps class-owned grid headers and responsive heading typography out of conflicting inline defaults', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-layout-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-layout-fixture',
        title: 'Baseline layout fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          ':root{--container:min(var(--max-screen-width,72rem),100%)}html{-webkit-text-size-adjust:100%;text-rendering:optimizeLegibility}body{font-family:Segoe UI,sans-serif;font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}',
          'p{margin:0;text-wrap:pretty}h1,h2,h3{margin:0;font-family:Georgia,serif;text-wrap:balance}h1{font-size:clamp(52px,8vw,110px);line-height:.95;letter-spacing:-.03em;}',
          '.container{display:block;width:min(100%,var(--container));margin-inline:auto}.site-header__inner{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:32px;}',
          '.site-header__nav{display:flex;justify-content:center;gap:24px;}',
          '.com-button{display:inline-flex;padding:12px 20px;font-size:15px;border-radius:999px}.com-button--primary{background-color:#b85032;color:#fff;border-color:#b85032}',
          '.hero__inner{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.8fr);}.hero__copy{flex:1.4 1 28rem;align-self:stretch}.hero__copy .hero__lead{margin-top:21.6px}',
          '@media (max-width:767px){body{font-size:15px}.site-header__inner{grid-template-columns:1fr auto}.site-header__nav{display:none;order:3}.site-header .com-button{display:none}.hero__actions .com-button{width:100%}.hero__inner{grid-template-columns:1fr}.hero h1{font-size:40px;line-height:.98;overflow-wrap:anywhere;}}',
          '</style></head><body>',
          '<header class="site-header"><div class="container site-header__inner"><a class="site-header__brand" href="#top">Brand</a><nav class="site-header__nav"><a href="#work">Work</a><a href="#about">About</a></nav><a class="site-header__cta com-button" href="#contact">Contact</a></div></header>',
          '<main><section class="hero"><div class="hero__inner"><div class="hero__copy"><h1>A deliberately long responsive heading for local businesses.</h1><p class="hero__lead">Useful supporting copy.</p><div class="hero__actions"><a class="com-button com-button--primary com-button--arrow" href="#contact">Start</a></div></div><aside>Visual</aside></div></section></main>',
          '</body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const pageSettings = result.result.page_settings as { customCss?: string };
      const foundation = result.result.stage_b_theme_style_payload as {
        mode?: string;
        settings?: { css?: { stylesheet?: string } };
      };
      const foundationCss = String(foundation.settings?.css?.stylesheet || '');
      expect(foundation.mode).toBe('page_foundation');
      expect(foundationCss).toMatch(/-webkit-text-size-adjust:\s*100%/i);
      expect(foundationCss).toMatch(/-webkit-font-smoothing:\s*antialiased/i);
      expect(foundationCss).toMatch(/text-rendering:\s*optimizeLegibility/i);
      expect(foundationCss).toMatch(/#brx-content\.pixflow-generated-page\s*\{[^}]*padding:\s*0/i);
      expect(pageSettings.customCss).not.toMatch(/-webkit-text-size-adjust|-webkit-font-smoothing/i);
      expect(pageSettings.customCss).toMatch(/#brx-content\s*\{[^}]*padding-top:\s*0px/i);
      expect(pageSettings.customCss).toMatch(/#brx-content\s*\{[^}]*padding-left:\s*0px/i);
      expect(foundationCss).toMatch(/font-size:\s*16px/i);
      expect(String(pageSettings.customCss || '')).toMatch(/@media[^{}]*max-width[^{}]*\{[\s\S]*font-size:\s*15px/i);
      expect(classes.map((item) => item.name)).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/^stage-a-/),
      ]));
      const containerClass = classes.find((item) => item.name === 'container');
      expect(containerClass?.settings).toMatchObject({
        _width: '100%',
        _widthMax: '1152px',
      });
      const header = (result.result.stage_b_header as { content: Array<Record<string, unknown>> }).content;
      const headerInnerClass = classes.find((item) => item.name.includes('site-header__inner'));
      expect(headerInnerClass?.settings).toMatchObject({
        _display: 'grid',
        _gridTemplateColumns: 'auto 1fr auto',
        '_gridTemplateColumns:mobile_landscape': '1fr auto',
      });
      const headerInner = header.find((element) => (
        (element.settings as { _cssGlobalClasses?: string[] })?._cssGlobalClasses?.includes(headerInnerClass?.id || '')
      ));
      expect(headerInner?.settings).not.toHaveProperty('_display');
      expect(headerInner?.settings).not.toHaveProperty('_flexWrap');
      const headerNavClass = classes.find((item) => item.name.includes('site-header__nav'));
      expect(headerNavClass?.settings).toMatchObject({
        '_order:mobile_landscape': '3',
        '_order:mobile_portrait': '3',
      });
      expect(headerInner?.settings).not.toHaveProperty('_justifyContent');
      expect(headerInner?.settings).not.toHaveProperty('_flexWrap');

      const buttonClass = classes.find((item) => item.name === 'com-button');
      expect(buttonClass, classes.map((item) => item.name).join(', ')).toBeDefined();
      expect(buttonClass?.settings).toMatchObject({
        _typography: expect.objectContaining({
          'font-family': 'Segoe UI',
          'font-size': '15px',
          'line-height': '1.55',
        }),
      });
      expect(buttonClass?.settings).not.toHaveProperty('_width:mobile_landscape');
      expect(buttonClass?.settings).not.toHaveProperty('_display:mobile_landscape');
      const primaryButtonClass = classes.find((item) => item.name === 'com-button--primary');
      expect(primaryButtonClass?.settings).toMatchObject({
        _background: { color: { raw: expect.stringMatching(/^var\(--pf-source-color-[a-z0-9]+\)$/) } },
        _typography: { color: { raw: '#fff' } },
      });
      expectDefinedCssVariableValue(
        ((primaryButtonClass?.settings._background as { color?: { raw?: unknown } } | undefined)?.color?.raw),
        String(pageSettings.customCss || ''),
        '#b85032',
      );
      expect(primaryButtonClass?.settings._typography).not.toHaveProperty('font-family');
      expect(primaryButtonClass?.settings._typography).not.toHaveProperty('font-size');
      expect(primaryButtonClass?.settings._typography).not.toHaveProperty('line-height');
      expect(primaryButtonClass?.settings).not.toHaveProperty('_cssCustom');
      const qa = result.artifacts.json.qa as { issues?: Array<{ id?: string; message?: string }> };
      expect(qa.issues || []).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'stage_b_custom_css_contains_supported_declarations',
          message: expect.stringMatching(/border-radius/i),
        }),
      ]));
      const headerCta = header.find((element) => element.name === 'button');
      expect(effectiveClassOwnedSettings(headerCta, classes)).toMatchObject({
        '_display:mobile_landscape': 'none',
        '_display:mobile_portrait': 'none',
      });
      expect(headerCta?.settings).not.toHaveProperty('size');

      const page = result.result.content as Array<{
        id?: string;
        parent?: string;
        name: string;
        settings: Record<string, unknown>;
      }>;
      const section = page.find((element) => element.name === 'section');
      const sectionContainer = page.find((element) => element.name === 'container' && element.parent === section?.id);
      const sectionContainerClasses = ((sectionContainer?.settings._cssGlobalClasses || []) as string[])
        .map((id) => classes.find((item) => item.id === id))
        .filter(Boolean);
      expect(sectionContainerClasses).toEqual(expect.arrayContaining([
        expect.objectContaining({ settings: expect.objectContaining({ _width: '100%', _widthMax: '100%' }) }),
      ]));
      const actionButton = page.find((element) => element.name === 'button');
      expect(actionButton?.settings.icon).toBeDefined();
      expect(actionButton?.settings).not.toHaveProperty('iconPosition');
      expect(actionButton?.settings).not.toHaveProperty('size');
      expect(actionButton?.settings).not.toHaveProperty('_display:mobile_landscape');
      const actionButtonClasses = ((actionButton?.settings._cssGlobalClasses || []) as string[])
        .map((id) => classes.find((item) => item.id === id))
        .filter(Boolean);
      expect(actionButtonClasses).toEqual(expect.arrayContaining([
        expect.objectContaining({
          settings: expect.objectContaining({ '_width:mobile_landscape': '100%' }),
        }),
      ]));
      expect(actionButtonClasses.some((item) => item?.settings['_display:mobile_landscape'] === 'none')).toBe(false);
      const h1 = page.find((element) => element.name === 'heading' && element.settings.tag === 'h1');
      const heroCopyClass = classes.find((item) => item.name.includes('hero__copy'));
      expect(heroCopyClass?.settings).toMatchObject({
        _flexGrow: '1.4',
        _flexShrink: '1',
        _flexBasis: '448px',
        _alignSelf: 'stretch',
      });
      const heroLead = page.find((element) => element.name === 'text-basic' && element.settings.text === 'Useful supporting copy.');
      const heroLeadClasses = ((heroLead?.settings._cssGlobalClasses || []) as string[])
        .map((id) => classes.find((item) => item.id === id))
        .filter(Boolean);
      expect(heroLeadClasses).toEqual(expect.arrayContaining([
        expect.objectContaining({ settings: expect.objectContaining({ _margin: expect.objectContaining({ top: '21.6px' }) }) }),
      ]));
      expect(String(pageSettings.customCss || '')).toMatch(/#brx-content\s+p\s*\{[^}]*text-wrap:\s*pretty/i);
      expect(String(classes.find((item) => item.name.includes('hero__lead'))?.settings._cssCustom || '')).not.toMatch(/hero__copy/);
      const h1Classes = ((h1?.settings._cssGlobalClasses || []) as string[])
        .map((id) => classes.find((item) => item.id === id))
        .filter(Boolean);
      expect(h1Classes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          settings: expect.objectContaining({
            _typography: expect.objectContaining({
              'font-size': '110px',
              'font-weight': '700',
            }),
          }),
        }),
        expect.objectContaining({
          settings: expect.objectContaining({
            '_typography:mobile_landscape': expect.objectContaining({
              'font-size': expect.stringMatching(/^var\(--pf-source-typography-[a-z0-9]+\)$/),
            }),
          }),
        }),
      ]));
      expect(foundationCss).toMatch(/h1[^{}]*\{[^}]*font-size:\s*clamp\(52px,8vw,110px\)/i);
      expect(foundationCss).toMatch(/h1[^{}]*\{[^}]*text-wrap:\s*balance/i);
      const responsiveHeadingClass = h1Classes.find((item) => item?.name.includes('hero-h1-style'));
      expectDefinedCssVariableValue(
        ((responsiveHeadingClass?.settings['_typography:mobile_landscape'] as Record<string, unknown> | undefined)?.['font-size']),
        String(pageSettings.customCss || ''),
        '40px',
      );
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('preserves semantic containers, exact SVG artwork, link metadata, and exact destination-bearing forms', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-structure-form-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-structure-form-fixture',
        title: 'Baseline structure and form fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          ':root{--shadow:0 20px 40px rgba(0,0,0,.2)}body{color:#1a1916;font-family:Arial,sans-serif;font-size:18px;line-height:1.55}.surface{display:flex;flex-wrap:wrap;gap:16px;background:white;box-shadow:var(--shadow)}.audit-field{flex:1 1 18rem}.audit-field--wide{flex-basis:100%}.audit-field label{color:#6b6964;font-size:13px}.audit-field input,.audit-field select,.audit-field textarea{padding:11px 14px;border:1px solid #e8e5df;border-radius:10px;background:#fff;color:#1a1916;font-size:15px}.submit-action{width:100%;margin-top:8px;background:#c96442;border:1px solid #c96442;border-radius:10px;color:#fff;font-size:15px}.brand-row span:first-child{font-family:Georgia,serif;font-size:18px;font-weight:600}.device-rows p{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0;padding:16px 0;border-top:1px solid #ddd}.device-rows strong{color:#fff}',
          '</style></head><body><main><section>',
          '<a class="nav_logo_wrap" href="/"><svg height="22.26" viewBox="0 0 35 24" fill="none"><path d="M24.5 0H19L28.8 24H34Z" fill="currentColor"/><path d="M9.5 0L0 24H5.3L12.2 6L19.1 24H24.4L14.9 0Z" fill="currentColor"/></svg></a>',
          '<figure><svg class="source-artwork" data-pixflow-svg-role="artwork" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M12 3v18" stroke="currentColor"/></svg><figcaption>Exact artwork</figcaption></figure>',
          '<article class="service-card"><span class="service-card__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15c3.5-7 12.5-7 16 0"/><path d="M12 10v10"/></svg></span><h3>Local SEO</h3></article>',
          '<details open><summary>More detail</summary><p id="detail-panel" hidden>Hidden initially</p></details>',
          '<ul><li>First item</li><li>Second item</li></ul>',
          '<a class="privacy-link" href="/privacy" target="_blank" rel="privacy-policy noopener">Privacy</a>',
          '<div class="brand-row"><span>Brand name</span><span>Copyright</span></div>',
          '<div class="device-rows"><p><strong>Pre-condition bedrooms</strong><span>Before demand window</span></p></div>',
          '<form class="surface" action="/contact" method="post">',
          '<div class="audit-field"><label for="person-name">Name</label><input id="person-name" name="name" type="text" placeholder="Ada" required></div>',
          '<div class="audit-field"><label for="budget">Budget</label><select id="budget" name="budget" required><option value="starter">Starter</option><option value="growth" selected>Growth</option></select></div>',
          '<div class="audit-field audit-field--wide"><label for="notes">Notes</label><textarea id="notes" name="notes" minlength="10" maxlength="500" rows="5"></textarea></div>',
          '<label><input name="consent" type="checkbox" value="yes" required> I agree to the policy.</label>',
          '<button class="submit-action" type="submit" name="intent" value="send">Send</button></form>',
          '</section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const content = result.result.content as Array<{
        name: string;
        settings: Record<string, unknown>;
      }>;
      expect(content).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'div', settings: expect.objectContaining({ tag: 'figure' }) }),
        expect.objectContaining({ name: 'text-basic', settings: expect.objectContaining({ tag: 'figcaption', text: 'Exact artwork' }) }),
        expect.objectContaining({ name: 'div', settings: expect.objectContaining({ tag: 'custom', customTag: 'details' }) }),
        expect.objectContaining({ name: 'text-basic', settings: expect.objectContaining({ tag: 'custom', customTag: 'summary', text: 'More detail' }) }),
        expect.objectContaining({ name: 'div', settings: expect.objectContaining({ tag: 'ul' }) }),
        expect.objectContaining({ name: 'div', settings: expect.objectContaining({ tag: 'li' }) }),
      ]));
      expect(JSON.stringify(result.artifacts.json.qa)).not.toContain('stage_b_attribute_unusual_name');

      const svgElements = content.filter((element) => element.name === 'svg');
      expect(svgElements).toEqual(expect.arrayContaining([
        expect.objectContaining({
          settings: expect.objectContaining({ source: 'code', code: expect.stringContaining('M24.5 0H19') }),
        }),
        expect.objectContaining({
          settings: expect.objectContaining({ source: 'code', code: expect.stringContaining('M3 12h18M12 3v18') }),
        }),
      ]));
      const compactLogo = svgElements.find((element) => String(element.settings.code || '').includes('M24.5 0H19'));
      expect(compactLogo?.settings._attributes).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'height' }),
      ]));
      expect(String(compactLogo?.settings.code || '')).toContain('height="22.26"');
      expect(String(compactLogo?.settings.code || '')).not.toContain('data-pf-source-id');
      const icon = content.find((element) => element.name === 'icon');
      expect(icon?.settings.icon).toMatchObject({
        library: 'pixflowSvg',
        icon: 'pixflow:tabler-outline:map-pin',
      });
      const iconSystem = result.result.stage_b_icon_system as { icons: Array<Record<string, unknown>> };
      expect(iconSystem.icons).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'map-pin', placeholder: 'pixflow:tabler-outline:map-pin' }),
      ]));
      expect(JSON.stringify(result.artifacts.json.qa)).not.toContain('stage_b_raw_svg_icon_markup');

      const hiddenPanel = content.find((element) => element.settings.text === 'Hidden initially');
      expect(hiddenPanel?.settings._attributes).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'hidden' }),
      ]));

      const privacyLink = content.find((element) => element.name === 'text-link' && element.settings.text === 'Privacy');
      expect(privacyLink?.settings.link).toMatchObject({
        type: 'external',
        url: '/privacy',
        newTab: true,
        rel: 'privacy-policy noopener',
      });

      const converterClasses = result.result.global_classes as Array<{ name: string; settings: Record<string, unknown> }>;
      const deviceRowsClass = converterClasses.find((item) => item.name.includes('device-rows-p-style'));
      expect(deviceRowsClass?.settings).toMatchObject({
        _display: 'flex',
        _alignItems: 'center',
        _justifyContent: 'space-between',
        _rowGap: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
        _columnGap: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
        _padding: {
          top: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
          right: '0',
          bottom: expect.stringMatching(/^var\(--pf-source-spacing-[a-z0-9]+\)$/),
          left: '0',
        },
        _border: expect.objectContaining({ style: 'solid' }),
      });
      const tokenCss = String((result.result.page_settings as { customCss?: string }).customCss || '');
      expectDefinedCssVariableValue(deviceRowsClass?.settings._rowGap, tokenCss, '24px');
      expectDefinedCssVariableValue(
        (deviceRowsClass?.settings._padding as { top?: unknown } | undefined)?.top,
        tokenCss,
        '16px',
      );

      const pageCustomCss = String((result.result.page_settings as { customCss?: string }).customCss || '');
      expect(pageCustomCss).toContain('.audit-field label');
      expect(pageCustomCss).toContain('.device-rows strong');
      const exactForm = content.find((element) => (
        element.name === 'html'
        && String(element.settings.html || '').includes('<form class="surface" action="/contact" method="post">')
      ));
      expect(content.some((element) => element.name === 'form')).toBe(false);
      expect(String(exactForm?.settings.html || '')).toContain('<input id="person-name" name="name" type="text" placeholder="Ada" required>');
      expect(String(exactForm?.settings.html || '')).toContain('<select id="budget" name="budget" required>');
      expect(String(exactForm?.settings.html || '')).toContain('<button class="submit-action" type="submit" name="intent" value="send">Send</button>');

      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const foundationCss = String((result.result.stage_b_theme_style_payload as {
        settings?: { css?: { stylesheet?: string } };
      }).settings?.css?.stylesheet || '');
      expect(foundationCss).toMatch(/font-family:\s*Arial,\s*sans-serif/i);
      expect(foundationCss).toMatch(/font-size:\s*18px/i);
      expect(foundationCss).toMatch(/line-height:\s*1\.55/i);
      expect(classes.map((item) => item.name)).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/^stage-a-/),
      ]));
      const firstChildClass = classes.find((item) => item.name.includes('brand-row-span-first-child-style'));
      const brandName = content.find((element) => element.settings.text === 'Brand name');
      const copyright = content.find((element) => element.settings.text === 'Copyright');
      expect(firstChildClass?.settings).toMatchObject({
        _typography: expect.objectContaining({
          'font-family': 'Georgia',
          'font-size': '18px',
          'font-weight': '600',
        }),
      });
      expect(brandName?.settings._cssGlobalClasses).toContain(firstChildClass?.id);
      expect(copyright?.settings._cssGlobalClasses).not.toContain(firstChildClass?.id);
      expect(classes.find((item) => item.name.includes('brand-row'))?.settings).not.toHaveProperty('_cssCustom');
      const surface = classes.find((item) => item.name === 'surface');
      expect(surface?.settings).toMatchObject({
        _background: { color: { raw: 'white' } },
        _boxShadow: expect.objectContaining({
          values: expect.objectContaining({ offsetX: '0', offsetY: '20px', blur: '40px' }),
        }),
      });
      expect(surface?.settings).not.toHaveProperty('_cssCustom');
      expect(pageCustomCss).toContain('.audit-field input,.audit-field select,.audit-field textarea');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('accepts Bricks custom semantic tags when an older fallback schema omits the conditional customTag control', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-custom-tag-schema-test-'));
    try {
      const fallbackControls = {
        tag: { key: 'tag', type: 'select' },
        text: { key: 'text', type: 'textarea' },
        _cssGlobalClasses: { key: '_cssGlobalClasses', type: 'array' },
      };
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-custom-tag-schema-fixture',
        title: 'Baseline custom tag schema fixture',
        conversionProfile: 'prototype_bricks',
        bricksSchemaSnapshot: {
          source: 'bricks_runtime_with_pixflow_fallbacks',
          elements: {
            div: { controls: fallbackControls },
            'text-basic': { controls: fallbackControls },
          },
        },
        html: [
          '<!doctype html><html><body><main><section>',
          '<details><summary>Read the details</summary><p>Useful context.</p></details>',
          '</section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.artifacts.json.bricksSchemaValidation).toMatchObject({
        ok: true,
        errorCount: 0,
      });
      expect(result.result.content).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'div', settings: expect.objectContaining({ tag: 'custom', customTag: 'details' }) }),
        expect.objectContaining({ name: 'text-basic', settings: expect.objectContaining({ tag: 'custom', customTag: 'summary' }) }),
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('uses native, semantic, then exact HTML fallbacks across rich platform elements', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-platform-fallback-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-platform-fallback-fixture',
        title: 'Baseline platform fallback fixture',
        conversionProfile: 'prototype_bricks',
        html: [
          '<!doctype html><html><head><style>',
          '.rich-table{width:100%;border-collapse:collapse}.responsive-picture img{width:100%}.rich-form{display:flex;gap:16px}.rich-field{flex:1 1 calc(50% - 8px)}.rich-field--wide{flex-basis:100%}',
          '</style></head><body><main><section>',
          '<blockquote cite="https://example.test/source"><p>Quoted copy</p><footer>Source name</footer></blockquote>',
          '<dl><dt>Native</dt><dd>Builder controlled</dd></dl>',
          '<table class="rich-table"><caption>Coverage</caption><thead><tr><th scope="col">Area</th></tr></thead><tbody><tr><td>Structure</td></tr></tbody></table>',
          '<picture class="responsive-picture"><source media="(max-width:600px)" srcset="small.jpg"><img src="large.jpg" srcset="small.jpg 600w, large.jpg 1200w" sizes="100vw" alt="Responsive artwork"></picture>',
          '<audio controls preload="metadata" src="sample.mp3"></audio>',
          '<iframe title="Embedded audit" src="https://example.test/embed" loading="lazy" allow="fullscreen"></iframe>',
          '<progress max="100" value="72">72%</progress><meter min="0" max="10" value="7">7/10</meter>',
          '<canvas width="320" height="120">Canvas unavailable</canvas><edge-status data-state="ready"><span slot="label">Ready</span></edge-status>',
          '<form class="rich-form" action="/submit" method="post"><label class="rich-field">Date<input type="date" name="date" min="2026-01-01"></label><label class="rich-field rich-field--wide">Services<select name="services[]" multiple><option value="design" selected>Design</option><option value="build">Build</option></select></label><button type="reset">Reset</button><button type="submit" name="intent" value="send">Submit</button></form>',
          '</section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{ name: string; settings: Record<string, unknown> }>;

      for (const tag of ['blockquote', 'footer', 'dl', 'dt', 'dd', 'table', 'caption', 'thead', 'tr', 'th', 'tbody', 'td', 'progress', 'meter']) {
        expect(content.some((element) => element.settings.tag === tag || element.settings.customTag === tag), `missing semantic tag ${tag}`).toBe(true);
      }
      expect(content.find((element) => element.settings.customTag === 'blockquote')?.settings._attributes).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'cite', value: 'https://example.test/source' }),
      ]));
      expect(content.find((element) => element.settings.customTag === 'th')?.settings._attributes).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'scope', value: 'col' }),
      ]));
      expect(content.find((element) => element.settings.customTag === 'progress')?.settings._attributes).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'max', value: '100' }),
        expect.objectContaining({ name: 'value', value: '72' }),
      ]));
      expect(content).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'div',
          settings: expect.objectContaining({ tag: 'custom', customTag: 'edge-status' }),
        }),
      ]));

      const audio = content.find((element) => element.name === 'audio');
      expect(audio?.settings).toMatchObject({ source: 'external', external: 'sample.mp3', preload: 'metadata' });

      const htmlFallbacks = content.filter((element) => element.name === 'html').map((element) => String(element.settings.html || ''));
      expect(htmlFallbacks).toEqual(expect.arrayContaining([
        expect.stringContaining('<picture class="responsive-picture">'),
        expect.stringContaining('<iframe title="Embedded audit"'),
        expect.stringContaining('<canvas width="320" height="120">'),
        expect.stringContaining('<form class="rich-form" action="/submit" method="post">'),
      ]));
      expect(htmlFallbacks.join('\n')).toContain('srcset="small.jpg 600w, large.jpg 1200w"');
      expect(htmlFallbacks.join('\n')).toContain('<select name="services[]" multiple>');
      expect(htmlFallbacks.join('\n')).toContain('<button type="reset">Reset</button>');
      expect(content.some((element) => element.name === 'form')).toBe(false);
      const qa = result.artifacts.json.qa as { issues?: Array<{ severity?: string }> };
      expect((qa.issues || []).some((issue) => issue.severity === 'P0')).toBe(false);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps composer fields native when presentation-only buttons share the form', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-composer-form-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-composer-form-fixture',
        title: 'Composer form fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><body><main><section>',
          '<form method="post"><textarea name="message" placeholder="Ask anything"></textarea>',
          '<button type="button">Agent</button><button type="button">Model</button>',
          '<button type="submit">Send</button></form>',
          '</section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{ name: string; settings: Record<string, unknown> }>;
      const form = content.find((element) => element.name === 'form');
      expect(form?.settings.fields).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'textarea', name: 'message', placeholder: 'Ask anything' }),
      ]));
      expect(form?.settings.submitButtonText).toBe('Send');
      expect(content.some((element) => element.name === 'html' && /<form\b/i.test(String(element.settings.html || '')))).toBe(false);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('does not concatenate animated prompt suggestions into a native form label', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-composer-suggestion-label-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-composer-suggestion-label-fixture',
        title: 'Composer suggestion label fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '.sr-only{position:absolute;width:1px;height:1px;overflow:hidden}.absolute{position:absolute}.opacity-0{opacity:0}',
          '.composer-shell{display:flex;padding:16px 52px 16px 16px;background:#fff;border:1px solid #d1d5db;border-radius:24px;box-shadow:0 8px 32px rgba(0,0,0,.12)}',
          '.send-wrap{position:absolute;right:12px;bottom:12px;display:flex;justify-content:flex-end}.send{position:relative;width:36px;height:36px}',
          '</style></head><body><main><section><form method="post">',
          '<label class="composer-shell"><div class="sr-only">Message ChatGPT</div>',
          '<div class="absolute"><div class="opacity-0">Quiz me on vocabulary</div><div class="opacity-0">Plan a trip</div></div>',
          '<textarea name="message"></textarea></label><div class="send-wrap"><button class="send" type="submit" aria-label="Send"><svg viewBox="0 0 16 16"><path d="M8 12V4M4 8l4-4 4 4"/></svg></button></div>',
          '</form></section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{ name: string; settings: Record<string, unknown> }>;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const form = content.find((element) => element.name === 'form');
      const fields = form?.settings.fields as Array<Record<string, unknown>> | undefined;
      const message = fields?.find((field) => field.name === 'message');

      expect(form?.settings.showLabels).toBe(false);
      expect(form?.settings.submitButtonText).toBe('Send');
      expect(message).toMatchObject({ label: 'Message ChatGPT', placeholder: 'Message ChatGPT' });
      expect(form?.settings).toMatchObject({
        fieldPadding: { top: '16px', right: '52px', bottom: '16px', left: '16px' },
        fieldBackgroundColor: { raw: 'rgb(255, 255, 255)' },
        fieldBorder: expect.objectContaining({
          width: { top: '1', right: '1', bottom: '1', left: '1' },
          style: 'solid',
          color: { raw: 'rgb(209, 213, 219)' },
          radius: { top: '24px', right: '24px', bottom: '24px', left: '24px' },
        }),
      });
      expect(classes.find((item) => item.name === 'composer-shell')).toBeUndefined();
      const formClassIds = form?.settings._cssGlobalClasses as string[] | undefined;
      const formShadowClass = classes.find((item) => (
        formClassIds?.includes(item.id) && item.settings._boxShadow
      ));
      expect(formShadowClass?.settings._boxShadow).toMatchObject({
        values: {
          offsetY: '8px',
          blur: '32px',
          color: expect.stringMatching(/^rgba\(/),
        },
        color: { raw: expect.stringMatching(/^rgba\(/) },
      });
      const effectiveFormCss = [
        form?.settings._cssCustom,
        ...classes
          .filter((item) => formClassIds?.includes(item.id))
          .map((item) => item.settings._cssCustom),
      ].join('\n');
      expect(effectiveFormCss).toContain(
        'position: absolute; right: 12px; bottom: 12px; display: flex; justify-content: flex-end; width: 36px !important; height: 36px !important;',
      );
      expect(effectiveFormCss).toContain(
        '.form-group:not(.submit-button-wrapper) { padding-bottom: 0; }',
      );
      expect(effectiveFormCss).toContain(
        '.submit-button-wrapper .bricks-button .text::after',
      );
      expect(form?.settings._attributes).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'data-pf-decorative-field-source-id' }),
      ]));
      expect(String(message?.label || '')).not.toContain('Quiz me on vocabulary');
      expect(String(message?.label || '')).not.toContain('Plan a trip');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('lets a max-width flex-row child occupy available width instead of collapsing to min-content', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-flex-max-width-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-flex-max-width-fixture',
        title: 'Flex max-width fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '.banner{display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:20px}',
          '@media(min-width:768px){.banner{flex-direction:row}}',
          '.copy{display:flex;flex-direction:column}.max-w-\\[840px\\]{max-width:840px}.actions{display:flex;flex-shrink:0}',
          '</style></head><body><main><section class="banner">',
          '<div class="copy max-w-[840px]"><h2>We use cookies</h2><p>Long consent copy should occupy the available banner width.</p></div>',
          '<div class="actions"><button>Manage cookies</button></div>',
          '</section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{
        name: string;
        settings: Record<string, unknown> & { _cssGlobalClasses?: string[] };
      }>;
      const classes = result.result.global_classes as Array<{ id: string; name: string; settings: Record<string, unknown> }>;
      const copyClassId = classes.find((item) => item.name === 'copy')?.id;
      const actionsClassId = classes.find((item) => item.name === 'actions')?.id;
      const copy = content.find((element) => element.settings._cssGlobalClasses?.includes(copyClassId || ''));
      const actions = content.find((element) => element.settings._cssGlobalClasses?.includes(actionsClassId || ''));
      const effectiveClasses = classes.filter((item) => copy?.settings._cssGlobalClasses?.includes(item.id));
      const effectiveActionClasses = classes.filter((item) => actions?.settings._cssGlobalClasses?.includes(item.id));

      expect(effectiveClasses.some((item) => item.settings._widthMax === '840px')).toBe(true);
      expect(effectiveClasses.some((item) => item.settings._width === '100%')).toBe(true);
      expect(copy).toMatchObject({ name: 'block' });
      expect(copy?.settings._width).not.toBe('auto');
      expect(actions).toMatchObject({ name: 'block' });
      expect(effectiveActionClasses.some((item) => item.settings._width === 'auto')).toBe(true);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps measured short text on one line when every captured viewport is single-line', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-measured-single-line-text-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-measured-single-line-text-fixture',
        title: 'Measured single-line text fixture',
        conversionProfile: 'uploaded_html',
        html: '<!doctype html><html><head><style>.title{font-size:28px;line-height:34px;text-align:center}</style></head><body><main><section><span class="title">What can I help with?</span></section></main></body></html>',
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{
        name: string;
        settings: Record<string, unknown> & { text?: string; _cssGlobalClasses?: string[] };
      }>;
      const classes = result.result.global_classes as Array<{
        id: string;
        settings: Record<string, unknown> & { _typography?: Record<string, unknown> };
      }>;
      const title = content.find((element) => element.settings.text === 'What can I help with?');
      const effectiveClasses = classes.filter((item) => title?.settings._cssGlobalClasses?.includes(item.id));

      expect(effectiveClasses.some((item) => item.settings._typography?.['white-space'] === 'nowrap')).toBe(true);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('projects browser-authoritative styles for source nodes beyond the first 400 elements', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-late-source-evidence-test-'));
    try {
      const precedingNodes = Array.from({ length: 410 }, (_, index) => (
        `<span aria-hidden="true" data-sequence="${index}"></span>`
      )).join('');
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-late-source-evidence-fixture',
        title: 'Baseline late source evidence fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '.late-heading{font-size:52px;line-height:1.1;color:rgb(12,34,56)}',
          '</style></head><body><main>',
          precedingNodes,
          '<h1 class="late-heading">Late measured heading</h1>',
          '</main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{
        name: string;
        settings: Record<string, unknown> & { text?: string; _cssGlobalClasses?: string[] };
      }>;
      const classes = result.result.global_classes as Array<{
        id: string;
        name: string;
        settings: Record<string, unknown>;
      }>;
      const heading = content.find((element) => (
        element.name === 'heading' && String(element.settings.text || '').includes('Late measured heading')
      ));
      const classIds = heading?.settings._cssGlobalClasses || [];
      const measuredClass = classes.find((classItem) => (
        classIds.includes(classItem.id) && classItem.name.startsWith('pixflow-measured-')
      ));

      expect(measuredClass?.settings).toMatchObject({
        _typography: {
          'font-size': '52px',
          'line-height': '1.1',
          color: { raw: 'rgb(12, 34, 56)' },
        },
      });
      expect(classIds.at(-1)).toBe(measuredClass?.id);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps ordinary Build environment typography and spacing out of native Bricks ownership', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-build-authored-style-ownership-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'build-authored-style-ownership-fixture',
        title: 'Build authored style ownership fixture',
        conversionProfile: 'uploaded_html',
        sourceContract: 'build-in-bricks-html-first',
        themeStylePolicy: 'inherit_effective',
        html: [
          '<!doctype html><html><head><style>',
          '.button--accent{border-radius:4px}',
          '</style></head><body><main><section class="hero">',
          '<h1 class="hero__title">Inherited heading</h1>',
          '<a class="button button--accent" href="#contact">Contact</a>',
          '</section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{
        id: string;
        name: string;
        settings: Record<string, any> & { text?: string; _cssGlobalClasses?: string[] };
      }>;
      const classes = result.result.global_classes as Array<{
        id: string;
        name: string;
        settings: Record<string, any>;
      }>;
      const heading = content.find((element) => (
        element.name === 'heading' && String(element.settings.text || '').includes('Inherited heading')
      ));
      const button = content.find((element) => (
        ['button', 'text-link'].includes(element.name)
        && String(element.settings.text || '').includes('Contact')
      ));
      const headingOwned = effectiveClassOwnedSettings(heading, classes);
      const buttonOwned = effectiveClassOwnedSettings(button, classes);
      const measuredProjection = (result.result.diagnostics as Record<string, any>)?.measuredSourceProjection;

      expect(button).toBeDefined();
      expect(headingOwned._typography).toBeUndefined();
      expect(JSON.stringify(headingOwned)).not.toContain('Times New Roman');
      expect(JSON.stringify(headingOwned)).not.toContain('32px');
      expect(buttonOwned._typography).toBeUndefined();
      expect(buttonOwned._padding).toBeUndefined();
      expect(buttonOwned._border).toMatchObject({
        radius: { top: '4px', right: '4px', bottom: '4px', left: '4px' },
      });
      expect(measuredProjection).toMatchObject({ measuredStyleOwnership: 'authored_source' });
      expect(measuredProjection.provenance).toEqual(expect.arrayContaining([
        expect.objectContaining({
          bricksElementName: 'heading',
          skippedEnvironmentOwnedProperties: expect.arrayContaining(['font-family', 'font-size']),
        }),
      ]));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('preserves authored auto margins instead of freezing desktop computed offsets', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-auto-margin-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-auto-margin-fixture',
        title: 'Baseline auto margin fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '.centered-copy{display:block;max-width:600px;margin-inline:auto}',
          '</style></head><body><main><section><div class="centered-copy">Centered content</div></section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{
        name: string;
        settings: Record<string, unknown> & { _cssGlobalClasses?: string[] };
      }>;
      const classes = result.result.global_classes as Array<{
        id: string;
        name: string;
        settings: Record<string, unknown>;
      }>;
      const classItem = classes.find((item) => item.name === 'centered-copy');
      const element = content.find((item) => item.settings._cssGlobalClasses?.includes(classItem?.id || ''));
      const effective = effectiveClassOwnedSettings(element, classes);

      expect(effective._margin).toMatchObject({ left: 'auto', right: 'auto' });
      expect(effective._margin).not.toMatchObject({ left: expect.stringMatching(/px$/), right: expect.stringMatching(/px$/) });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('maps responsive logical block padding to Bricks physical controls', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-logical-padding-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-logical-padding-fixture',
        title: 'Baseline logical padding fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          ':root{--section-pad:80px}@media(max-width:478px){:root{--section-pad:40px}}',
          '.logical-section{display:block;padding-block-start:var(--section-pad);padding-block-end:var(--section-pad)}',
          '</style></head><body><main><section class="logical-section"><p>Responsive spacing</p></section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{
        name: string;
        settings: Record<string, unknown> & { _cssGlobalClasses?: string[] };
      }>;
      const classes = result.result.global_classes as Array<{
        id: string;
        name: string;
        settings: Record<string, unknown>;
      }>;
      const classItem = classes.find((item) => item.name === 'logical-section');
      const element = content.find((item) => item.settings._cssGlobalClasses?.includes(classItem?.id || ''));
      const effective = effectiveClassOwnedSettings(element, classes);

      expect(effective._padding).toMatchObject({ top: '80px', bottom: '80px' });
      expect(effective['_padding:mobile_portrait']).toMatchObject({ top: '40px', bottom: '40px' });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('projects an escaped utility clip-path that keeps a captured drawer closed', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-clip-path-state-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-clip-path-state-fixture',
        title: 'Baseline clip path state fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          '.\\[clip-path\\:inset\\(0_0_100\\%_0\\)\\]{clip-path:inset(0 0 100% 0)}',
          '</style></head><body><main><section>',
          '<div id="drawer" class="[clip-path:inset(0_0_100%_0)]"><p>Closed navigation</p></div>',
          '</section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{
        settings: Record<string, unknown> & { _cssId?: string; _cssGlobalClasses?: string[] };
      }>;
      const classes = result.result.global_classes as Array<{
        id: string;
        name: string;
        settings: Record<string, unknown>;
      }>;
      const measuredClass = classes.find((item) => (
        item.name.startsWith('pixflow-measured-')
        && /clip-path/i.test(String(item.settings._cssCustom || ''))
      ));
      const drawer = content.find((element) => element.settings._cssGlobalClasses?.includes(measuredClass?.id || ''));

      expect(drawer).toBeDefined();
      expect(String(measuredClass?.settings._cssCustom || '')).toMatch(
        /%root%(?::is\([^}]+\))?\s*\{[^}]*clip-path:\s*inset\(0px 0px 100%\)/i,
      );
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('protects measured source button styling from the Bricks content-root reset', async () => {
    const dataDir = await mkdtemp(resolve(tmpdir(), 'pixflow-baseline-button-reset-collision-test-'));
    try {
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'baseline-button-reset-collision-fixture',
        title: 'Baseline button reset collision fixture',
        conversionProfile: 'uploaded_html',
        html: [
          '<!doctype html><html><head><style>',
          ':root{--button-bg:rgba(0,0,0,.04)}.cookie-action{display:flex;height:40px;padding:0 20px;background-color:var(--button-bg);border-radius:40px;font-size:14px;line-height:14px}',
          '</style></head><body><main><section><button class="cookie-action" type="button">Manage Cookies</button></section></main></body></html>',
        ].join(''),
      }, {
        projectRoot: resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const content = result.result.content as Array<{
        name: string;
        settings: Record<string, unknown> & { text?: string; _cssGlobalClasses?: string[] };
      }>;
      const classes = result.result.global_classes as Array<{
        id: string;
        name: string;
        settings: Record<string, unknown>;
      }>;
      const button = content.find((element) => element.name === 'button' && element.settings.text === 'Manage Cookies');
      const effective = effectiveClassOwnedSettings(button, classes);
      const css = String(effective._cssCustom || '');

      expect(css).toMatch(/#brx-content\s+%root%\s*\{/i);
      expect(css).toMatch(/background-color:\s*rgba\(0, 0, 0, 0\.04\)/i);
      expect(css).toMatch(/border-radius:\s*40px/i);
      expect(css).toMatch(/font-size:\s*14px/i);
      expect(css).toMatch(/line-height:\s*14px/i);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);
});
