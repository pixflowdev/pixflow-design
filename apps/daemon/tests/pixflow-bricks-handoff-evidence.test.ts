import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildStageBMutationBatch,
  buildBricksHandoffCliArgs,
  buildBricksResultSignature,
  collectConverterLocalMediaAssets,
  convertRunnerJsonLineToChatEvents,
  convertHtmlForBricksBaseline,
  createRunnerChatParserState,
  isCertifiedPrototypeBricksStageBFastPath,
  isModelAuthoredHandoffCritique,
  hydrateHandoffProjectTextContextFiles,
  hydrateHandoffPrimaryHtml,
  materializeHandoffBinaryContextFiles,
  materializeStageACompositionDna,
  modelAuthoredCritiqueFromRunnerEventsText,
  normalizeHandoffContextFiles,
  stageBMutationPayloadHash,
} from '../src/pixflow/bricks-handoff-conversion.js';

describe('converter-owned local media transport', () => {
  it('bundles only referenced media contained by the converter workspace', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-converter-media-'));
    try {
      await fs.mkdir(path.join(workspace, 'assets'), { recursive: true });
      await fs.writeFile(path.join(workspace, 'assets', 'generated.png'), Buffer.from([137, 80, 78, 71]));
      await fs.writeFile(path.join(workspace, 'unreferenced.png'), Buffer.from([1, 2, 3]));

      await expect(collectConverterLocalMediaAssets(workspace, {
        content: [{ name: 'image', settings: { image: { url: 'assets/generated.png' } } }],
        page_settings: {
          customScriptsBodyFooter: '<img src="../outside.png"><img src="assets/missing.png">',
        },
      })).resolves.toEqual([{
        ref: 'assets/generated.png',
        projectPath: 'assets/generated.png',
        filename: 'generated.png',
        mimeType: 'image/png',
        contentBase64: 'iVBORw==',
        sizeBytes: 4,
      }]);
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it('carries referenced saved-bundle media from the materialized source-resource tree', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-converter-source-media-'));
    try {
      const sourceResources = path.join(workspace, 'stage-a', 'source-resources', 'OpenAI_files');
      await fs.mkdir(sourceResources, { recursive: true });
      await fs.writeFile(path.join(sourceResources, 'referenced.png'), Buffer.from([137, 80, 78, 71]));
      await fs.writeFile(path.join(sourceResources, 'unrelated.png'), Buffer.from([1, 2, 3]));

      await expect(collectConverterLocalMediaAssets(workspace, {
        content: [{
          name: 'image',
          settings: { image: { url: 'OpenAI_files/referenced.png' } },
        }],
      })).resolves.toEqual([{
        ref: 'OpenAI_files/referenced.png',
        projectPath: 'OpenAI_files/referenced.png',
        filename: 'referenced.png',
        mimeType: 'image/png',
        contentBase64: 'iVBORw==',
        sizeBytes: 4,
      }]);
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it('supports image-heavy saved pages without failing at the old 48-file ceiling', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-converter-media-gallery-'));
    try {
      const mediaRoot = path.join(workspace, 'stage-a', 'source-resources', 'Gallery_files');
      await fs.mkdir(mediaRoot, { recursive: true });
      const content = [];
      for (let index = 0; index < 60; index += 1) {
        const filename = `image-${index}.png`;
        await fs.writeFile(path.join(mediaRoot, filename), Buffer.from([137, 80, 78, 71]));
        content.push({ name: 'image', settings: { image: { url: `Gallery_files/${filename}` } } });
      }

      await expect(collectConverterLocalMediaAssets(workspace, { content })).resolves.toHaveLength(60);
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it('bundles a referenced extensionless saved-page image using its file signature', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-converter-extensionless-media-'));
    try {
      const mediaRoot = path.join(workspace, 'stage-a', 'source-resources', 'Saved_files');
      await fs.mkdir(mediaRoot, { recursive: true });
      const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
      await fs.writeFile(path.join(mediaRoot, 'card-image'), webp);

      await expect(collectConverterLocalMediaAssets(workspace, {
        content: [{ name: 'image', settings: { image: { url: './Saved_files/card-image' } } }],
      })).resolves.toEqual([expect.objectContaining({
        ref: './Saved_files/card-image',
        filename: 'card-image',
        mimeType: 'image/webp',
      })]);
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });
});

describe('Bricks handoff model evidence', () => {
  it('forwards canonical Build source metadata and preserves the legacy reader on every Bricks conversion HTTP surface', async () => {
    const serverSource = await fs.readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
    expect(serverSource.match(/input\.buildSource = body\.buildSource/g)).toHaveLength(3);
    expect(serverSource.match(/input\.stageASource = body\.stageASource/g)).toHaveLength(3);
    expect(serverSource.match(/!input\.buildSource && body\.stageASource/g)).toHaveLength(3);
    expect(serverSource.match(/buildSource\?: unknown;/g)?.length).toBeGreaterThanOrEqual(3);
    expect(serverSource.match(/stageASource\?: unknown;/g)?.length).toBeGreaterThanOrEqual(3);
    expect(serverSource.match(/input\.htmlProjectFile = body\.htmlProjectFile/g)).toHaveLength(3);
    expect(serverSource.match(/htmlProjectFile\?: unknown;/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('signs the exact serialized Bricks result used by final visual evidence', () => {
    const bytes = Buffer.from('{"content":[]}\n', 'utf8');
    expect(buildBricksResultSignature(bytes)).toEqual({
      sha256: 'c343ed70cedbf342f9871248d290fe96b1d5187fac18c6751c25793e10cd7100',
      size: 15,
    });
  });

  it('keeps final Stage B QA strict while allowing the deterministic preview baseline', () => {
    const modelArgs = buildBricksHandoffCliArgs({
      stageAWorkspace: 'stage-a',
      handoffRoot: 'handoff',
      sourceId: 'page',
      runnerId: 'codex',
      deterministic: false,
    });
    expect(modelArgs).not.toContain('--allow-low-stage-b-qa');
    expect(modelArgs.slice(modelArgs.indexOf('--repair-attempts'), modelArgs.indexOf('--repair-attempts') + 2))
      .toEqual(['--repair-attempts', '0']);
    expect(buildBricksHandoffCliArgs({
      stageAWorkspace: 'stage-a',
      handoffRoot: 'handoff',
      sourceId: 'page',
      runnerId: 'deterministic',
      deterministic: true,
    })).toContain('--allow-low-stage-b-qa');
  });

  it('materializes Stage A screenshots and assets into the Stage B workspace', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-evidence-'));
    try {
      await materializeHandoffBinaryContextFiles(workspace, [{
        name: 'desktop.png',
        path: 'stage-a/screenshots/desktop.png',
        role: 'reference_screenshot',
        order: 1,
        encoding: 'base64',
        content: Buffer.from('desktop evidence').toString('base64'),
      }, {
        name: 'portrait.webp',
        path: 'assets/portrait.webp',
        role: 'asset',
        order: 2,
        encoding: 'base64',
        content: Buffer.from('asset evidence').toString('base64'),
      }]);

      await expect(fs.readFile(path.join(workspace, 'screenshots', 'desktop.png'), 'utf8'))
        .resolves.toBe('desktop evidence');
      await expect(fs.readFile(path.join(workspace, 'drafts', 'assets', 'portrait.webp'), 'utf8'))
        .resolves.toBe('asset evidence');
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it('does not create header or footer templates for Prototype Bricks page generation', () => {
    const args = buildBricksHandoffCliArgs({
      stageAWorkspace: 'stage-a',
      handoffRoot: 'handoff',
      sourceId: 'page',
      runnerId: 'codex',
      deterministic: false,
      includePageTemplates: false,
    });

    expect(args.slice(args.indexOf('--include-header'), args.indexOf('--include-header') + 2)).toEqual([
      '--include-header',
      'no',
    ]);
    expect(args.slice(args.indexOf('--include-footer'), args.indexOf('--include-footer') + 2)).toEqual([
      '--include-footer',
      'no',
    ]);
  });

  it('accepts the compiler fast path only with a complete zero-issue certificate', () => {
    const diagnostics = {
      stage_b_mode: 'certified_fast_path',
      certifiedFastPath: {
        schema: 'pixflow.prototype_bricks.stage_b_fast_path.v1',
        certified: true,
        conversionProfile: 'prototype_bricks',
        schemaPassed: true,
        qualityPassed: true,
        nextGate: 'atomic_apply_then_frontend_visual_capture',
        elementCount: 131,
      },
    };
    const qa = {
      status: 'passed',
      blocking: false,
      score: 100,
      severity: { p0: 0, p1: 0, p2: 0 },
      qualityGate: { passed: true },
      summary: { elementCount: 131 },
    };

    expect(isCertifiedPrototypeBricksStageBFastPath(diagnostics, qa)).toBe(true);
    expect(isCertifiedPrototypeBricksStageBFastPath(diagnostics, {
      ...qa,
      score: 97,
      severity: { p0: 0, p1: 0, p2: 1 },
    })).toBe(false);
    expect(isCertifiedPrototypeBricksStageBFastPath({
      ...diagnostics,
      certifiedFastPath: { ...diagnostics.certifiedFastPath, schemaPassed: false },
    }, qa)).toBe(false);
  });

  it('preserves the model-authored Stage A composition plan for the Stage B fast path', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-a-composition-'));
    try {
      await materializeStageACompositionDna(workspace, [{
        name: 'composition-dna.md',
        path: 'stage-a/composition-dna.md',
        role: 'context',
        order: 1,
        text: '# Composition DNA\n\nEditorial tension with an asymmetric proof rail.\n',
      }]);

      await expect(fs.readFile(path.join(workspace, 'composition-dna.md'), 'utf8'))
        .resolves.toContain('asymmetric proof rail');
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it('keeps split-source assets at the path referenced by the compiled artifact', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-split-assets-'));
    try {
      await materializeHandoffBinaryContextFiles(workspace, [{
        name: 'device.svg',
        path: 'stage-a/source/assets/device.svg',
        role: 'asset',
        order: 1,
        encoding: 'base64',
        content: Buffer.from('<svg/>').toString('base64'),
      }]);

      await expect(fs.readFile(path.join(workspace, 'source', 'assets', 'device.svg'), 'utf8'))
        .resolves.toBe('<svg/>');
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it('preserves a project-local Stage A image through deterministic conversion', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-project-media-'));
    const projectId = 'project-media-fixture';
    const assetPath = path.join(dataDir, 'projects', projectId, 'stage-a', 'source', 'assets', 'team.jpg');
    try {
      await fs.mkdir(path.dirname(assetPath), { recursive: true });
      await fs.writeFile(assetPath, 'project image bytes');
      const result = await convertHtmlForBricksBaseline({
        sourceId: projectId,
        sourcePath: 'stage-a/compiled/index.html',
        title: 'Project media fixture',
        conversionProfile: 'prototype_bricks',
        html: '<!doctype html><html><body><main><section class="faqs aos-init"><img src="../source/assets/team.jpg" alt="Operations team"></section></main></body></html>',
        handoffFiles: [{
          name: 'team.jpg',
          path: 'stage-a/source/assets/team.jpg',
          role: 'asset',
          order: 1,
          mime: 'image/jpeg',
        }],
        contextFiles: [{
          name: 'team.jpg',
          path: 'stage-a/source/assets/team.jpg',
          role: 'asset',
          order: 1,
          mime: 'image/jpeg',
          projectFile: true,
        }],
      }, {
        projectRoot: path.resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(JSON.stringify(result.result)).toContain('../source/assets/team.jpg');
      expect(JSON.stringify(result.result)).not.toContain('placehold.co');
      expect(result.sourceManifest).toMatchObject({
        schema: 'pixflow.html_to_bricks.source_manifest.v1',
        inputKind: 'document_bundle',
        canonicalHtml: { path: 'stage-a/compiled/index.html' },
      });
      const sourceMap = result.artifacts.json.sourceMap as {
        renderedSnapshot?: { available?: boolean; viewports?: unknown[]; nodesBySourceId?: Record<string, unknown> };
      };
      expect(sourceMap.renderedSnapshot).toMatchObject({
        available: true,
        viewports: expect.arrayContaining([
          expect.objectContaining({ id: 'desktop', width: 1440 }),
          expect.objectContaining({ id: 'bricks_base', width: 992 }),
          expect.objectContaining({ id: 'mobile', width: 390 }),
        ]),
      });
      expect(Object.keys(sourceMap.renderedSnapshot?.nodesBySourceId || {})).toContain('pf-source-00003');
      expect(JSON.stringify(sourceMap.renderedSnapshot?.nodesBySourceId || {})).toContain('aos-init');
      const diagnostics = result.result.diagnostics as {
        measuredSourceProjection?: { available?: boolean; tracedSourceElementCount?: number; provenance?: unknown[] };
      };
      expect(diagnostics.measuredSourceProjection).toMatchObject({
        available: true,
        tracedSourceElementCount: 2,
        provenance: expect.arrayContaining([
          expect.objectContaining({ sourceNodeId: 'pf-source-00002', kind: 'source_node' }),
          expect.objectContaining({ sourceNodeId: 'pf-source-00003', kind: 'source_node' }),
        ]),
      });
      expect(diagnostics.measuredSourceProjection?.provenance).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'synthetic' }),
      ]));
      await expect(fs.readFile(path.join(result.workspaceDir, 'stage-a', 'source-evidence', 'computed-desktop.json'), 'utf8'))
        .resolves.toContain('pf-source-00003');
      await expect(fs.readFile(path.join(result.workspaceDir, 'stage-a', 'source', 'assets', 'team.jpg'), 'utf8'))
        .resolves.toBe('project image bytes');
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('hydrates project-local screenshot references inside the daemon without base64 request payloads', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-evidence-'));
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-project-'));
    try {
      await fs.mkdir(path.join(projectRoot, 'uploads'), { recursive: true });
      await fs.writeFile(path.join(projectRoot, 'uploads', 'reference.png'), 'project screenshot evidence');

      await materializeHandoffBinaryContextFiles(workspace, [{
        name: 'reference.png',
        path: 'uploads/reference.png',
        role: 'reference_screenshot',
        order: 1,
        projectFile: true,
      }], { sourceProjectRoot: projectRoot });

      await expect(fs.readFile(path.join(workspace, 'screenshots', 'reference.png'), 'utf8'))
        .resolves.toBe('project screenshot evidence');
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('never inlines visual evidence as text when a client supplies incorrect MIME metadata', () => {
    const [file] = normalizeHandoffContextFiles([{
      name: 'reference.png',
      path: 'uploads/reference.png',
      role: 'reference_screenshot',
      order: 1,
      mime: 'text/html',
      text: '\u0089PNG binary bytes misdecoded as text',
      projectFile: true,
    }]);

    expect(file).toMatchObject({
      name: 'reference.png',
      mime: 'image/png',
      projectFile: true,
    });
    expect(file).not.toHaveProperty('text');
  });

  it('does not truncate a required saved-page stylesheet before source materialisation', () => {
    const css = `.hero{color:red}\n${'.fixture{padding:1px}\n'.repeat(14_000)}`;
    const [file] = normalizeHandoffContextFiles([{
      name: 'site.css',
      path: 'Anthropic_files/site.css',
      role: 'context',
      order: 1,
      mime: 'text/css',
      text: css,
    }]);

    expect(css.length).toBeGreaterThan(120_000);
    expect(file?.text).toBe(css);
  });

  it('rejects an oversize project-local text resource before daemon hydration', () => {
    const [file] = normalizeHandoffContextFiles([{
      name: 'oversize.css',
      path: 'Saved_files/oversize.css',
      role: 'context',
      order: 1,
      mime: 'text/css',
      size: (2 * 1024 * 1024) + 1,
      projectFile: true,
    }]);

    expect(file).toMatchObject({
      projectFile: true,
      readError: 'Required text resource exceeds the HTML-to-Bricks transfer limit.',
    });
  });

  it('hydrates complete project-local CSS inside the daemon without request-body duplication', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-project-text-context-'));
    const css = `.hero{color:red}\n${'.fixture{padding:1px}\n'.repeat(14_000)}`;
    try {
      await fs.mkdir(path.join(projectRoot, 'Saved_files'), { recursive: true });
      await fs.writeFile(path.join(projectRoot, 'Saved_files', 'site.css'), css, 'utf8');
      const [file] = await hydrateHandoffProjectTextContextFiles(normalizeHandoffContextFiles([{
        name: 'site.css',
        path: 'Saved_files/site.css',
        role: 'context',
        order: 1,
        mime: 'text/css',
        size: Buffer.byteLength(css, 'utf8'),
        projectFile: true,
      }]), projectRoot);

      expect(file?.text).toBe(css);
      expect(file?.readError).toBeUndefined();
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('hydrates exact canonical HTML from a bounded project-local reference', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-primary-html-'));
    const projectRoot = path.join(dataDir, 'projects', 'project-1');
    const html = '<!doctype html><html><body><main>Saved bundle</main></body></html>';
    try {
      await fs.mkdir(path.join(projectRoot, 'bundle'), { recursive: true });
      await fs.writeFile(path.join(projectRoot, 'bundle', 'OpenAI.html'), html, 'utf8');

      await expect(hydrateHandoffPrimaryHtml({
        html: '',
        sourcePath: 'bundle/OpenAI.html',
        htmlProjectFile: {
          projectFile: true,
          path: 'bundle/OpenAI.html',
          size: Buffer.byteLength(html, 'utf8'),
          mime: 'text/html',
        },
      }, projectRoot)).resolves.toBe(html);
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('rejects unsafe or oversize canonical project HTML before conversion', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-primary-html-boundary-'));
    try {
      await expect(hydrateHandoffPrimaryHtml({
        html: '',
        sourcePath: '../escape.html',
        htmlProjectFile: { projectFile: true, path: '../escape.html' },
      }, projectRoot)).rejects.toMatchObject({
        code: 'html_project_file_unsafe',
        status: 422,
      });
      await expect(hydrateHandoffPrimaryHtml({
        html: '',
        sourcePath: 'oversize.html',
        htmlProjectFile: {
          projectFile: true,
          path: 'oversize.html',
          size: (8 * 1024 * 1024) + 1,
        },
      }, projectRoot)).rejects.toMatchObject({
        code: 'html_too_large',
        status: 413,
      });
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('keeps project-local text hydration inside the selected project root', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-project-text-boundary-'));
    try {
      const [file] = await hydrateHandoffProjectTextContextFiles(normalizeHandoffContextFiles([{
        name: 'escape.css',
        path: '../escape.css',
        role: 'context',
        order: 1,
        mime: 'text/css',
        projectFile: true,
      }]), projectRoot);

      expect(file?.readError).toBe('Project-local handoff text could not be resolved safely.');
      expect(file).not.toHaveProperty('text');
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('keeps image-rich saved-page bundles after pre-converter script filtering', () => {
    const files = normalizeHandoffContextFiles(Array.from({ length: 36 }, (_, index) => ({
      name: `asset-${index}.png`,
      path: `Saved_files/asset-${index}.png`,
      role: 'context',
      order: index,
      mime: 'image/png',
      size: 1_024,
      projectFile: true,
    })));

    expect(files).toHaveLength(36);
    expect(files.at(-1)).toMatchObject({
      path: 'Saved_files/asset-35.png',
      projectFile: true,
    });
  });

  it('keeps full live schema data internal and gives Stage B a bounded model workspace', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-stage-b-schema-budget-'));
    try {
      const globalClasses = Array.from({ length: 240 }, (_, index) => ({
        id: `existing-${index}`,
        name: `existing-class-${index}`,
        settings: { _cssCustom: `/* ${'x'.repeat(800)} */` },
      }));
      const result = await convertHtmlForBricksBaseline({
        sourceId: 'bounded-schema-workspace',
        title: 'Bounded schema workspace',
        conversionProfile: 'prototype_bricks',
        html: '<!doctype html><html><body><main><section><h1>Bounded schema</h1><p>Content.</p></section></main></body></html>',
        bricksSchemaSnapshot: {
          source: 'test_live_schema',
          elements: {
            section: {
              name: 'section',
              controls: { _padding: { key: '_padding', type: 'dimensions', valueShape: { kind: 'sided_dimension' } } },
              nativeAbilitySchema: { duplicatedRawTree: 'y'.repeat(250_000) },
            },
          },
          globalClasses,
          breakpoints: [],
        },
      }, {
        projectRoot: path.resolve(process.cwd(), '../..'),
        dataDir,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const catalog = result.artifacts.json.bricksSchemaCatalog as Record<string, unknown>;
      const focused = result.artifacts.json.bricksFocusedSchemas as Record<string, unknown>;
      const plan = result.artifacts.json.conversionPlan as Record<string, unknown>;
      const deltaPacket = result.artifacts.json.deltaPacket as Record<string, unknown>;
      expect(catalog.globalClasses).toEqual([]);
      expect((catalog.globalClassSummary as { count?: number }).count).toBe(240);
      expect(focused.globalClasses).toEqual([]);
      expect((focused.globalClassSummary as { count?: number }).count).toBe(240);
      expect(plan.existingGlobalClasses).toEqual([]);
      expect((plan.existingGlobalClassSummary as { count?: number }).count).toBe(240);
      expect(JSON.stringify(catalog)).not.toContain('duplicatedRawTree');
      expect(JSON.stringify(focused)).not.toContain('duplicatedRawTree');
      expect(JSON.stringify(catalog).length).toBeLessThan(50_000);
      expect(JSON.stringify(focused).length).toBeLessThan(100_000);
      expect(JSON.stringify(plan).length).toBeLessThan(250_000);
      expect(deltaPacket).toMatchObject({
        schema: 'pixflow.html_to_bricks.stage_b_delta.v1',
        sha256: expect.any(String),
        packet: expect.any(Object),
      });
      await expect(fs.readFile(path.join(result.workspaceDir, 'codex-stage-b-prompt.txt'), 'utf8'))
        .resolves.toContain('stage-b-delta-packet.json');
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('rejects the deterministic fallback critique as model-authored evidence', () => {
    expect(isModelAuthoredHandoffCritique([
      '# Stage B Handoff Critique',
      '',
      'Pixflow-owned fallback critique generated by the Stage B normalizer because the runner did not write a full critique artifact.',
    ].join('\n'))).toBe(false);
  });

  it('accepts a substantive model-authored source comparison', () => {
    expect(isModelAuthoredHandoffCritique([
      '# Stage B Handoff Critique',
      '',
      'Compared the Stage A hero hierarchy with Bricks section hero-root.',
      'Repaired the CTA class mapping while preserving the baseline element ids.',
    ].join('\n'))).toBe(true);
  });

  it('does not stream a checkpoint just because equivalent JSON uses different key order', () => {
    expect(stageBMutationPayloadHash({
      content: [{ id: 'hero', settings: { color: 'red', display: 'flex' } }],
      global_classes: [{ id: 'hero-class', settings: { gap: '2rem' } }],
    })).toBe(stageBMutationPayloadHash({
      globalClasses: [{ settings: { gap: '2rem' }, id: 'hero-class' }],
      content: [{ settings: { display: 'flex', color: 'red' }, id: 'hero' }],
    }));
  });

  it('recovers critique evidence from the model own completed comparison and repair messages', () => {
    const events = [
      { type: 'item.completed', item: { type: 'agent_message', text: 'The Stage A source is text-only, so I compared the baseline link and form inventory before repair.' } },
      { type: 'item.completed', item: { type: 'agent_message', text: 'I repaired the missing required field while preserving baseline IDs and global classes.' } },
    ].map((event) => JSON.stringify(event)).join('\n');
    const critique = modelAuthoredCritiqueFromRunnerEventsText(events);
    expect(critique).toContain('Recovered from the Stage B model');
    expect(isModelAuthoredHandoffCritique(critique || '')).toBe(true);
  });

  it('preserves separate completed assistant prose blocks in the shared chat stream', () => {
    const parserState = createRunnerChatParserState();
    const first = convertRunnerJsonLineToChatEvents(JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Compared the Stage A hierarchy.' },
    }), parserState);
    const second = convertRunnerJsonLineToChatEvents(JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Repaired the Bricks payload.' },
    }), parserState);

    expect(first).toEqual([{ kind: 'text', text: 'Compared the Stage A hierarchy.' }]);
    expect(second).toEqual([{ kind: 'text', text: '\n\nRepaired the Bricks payload.' }]);
  });

  it('forwards canonical semantic text and tool events without turning token deltas into paragraphs', () => {
    const parserState = createRunnerChatParserState();
    const events = [
      { type: 'text_delta', delta: 'Live ' },
      { type: 'text_delta', delta: 'reply' },
      { type: 'tool_use', id: 'read-1', name: 'Read', input: { path: 'index.html' } },
      { type: 'tool_result', toolUseId: 'read-1', content: 'ok', isError: false },
    ].flatMap((event) => convertRunnerJsonLineToChatEvents(JSON.stringify(event), parserState));

    expect(events).toEqual([
      { kind: 'text', text: 'Live ' },
      { kind: 'text', text: 'reply' },
      { kind: 'tool_use', id: 'read-1', name: 'Read', input: { path: 'index.html' } },
      { kind: 'tool_result', toolUseId: 'read-1', content: 'ok', isError: false },
    ]);
  });

  it('streams OpenCode Stage B text, tools, and usage through the shared chat event shape', () => {
    const parserState = createRunnerChatParserState();
    const events = [
      { type: 'step_start', sessionID: 'ses-1', part: { type: 'step-start' } },
      { type: 'text', sessionID: 'ses-1', part: { type: 'text', text: 'Inspecting the generated card.' } },
      {
        type: 'tool_use',
        sessionID: 'ses-1',
        part: {
          type: 'tool',
          tool: 'todowrite',
          callID: 'call-1',
          state: {
            status: 'completed',
            input: { todos: [{ content: 'Configure native loop', status: 'in_progress', priority: 'high' }] },
            output: 'updated',
          },
        },
      },
      { type: 'step_finish', sessionID: 'ses-1', part: { type: 'step-finish', tokens: { input: 11, output: 7 } } },
    ].flatMap((event) => convertRunnerJsonLineToChatEvents(JSON.stringify(event), parserState));

    expect(events).toEqual([
      { kind: 'status', label: 'running' },
      { kind: 'text', text: 'Inspecting the generated card.' },
      {
        kind: 'tool_use',
        id: 'call-1',
        name: 'todowrite',
        input: { todos: [{ content: 'Configure native loop', status: 'in_progress', priority: 'high' }] },
      },
      { kind: 'tool_result', toolUseId: 'call-1', content: 'updated', isError: false },
      { kind: 'usage', inputTokens: 11, outputTokens: 7 },
    ]);
  });

  it('emits granular ID-based mutation events between Stage B checkpoints', () => {
    const batch = buildStageBMutationBatch({
      content: [
        { id: 'hero', name: 'section', settings: { color: 'red' } },
        { id: 'old', name: 'text' },
      ],
      global_classes: [{ id: 'class-a', name: 'hero', settings: { gap: '1rem' } }],
    }, {
      content: [
        { id: 'new', name: 'heading' },
        { id: 'hero', name: 'section', settings: { color: 'blue', _cssGlobalClasses: ['class-a'] } },
      ],
      global_classes: [
        { id: 'class-a', name: 'hero', settings: { gap: '2rem' } },
        { id: 'class-unused', name: 'unused', settings: { color: 'red' } },
      ],
      stage_b_font_system: { fonts: [] },
      status: 'repairing',
    }, { sequence: 2, source: 'draft' });

    expect(batch?.events.map((event) => event.type)).toEqual([
      'remove', 'add', 'patch', 'reorder', 'classes', 'sidecar_delta', 'focus', 'checkpoint',
    ]);
    expect(batch?.checkpointId).toMatch(/^draft-2-/);
    expect(batch?.events.at(-1)).toMatchObject({
      type: 'checkpoint',
      elementIds: ['new', 'hero'],
      globalClassCount: 1,
      globalClassIds: ['class-a'],
    });
  });
});
