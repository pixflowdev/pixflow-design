import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BRICKS_FRONTEND_VISUAL_SETTLE_MS,
  BRICKS_FINAL_VISUAL_VIEWPORTS,
  BRICKS_HANDOFF_STREAM_IDLE_TIMEOUT_MS,
  buildStageBMutationTimelineEvents,
  buildFinalBricksVisualEvidence,
  buildHandoffLocalMediaAssets,
  collectHandoffLocalMediaAssetReferences,
  compactBricksHandoffResultForWordPressApply,
  evaluateFinalBricksVisualQuality,
  evaluateHandoffQa,
  resolveFinalBricksVisualDisposition,
  selectFinalBricksVisualViewports,
  buildPersistedBricksElementIdMap,
  buildPersistedBricksGlobalClassIdByName,
  buildPersistedBricksGlobalClassIdMap,
  describeStageBMutationCheckpointFailure,
  fetchPixflowHandoffContextFiles,
  prepareHandoffPrimaryHtmlTransfer,
  fetchBricksHandoffStreamWithRetry,
  fullPageBricksMutationRequiresCanvasRefresh,
  liveBricksBaselineCountsMatch,
  resolveBuildInBricksScopedMutationOwnership,
  readBricksHandoffStreamResponse,
  restorePreHandoffBricksSnapshot,
  restoreBricksMutationTransaction,
  restoreVerifiedBricksBaselineCheckpoint,
  shouldStreamStageBMutationToLiveCanvas,
  translateStageBMutationBatchIds,
} from '../../src/pixflow/bricks-initial-insert';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Bricks handoff Stage B stream lifecycle', () => {
  it('replaces the previously owned scoped Build fragment instead of appending a duplicate', () => {
    expect(resolveBuildInBricksScopedMutationOwnership({
      generationScope: 'section',
      retainedSourceOwnership: {
        sourceId: 'source-1',
        convertedElementIds: ['root-1', 'child-1', 'root-1'],
        convertedGlobalClassIds: ['class-1'],
        fragmentNamespace: 'testimonial',
        placement: null,
      },
    })).toEqual({
      scopedInsert: true,
      retainedScopedReplacement: true,
      replaceExisting: false,
      replaceElementIds: ['root-1', 'child-1'],
      replaceGlobalClassIds: ['class-1'],
      liveOperation: 'set',
    });

    expect(resolveBuildInBricksScopedMutationOwnership({
      generationScope: 'section',
    })).toMatchObject({
      retainedScopedReplacement: false,
      replaceExisting: false,
      replaceElementIds: undefined,
      liveOperation: 'insert',
    });
  });

  it('treats post-conversion quality findings as warnings instead of withholding the Bricks build', () => {
    expect(evaluateHandoffQa({
      status: 'failed',
      blocking: true,
      score: 40,
      issues: [{ severity: 'p0', message: 'A converter fidelity issue remains.' }],
      qualityGate: { passed: false, failures: ['P0 issues remaining: 1'] },
    })).toMatchObject({
      ok: true,
      assessmentStatus: 'failed',
      message: expect.stringContaining('Structural QA'),
      warnings: expect.arrayContaining([
        expect.stringContaining('Structural QA score'),
      ]),
    });
  });

  it('verifies scoped baseline inserts by their generated IDs without rejecting page-owned elements or classes', () => {
    const ack = {
      ok: true as const,
      status: 'applied_verified' as const,
      checkpointId: 'converter-scoped',
      sequence: 0,
      payloadHash: 'hash',
      observed: { elementCount: 24, globalClassCount: 18 },
    };

    expect(liveBricksBaselineCountsMatch({
      scopedInsert: true,
      ack,
      expectedElementCount: 12,
      expectedGlobalClassCount: 9,
    })).toBe(true);
    expect(liveBricksBaselineCountsMatch({
      scopedInsert: false,
      ack,
      expectedElementCount: 12,
      expectedGlobalClassCount: 9,
    })).toBe(false);
  });

  it('keeps an applied Bricks result when final visual comparison remains below target', () => {
    expect(resolveFinalBricksVisualDisposition({
      verification: {
        ok: true,
        frontendUrl: 'https://example.test/page',
        screenshots: ['desktop.png', 'mobile.png'],
        report: 'visual-report.json',
        qualityPassed: false,
        repairEvidence: { issues: ['desktop mismatch'] },
        errors: [],
      },
      visualRepairAttempt: 1,
    })).toBe('keep_with_warning');
  });

  it('keeps an applied Bricks result when final visual capture is unavailable', () => {
    expect(resolveFinalBricksVisualDisposition({
      verification: {
        ok: false,
        frontendUrl: 'https://example.test/missing',
        screenshots: [],
        report: null,
        qualityPassed: null,
        errors: ['Captured page returned a WordPress 404 response.'],
      },
      visualRepairAttempt: 0,
    })).toBe('keep_with_warning');
  });

  it('keeps the first safe below-target render without launching a parity repair', () => {
    expect(resolveFinalBricksVisualDisposition({
      verification: {
        ok: true,
        frontendUrl: 'https://example.test/page',
        screenshots: ['desktop.png', 'mobile.png'],
        report: 'visual-report.json',
        qualityPassed: false,
        repairEvidence: { issues: ['desktop mismatch'] },
        errors: [],
      },
      visualRepairAttempt: 0,
    })).toBe('keep_with_warning');
  });

  it('gates the final Bricks render at desktop, Bricks base-width, and mobile viewports', () => {
    expect(BRICKS_FINAL_VISUAL_VIEWPORTS.length).toBe(3);
    expect(BRICKS_FINAL_VISUAL_VIEWPORTS).toEqual([
      { id: 'desktop-top', width: 1440, height: 1000, scrollPosition: 'top' },
      { id: 'bricks-base', width: 992, height: 844, scrollPosition: 'top' },
      { id: 'mobile-top', width: 390, height: 844, scrollPosition: 'top' },
    ]);
    expect(selectFinalBricksVisualViewports(['source-desktop.png', 'source-mobile.png'])).toEqual(
      BRICKS_FINAL_VISUAL_VIEWPORTS,
    );
    expect(selectFinalBricksVisualViewports(['source-desktop-bottom.png', 'source-mobile-middle.png']))
      .toEqual(expect.arrayContaining([
        { id: 'desktop-bottom', width: 1440, height: 1000, scrollPosition: 'bottom' },
        { id: 'mobile-middle', width: 390, height: 844, scrollPosition: 'middle' },
      ]));
  });

  it('resolves only project-contained local media referenced by the Bricks result', () => {
    expect(collectHandoffLocalMediaAssetReferences({
      content: [
        {
          id: 'device',
          name: 'image',
          settings: { image: { url: '../source/assets/device.svg' } },
        },
      ],
      global_classes: [
        {
          id: 'hero',
          settings: {
            _cssCustom: 'background:url("../source/assets/hero.webp") center/cover; mask-image:url(../../../../secret.png)',
          },
        },
      ],
      stage_b_font_system: {
        fonts: [{
          family: 'Exact Sans',
          provider: 'local_asset',
          sourceRefs: ['../source/assets/fonts/exact-sans.woff2'],
        }],
      },
    }, 'stage-a/compiled/index.html')).toEqual([
      {
        ref: '../source/assets/device.svg',
        projectPath: 'stage-a/source/assets/device.svg',
      },
      {
        ref: '../source/assets/hero.webp',
        projectPath: 'stage-a/source/assets/hero.webp',
      },
      {
        ref: '../source/assets/fonts/exact-sans.woff2',
        projectPath: 'stage-a/source/assets/fonts/exact-sans.woff2',
      },
    ]);
  });

  it('discovers local media embedded in converter-owned rich HTML attributes', () => {
    expect(collectHandoffLocalMediaAssetReferences({
      content: [{
        name: 'html',
        settings: {
          text: '<picture><source srcset="assets/card.webp 1x, https://cdn.example/card@2x.webp 2x"><img src="./Saved_files/team.jpg" poster="assets/poster.png"></picture>',
        },
      }],
    }, 'stage-a/compiled/index.html')).toEqual([
      { ref: 'assets/card.webp', projectPath: 'stage-a/compiled/assets/card.webp' },
      { ref: './Saved_files/team.jpg', projectPath: 'stage-a/compiled/Saved_files/team.jpg' },
      { ref: 'assets/poster.png', projectPath: 'stage-a/compiled/assets/poster.png' },
    ]);
  });

  it('ignores local media examples inside HTML comments without hiding live assets', () => {
    expect(collectHandoffLocalMediaAssetReferences({
      content: [{
        name: 'html',
        settings: {
          text: [
            '<span class="tst__logo">',
            '<!-- swap for real logo: <img class="tst__logo-img" src="logo.svg" alt="Company"> -->',
            '<svg viewBox="0 0 24 24" aria-hidden="true"></svg>',
            '<img src="assets/live-logo.svg" alt="Live company logo">',
            '</span>',
          ].join(''),
        },
      }],
    }, 'stage-a/compiled/index.html')).toEqual([
      { ref: 'assets/live-logo.svg', projectPath: 'stage-a/compiled/assets/live-logo.svg' },
    ]);
  });

  it('materializes required local media as a bounded WordPress handoff bundle', async () => {
    const fetchMock = vi.fn(async () => new Response('<svg/>', {
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const assets = await buildHandoffLocalMediaAssets('project-1', 'stage-a/compiled/index.html', {
      content: [{ name: 'image', settings: { image: { url: '../source/assets/device.svg' } } }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/stage-a/source/assets/device.svg',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(assets).toEqual([expect.objectContaining({
      ref: '../source/assets/device.svg',
      projectPath: 'stage-a/source/assets/device.svg',
      filename: 'device.svg',
      mimeType: 'image/svg+xml',
      contentBase64: 'PHN2Zy8+',
      sizeBytes: 6,
    })]);
  });

  it('recovers an exact legacy WordPress flattened bundle asset after the canonical path 404s', async () => {
    const fetchMock = vi.fn(async (url: string) => (
      url.endsWith('/raw/Alexium_files/hero.jpg')
        ? new Response('', { status: 404 })
        : new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          })
    ));
    vi.stubGlobal('fetch', fetchMock);

    const assets = await buildHandoffLocalMediaAssets('project-1', 'Alexium.html', {
      content: [{ name: 'image', settings: { image: { url: 'Alexium_files/hero.jpg' } } }],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/projects/project-1/raw/Alexium_files/hero.jpg',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-1/raw/Alexium_files_hero.jpg',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(assets).toEqual([expect.objectContaining({
      ref: 'Alexium_files/hero.jpg',
      projectPath: 'Alexium_files/hero.jpg',
      filename: 'hero.jpg',
      sizeBytes: 3,
    })]);
  });

  it('uses one bundled placeholder for missing local images and skips other unavailable media', async () => {
    const placeholderUrl = 'https://example.test/wp-content/plugins/pixflow-ai/assets/builder/img-placeholder.webp';
    const fetchMock = vi.fn(async (url: string) => (
      url === placeholderUrl
        ? new Response(new Uint8Array([8, 6, 4]), {
            status: 200,
            headers: { 'content-type': 'image/webp' },
          })
        : new Response('', { status: 404 })
    ));
    vi.stubGlobal('fetch', fetchMock);

    const assets = await buildHandoffLocalMediaAssets('project-1', 'index.html', {
      content: [{
        name: 'html',
        settings: {
          text: '<img src="missing-photo.png"><img src="missing-logo.svg"><audio src="missing-audio.mp3"></audio>',
        },
      }],
    }, undefined, [], placeholderUrl);

    expect(fetchMock.mock.calls.filter(([url]) => url === placeholderUrl)).toHaveLength(1);
    expect(assets).toEqual([
      expect.objectContaining({
        ref: 'missing-photo.png',
        projectPath: 'missing-photo.png',
        filename: 'pixflow-missing-media-placeholder.webp',
        mimeType: 'image/webp',
        sizeBytes: 3,
      }),
      expect.objectContaining({
        ref: 'missing-logo.svg',
        projectPath: 'missing-logo.svg',
        filename: 'pixflow-missing-media-placeholder.webp',
        mimeType: 'image/webp',
        sizeBytes: 3,
      }),
    ]);
  });

  it('keeps authored image files as Stage A assets instead of reclassifying them as screenshots', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })));

    const [asset] = await fetchPixflowHandoffContextFiles('project-1', [{
      name: 'team.jpg',
      path: 'stage-a/source/assets/team.jpg',
      role: 'asset',
      mime: 'image/jpeg',
      kind: 'binary',
      artifactKind: null,
      size: 3,
      mtime: 1,
      title: null,
      identifier: null,
      order: 1,
    }]);

    expect(asset).toMatchObject({
      role: 'asset',
      path: 'stage-a/source/assets/team.jpg',
      projectFile: true,
    });
  });

  it('transfers a complete saved-page stylesheet by bounded project reference instead of duplicating it in JSON', async () => {
    const css = `.hero{color:red}\n${'.fixture{padding:1px}\n'.repeat(14_000)}`;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const [stylesheet] = await fetchPixflowHandoffContextFiles('project-1', [{
      name: 'site.css',
      path: 'Anthropic_files/site.css',
      role: 'context',
      mime: 'text/css',
      kind: 'text',
      artifactKind: null,
      size: css.length,
      mtime: 1,
      title: null,
      identifier: null,
      order: 1,
    }]);

    expect(css.length).toBeGreaterThan(120_000);
    expect(stylesheet).toMatchObject({
      path: 'Anthropic_files/site.css',
      mime: 'text/css',
      projectFile: true,
      size: css.length,
    });
    expect(stylesheet).not.toHaveProperty('text');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a 27-file saved-page context request complete and below the daemon JSON ceiling', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const files = Array.from({ length: 27 }, (_, index) => ({
      name: `bundle-${index}.css`,
      path: `OpenAI_files/bundle-${index}.css`,
      role: 'context' as const,
      mime: 'text/css',
      kind: 'text',
      artifactKind: null,
      size: 250_000,
      mtime: index + 1,
      title: null,
      identifier: null,
      order: index + 1,
    }));

    const context = await fetchPixflowHandoffContextFiles('project-1', files);

    expect(context).toHaveLength(27);
    expect(context.every((file) => file.projectFile === true && !('text' in file))).toBe(true);
    expect(JSON.stringify(context).length).toBeLessThan(20_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends canonical saved-page HTML by project reference without fetching or serializing its bytes', async () => {
    const readHtml = vi.fn(async () => '<!doctype html><html><body>should not be read</body></html>');
    const transfer = await prepareHandoffPrimaryHtmlTransfer(
      {
        projectId: 'project-1',
        generationScope: 'full_page',
        conversionProfile: 'uploaded_html',
        stageASource: null,
      } as never,
      {
        name: 'OpenAI.html',
        path: 'OpenAI.html',
        kind: 'text',
        mime: 'text/html',
        artifactKind: null,
        size: 1_761_676,
        mtime: 1,
        title: null,
        identifier: null,
      },
      'OpenAI.html',
      undefined,
      readHtml,
    );

    expect(transfer).toEqual({
      htmlProjectFile: {
        projectFile: true,
        path: 'OpenAI.html',
        size: 1_761_676,
        mime: 'text/html',
      },
    });
    expect(JSON.stringify(transfer).length).toBeLessThan(150);
    expect(readHtml).not.toHaveBeenCalled();
  });

  it('keeps synthesized split or scoped Stage A HTML inline', async () => {
    const readHtml = vi.fn(async () => '<!doctype html><html><body>synthesized</body></html>');
    const transfer = await prepareHandoffPrimaryHtmlTransfer(
      {
        projectId: 'project-1',
        generationScope: 'full_page',
        conversionProfile: 'prototype_bricks',
        stageASource: {
          format: 'split_html_css_js',
          sourcePath: 'stage-a/source/index.html',
          compiledPath: 'stage-a/compiled/index.html',
          htmlPath: 'stage-a/source/index.html',
          cssPath: 'stage-a/source/styles.css',
          jsPath: null,
        },
      } as never,
      {
        name: 'index.html',
        path: 'stage-a/compiled/index.html',
        kind: 'text',
        mime: 'text/html',
        artifactKind: null,
        size: 100,
        mtime: 1,
        title: null,
        identifier: null,
      },
      'stage-a/compiled/index.html',
      undefined,
      readHtml,
    );

    expect(transfer).toEqual({ html: '<!doctype html><html><body>synthesized</body></html>' });
    expect(readHtml).toHaveBeenCalledOnce();
  });

  it('retries a transient pre-stream bridge drop with the same request', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const init: RequestInit = { method: 'POST', body: '{"requestId":"same"}' };

    const response = await fetchBricksHandoffStreamWithRetry('/convert-stream', init, {
      maxAttempts: 3,
      retryDelaysMs: [0, 0],
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]).toEqual(fetchMock.mock.calls[1]);
  });
  it('accepts a source-fidelity clone whose pixels are near-exact despite flattened Bricks wrapper geometry', () => {
    const captures = BRICKS_FINAL_VISUAL_VIEWPORTS.map(({ id: viewport }) => ({
      viewport,
      comparison: {
        passed: true,
        differenceRatio: viewport.startsWith('desktop') ? 0.0032 : 0.0035,
        meanAbsoluteChannelDifference: 0.45,
        maximumTileDifferenceRatio: viewport.startsWith('desktop') ? 0.0632 : 0.0409,
        maximumTileMeanAbsoluteChannelDifference: 1.4,
        maximumTopBandTileDifferenceRatio: 0,
      },
      fidelity: {
        passed: false,
        matchCoverage: 0.8571,
      },
    }));

    expect(evaluateFinalBricksVisualQuality({
      captureComplete: true,
      captures,
      sourceFidelityClone: true,
    })).toEqual({
      pixelPassed: true,
      fidelityPassed: false,
      pixelExactOverridePassed: true,
      qualityPassed: true,
    });
  });

  it('does not use the near-exact pixel override for ordinary Prototype Bricks runs or weak tiles', () => {
    const captures = BRICKS_FINAL_VISUAL_VIEWPORTS.map(({ id: viewport }) => ({
      viewport,
      comparison: {
        passed: true,
        differenceRatio: 0.004,
        meanAbsoluteChannelDifference: 0.5,
        maximumTileDifferenceRatio: viewport.startsWith('desktop') ? 0.12 : 0.04,
        maximumTileMeanAbsoluteChannelDifference: 1.5,
        maximumTopBandTileDifferenceRatio: 0,
      },
      fidelity: {
        passed: false,
        matchCoverage: 0.9,
      },
    }));

    expect(evaluateFinalBricksVisualQuality({
      captureComplete: true,
      captures,
      sourceFidelityClone: true,
    }).qualityPassed).toBe(false);
    expect(evaluateFinalBricksVisualQuality({
      captureComplete: true,
      captures: captures.map((capture) => ({
        ...capture,
        comparison: { ...capture.comparison, maximumTileDifferenceRatio: 0.04 },
      })),
      sourceFidelityClone: false,
    }).qualityPassed).toBe(false);
  });

  it('binds final visual evidence to the exact serialized Bricks result', () => {
    const resultSignature = { sha256: 'a'.repeat(64), size: 412 };
    expect(buildFinalBricksVisualEvidence({ status: 'passed' }, resultSignature)).toMatchObject({
      schema: 'pixflow.prototype_bricks.final_visual_evidence.v2',
      status: 'passed',
      resultSignature,
    });
  });

  it('reloads the Bricks canvas for an atomic full-page replacement before verifying it', () => {
    expect(fullPageBricksMutationRequiresCanvasRefresh({
      operation: 'set',
      replaceExisting: true,
    })).toBe(true);
    expect(fullPageBricksMutationRequiresCanvasRefresh({
      operation: 'patch',
      replaceExisting: false,
    })).toBe(false);
  });

  it('waits for the Bricks frontend to settle before visual acceptance capture', () => {
    expect(BRICKS_FRONTEND_VISUAL_SETTLE_MS).toBeGreaterThanOrEqual(4_000);
  });

  it('retargets Stage B events from baseline ids to WordPress-persisted Bricks ids', () => {
    const idMap = buildPersistedBricksElementIdMap(
      [
        { id: 'source-root', name: 'section', parent: '', children: ['source-copy'] },
        { id: 'source-copy', name: 'text-basic', parent: 'source-root', children: [] },
      ],
      [
        { id: 'live-root', name: 'section', parent: '', children: ['live-copy'] },
        { id: 'live-copy', name: 'text-basic', parent: 'live-root', children: [] },
      ],
    );

    expect(idMap).toEqual({
      'source-root': 'live-root',
      'source-copy': 'live-copy',
    });
    expect(translateStageBMutationBatchIds({
      schema: 'pixflow.bricks.mutation.v1',
      sequence: 1,
      source: 'result',
      checkpointId: 'result-1-hash',
      payloadHash: 'hash',
      events: [
        { type: 'patch', patches: [{ id: 'source-root', changes: { children: ['source-copy'] } }] },
        { type: 'reorder', orderedIds: ['source-root', 'source-copy'] },
        { type: 'focus', elementId: 'source-copy' },
        {
          type: 'checkpoint',
          checkpointId: 'result-1-hash',
          payloadHash: 'hash',
          elementCount: 2,
          elementIds: ['source-root', 'source-copy'],
          globalClassCount: 0,
          globalClassIds: [],
        },
      ],
    }, idMap)).toEqual(expect.objectContaining({
      events: [
        { type: 'patch', patches: [{ id: 'live-root', changes: { children: ['live-copy'] } }] },
        { type: 'reorder', orderedIds: ['live-root', 'live-copy'] },
        { type: 'focus', elementId: 'live-copy' },
        expect.objectContaining({ type: 'checkpoint', elementIds: ['live-root', 'live-copy'] }),
      ],
    }));
  });

  it('retargets persisted class ids through class deltas, element settings, and checkpoints', () => {
    const globalClassIdMap = buildPersistedBricksGlobalClassIdMap(
      [
        { id: 'source-layout', name: 'ns-hero__inner' },
        { id: 'source-action', name: 'ns-action' },
      ],
      [
        { id: 'live-action', name: 'ns-action' },
        { id: 'live-layout', name: 'ns-hero__inner' },
      ],
    );

    expect(globalClassIdMap).toEqual({
      'source-layout': 'live-layout',
      'source-action': 'live-action',
    });
    expect(translateStageBMutationBatchIds({
      schema: 'pixflow.bricks.mutation.v1',
      sequence: 2,
      source: 'result',
      checkpointId: 'result-2-hash',
      payloadHash: 'hash',
      events: [
        {
          type: 'add',
          elements: [{
            id: 'source-root',
            name: 'section',
            parent: '',
            children: [],
            settings: { _cssGlobalClasses: ['source-layout', 'new-class'] },
          }],
        },
        {
          type: 'classes',
          upsert: [{ id: 'source-layout', name: 'ns-hero__inner', settings: { _display: 'flex' } }],
          removeIds: ['source-action'],
        },
        {
          type: 'checkpoint',
          checkpointId: 'result-2-hash',
          payloadHash: 'hash',
          elementCount: 1,
          elementIds: ['source-root'],
          globalClassCount: 3,
          globalClassIds: ['source-layout', 'source-action', 'new-class'],
        },
      ],
    }, { 'source-root': 'live-root' }, globalClassIdMap)).toEqual(expect.objectContaining({
      events: [
        expect.objectContaining({
          type: 'add',
          elements: [expect.objectContaining({
            id: 'live-root',
            settings: { _cssGlobalClasses: ['live-layout', 'new-class'] },
          })],
        }),
        expect.objectContaining({
          type: 'classes',
          upsert: [expect.objectContaining({ id: 'live-layout' })],
          removeIds: ['live-action'],
        }),
        expect.objectContaining({
          type: 'checkpoint',
          elementIds: ['live-root'],
          globalClassIds: ['live-layout', 'live-action', 'new-class'],
        }),
      ],
    }));
  });

  it('retargets repaired class ids by name when Bricks already persisted that class', () => {
    const persistedByName = buildPersistedBricksGlobalClassIdByName([
      { id: 'live-form', name: 'lumio-form' },
      { id: 'live-shell', name: 'lumio-shell' },
    ]);
    const translated = translateStageBMutationBatchIds({
      schema: 'pixflow.bricks.mutation.v1',
      sequence: 3,
      source: 'result',
      checkpointId: 'result-3-hash',
      payloadHash: 'hash',
      events: [
        {
          type: 'classes',
          upsert: [{ id: 'repair-form', name: 'lumio-form', settings: { _display: 'flex' } }],
          removeIds: [],
        },
        {
          type: 'patch',
          patches: [{ id: 'form-element', changes: { settings: { _cssGlobalClasses: ['repair-form'] } } }],
        },
        {
          type: 'checkpoint',
          checkpointId: 'result-3-hash',
          payloadHash: 'hash',
          elementCount: 1,
          elementIds: ['form-element'],
          globalClassCount: 2,
          globalClassIds: ['repair-form', 'source-shell'],
        },
      ],
    }, {}, { 'source-shell': 'live-shell' }, persistedByName);

    expect(translated.events).toEqual([
      expect.objectContaining({
        type: 'classes',
        upsert: [expect.objectContaining({ id: 'live-form', name: 'lumio-form' })],
      }),
      expect.objectContaining({
        type: 'patch',
        patches: [expect.objectContaining({
          changes: { settings: { _cssGlobalClasses: ['live-form'] } },
        })],
      }),
      expect.objectContaining({
        type: 'checkpoint',
        globalClassIds: ['live-form', 'live-shell'],
      }),
    ]);
  });

  it('keeps scoped Stage B drafts off the existing live page until the atomic final apply', () => {
    expect(shouldStreamStageBMutationToLiveCanvas('full_page')).toBe(true);
    expect(shouldStreamStageBMutationToLiveCanvas(undefined)).toBe(true);
    expect(shouldStreamStageBMutationToLiveCanvas('section')).toBe(false);
    expect(shouldStreamStageBMutationToLiveCanvas('component')).toBe(false);
    expect(shouldStreamStageBMutationToLiveCanvas('full_page', false)).toBe(false);
  });

  it('treats an interim live checkpoint rejection as recoverable before the atomic final apply', () => {
    expect(describeStageBMutationCheckpointFailure({
      schema: 'pixflow.bricks.mutation.v1',
      sequence: 1,
      source: 'result',
      checkpointId: 'result-1-deadbeef',
      payloadHash: 'deadbeef',
      events: [],
    }, {
      ok: false,
      status: 'rejected',
      checkpointId: 'result-1-deadbeef',
      sequence: 1,
      payloadHash: 'deadbeef',
      observed: { elementCount: 168, globalClassCount: 65 },
      message: 'one class was still reconciling',
    })).toContain('one class was still reconciling');

    expect(describeStageBMutationCheckpointFailure({
      schema: 'pixflow.bricks.mutation.v1',
      sequence: 1,
      source: 'result',
      checkpointId: 'result-1-deadbeef',
      payloadHash: 'deadbeef',
      events: [],
    }, {
      ok: true,
      status: 'applied_verified',
      checkpointId: 'result-1-deadbeef',
      sequence: 1,
      payloadHash: 'deadbeef',
      observed: { elementCount: 168, globalClassCount: 66 },
    })).toBeNull();
  });

  it('represents Stage B mutation application as a canonical tool timeline', () => {
    const batch = {
      schema: 'pixflow.bricks.mutation.v1' as const,
      sequence: 2,
      source: 'draft' as const,
      checkpointId: 'draft-2-deadbeef',
      payloadHash: 'deadbeef',
      events: [
        { type: 'patch' as const, patches: [{ id: 'hero', changes: { settings: { text: 'Updated' } } }] },
        {
          type: 'checkpoint' as const,
          checkpointId: 'draft-2-deadbeef',
          payloadHash: 'deadbeef',
          elementCount: 1,
          elementIds: ['hero'],
          globalClassCount: 0,
          globalClassIds: [],
        },
      ],
    };

    expect(buildStageBMutationTimelineEvents(batch, 'started')).toEqual([{
      kind: 'tool_use',
      id: 'stage-b-mutation:draft-2-deadbeef',
      name: 'Bricks mutation',
      input: {
        checkpointId: 'draft-2-deadbeef',
        sequence: 2,
        source: 'draft',
        operations: ['patch', 'checkpoint'],
      },
    }]);
    expect(buildStageBMutationTimelineEvents(batch, 'verified')).toEqual([{
      kind: 'tool_result',
      toolUseId: 'stage-b-mutation:draft-2-deadbeef',
      content: 'Applied and verified Stage B checkpoint draft-2-deadbeef.',
      isError: false,
    }]);
  });

  it('restores and verifies the persisted baseline when the final Stage B result is rejected', async () => {
    const persistBaseline = vi.fn(async () => ({
      ok: true,
      persisted: { ok: true, contentMatches: true },
      livePayload: {
        content: [{ id: 'baseline-root', name: 'section', parent: '' }],
        globalClasses: [{ id: 'baseline-class', name: 'Baseline' }],
      },
    }));
    const onLiveMutation = vi.fn(async (mutation: Record<string, unknown>) => ({
      ok: true as const,
      status: 'applied_verified' as const,
      checkpointId: String(mutation.checkpointId),
      sequence: Number.MAX_SAFE_INTEGER,
      payloadHash: String(mutation.payloadHash),
      observed: { elementCount: 1, globalClassCount: 1 },
    }));

    const rollback = await restoreVerifiedBricksBaselineCheckpoint({
      postId: 539,
      persistBaseline,
      onLiveMutation,
    });

    expect(rollback).toEqual(expect.objectContaining({
      attempted: true,
      ok: true,
      persisted: true,
      canvasVerified: true,
    }));
    expect(persistBaseline).toHaveBeenCalledTimes(1);
    expect(onLiveMutation).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'set',
      postId: 539,
      phase: 'stage_b_rollback',
      replaceExisting: true,
      elements: [{ id: 'baseline-root', name: 'section', parent: '' }],
      globalClasses: [{ id: 'baseline-class', name: 'Baseline' }],
    }));
  });

  it('does not claim a rollback succeeded until WordPress persistence is verified', async () => {
    const onLiveMutation = vi.fn();
    const rollback = await restoreVerifiedBricksBaselineCheckpoint({
      postId: 539,
      persistBaseline: async () => ({
        ok: false,
        message: 'content hash mismatch',
        persisted: { ok: false, contentMatches: false },
      }),
      onLiveMutation,
    });

    expect(rollback).toEqual(expect.objectContaining({
      attempted: true,
      ok: false,
      persisted: false,
      canvasVerified: false,
      message: 'content hash mismatch',
    }));
    expect(onLiveMutation).not.toHaveBeenCalled();
  });

  it('restores the exact pre-run snapshot after a terminal Stage B failure', async () => {
    const rollbackSnapshot = vi.fn(async () => ({
      ok: true,
      persisted: { ok: true, contentMatches: true },
      livePayload: {
        elements: [{ id: 'original-root', name: 'section', parent: '' }],
        globalClasses: [{ id: 'original-class', name: 'Original' }],
      },
    }));
    const onLiveMutation = vi.fn(async (mutation: Record<string, unknown>) => ({
      ok: true as const,
      status: 'applied_verified' as const,
      checkpointId: String(mutation.checkpointId),
      sequence: Number.MAX_SAFE_INTEGER,
      payloadHash: String(mutation.payloadHash),
      observed: { elementCount: 1, globalClassCount: 1 },
    }));

    const rollback = await restorePreHandoffBricksSnapshot({
      postId: 539,
      snapshotId: 'pre-run-snapshot',
      rollbackSnapshot,
      onLiveMutation,
    });

    expect(rollback).toEqual(expect.objectContaining({
      attempted: true,
      ok: true,
      persisted: true,
      canvasVerified: true,
    }));
    expect(rollbackSnapshot).toHaveBeenCalledTimes(1);
    expect(onLiveMutation).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'set',
      postId: 539,
      phase: 'pre_handoff_rollback',
      replaceExisting: true,
      elements: [{ id: 'original-root', name: 'section', parent: '' }],
      globalClasses: [{ id: 'original-class', name: 'Original' }],
    }));
  });

  it('unwinds Stage B to baseline before restoring the pre-run snapshot', async () => {
    const rollbackSnapshot = vi.fn(async (snapshotId: string) => ({
      ok: true,
      persisted: { ok: true, contentMatches: true },
      livePayload: {
        elements: [{ id: `${snapshotId}-root`, name: 'section', parent: '' }],
        globalClasses: [{ id: `${snapshotId}-class`, name: snapshotId }],
      },
    }));
    const onLiveMutation = vi.fn(async (mutation: Record<string, unknown>) => ({
      ok: true as const,
      status: 'applied_verified' as const,
      checkpointId: String(mutation.checkpointId),
      sequence: Number.MAX_SAFE_INTEGER,
      payloadHash: String(mutation.payloadHash),
      observed: { elementCount: 1, globalClassCount: 1 },
    }));

    const rollback = await restoreBricksMutationTransaction({
      postId: 539,
      stageBToBaselineSnapshotId: 'stage-b-to-baseline',
      baselineToPreRunSnapshotId: 'baseline-to-pre-run',
      rollbackSnapshot,
      onLiveMutation,
    });

    expect(rollbackSnapshot.mock.calls.map(([snapshotId]) => snapshotId)).toEqual([
      'stage-b-to-baseline',
      'baseline-to-pre-run',
    ]);
    expect(onLiveMutation.mock.calls.map(([mutation]) => mutation.phase)).toEqual([
      'stage_b_to_baseline_rollback',
      'baseline_to_pre_run_rollback',
    ]);
    expect(rollback).toEqual(expect.objectContaining({
      attempted: true,
      ok: true,
      stageBToBaseline: expect.objectContaining({ ok: true }),
      baselineToPreRun: expect.objectContaining({ ok: true }),
    }));
  });

  it('keeps Stage A screenshot evidence as a project-local reference instead of inflating the Stage B JSON request', async () => {
    const screenshot = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const fetchMock = vi.fn(async () => new Response(screenshot, {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const files = await fetchPixflowHandoffContextFiles('stage-a-project', [{
      name: 'desktop.png',
      path: 'stage-a/screenshots/desktop.png',
      role: 'reference_screenshot',
      order: 1,
      mime: 'image/png',
      size: screenshot.byteLength,
    }] as never);

    expect(files).toEqual([expect.objectContaining({
      path: 'stage-a/screenshots/desktop.png',
      role: 'reference_screenshot',
      projectFile: true,
      size: screenshot.byteLength,
    })]);
    expect(files[0]).not.toHaveProperty('content');
    expect(files[0]).not.toHaveProperty('text');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('promotes an attached image context file to visual evidence without reading it into the request body', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const files = await fetchPixflowHandoffContextFiles('stage-a-project', [{
      name: 'reference.png',
      path: 'uploads/reference.png',
      role: 'context',
      order: 3,
      mime: 'image/png',
      size: 3_500_000,
    }] as never);

    expect(files).toEqual([expect.objectContaining({
      path: 'uploads/reference.png',
      role: 'reference_screenshot',
      projectFile: true,
      size: 3_500_000,
    })]);
    expect(JSON.stringify(files).length).toBeLessThan(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an image extension as binary evidence when upstream MIME metadata is wrong', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const files = await fetchPixflowHandoffContextFiles('stage-a-project', [{
      name: 'reference.png',
      path: 'uploads/reference.png',
      role: 'context',
      order: 3,
      mime: 'text/html',
      size: 848_705,
    }] as never);

    expect(files).toEqual([expect.objectContaining({
      path: 'uploads/reference.png',
      role: 'reference_screenshot',
      mime: 'image/png',
      projectFile: true,
    })]);
    expect(files[0]).not.toHaveProperty('text');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows a valid final result after more than three silent minutes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
    });

    const response = new Response(new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(
            `${JSON.stringify({ type: 'result', result: { ok: true, stage: 'stage_b_final' } })}\n`,
          ));
          controller.close();
        }, 4 * 60 * 1000);
      },
    }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

    const resultPromise = readBricksHandoffStreamResponse(response);
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      stage: 'stage_b_final',
    });
    expect(BRICKS_HANDOFF_STREAM_IDLE_TIMEOUT_MS).toBeGreaterThan(15 * 60 * 1000);
  });

  it('keeps a quiet Stage B transport alive through daemon heartbeats until the runner deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
    });

    const response = new Response(new ReadableStream({
      start(controller) {
        const heartbeat = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(
            `${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n`,
          ));
        }, 60_000);
        setTimeout(() => {
          clearInterval(heartbeat);
          controller.enqueue(new TextEncoder().encode(
            `${JSON.stringify({ type: 'result', result: { ok: true, stage: 'stage_b_final' } })}\n`,
          ));
          controller.close();
        }, 16 * 60 * 1000);
      },
    }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

    const resultPromise = readBricksHandoffStreamResponse(response);
    await vi.advanceTimersByTimeAsync(16 * 60 * 1000);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      stage: 'stage_b_final',
    });
  });

  it('finishes as soon as the terminal result record arrives even when the transport stays open', async () => {
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
    });
    let cancelled = false;
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          `${JSON.stringify({ type: 'result', result: { ok: true, stage: 'stage_b_final' } })}\n`,
        ));
      },
      cancel() {
        cancelled = true;
      },
    }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

    await expect(readBricksHandoffStreamResponse(response)).resolves.toEqual({
      ok: true,
      stage: 'stage_b_final',
    });
    expect(cancelled).toBe(true);
  });

  it('still stops immediately through AbortSignal while the stream is quiet', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
    });

    const response = new Response(new ReadableStream({
      start() {},
    }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
    const controller = new AbortController();
    const resultPromise = readBricksHandoffStreamResponse(response, controller.signal);
    const rejection = expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await vi.runAllTimersAsync();

    await rejection;
  });

  it('delivers Stage B mutation checkpoints while preserving the final result', async () => {
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
    });
    const mutations: unknown[] = [];
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          `${JSON.stringify({
            type: 'mutation',
            mutation: {
              sequence: 1,
              operation: 'set',
              content: [{ id: 'hero', name: 'section', parent: '' }],
              globalClasses: [],
            },
          })}\n`,
        ));
        controller.enqueue(new TextEncoder().encode(
          `${JSON.stringify({ type: 'result', result: { ok: true, stage: 'stage_b_final' } })}\n`,
        ));
        controller.close();
      },
    }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

    const result = await readBricksHandoffStreamResponse(
      response,
      undefined,
      undefined,
      undefined,
      BRICKS_HANDOFF_STREAM_IDLE_TIMEOUT_MS,
      (mutation) => {
        mutations.push(mutation);
      },
    );

    expect(mutations).toEqual([{
      sequence: 1,
      operation: 'set',
      content: [{ id: 'hero', name: 'section', parent: '' }],
      globalClasses: [],
    }]);
    expect(result).toEqual({ ok: true, stage: 'stage_b_final' });
  });

  it('does not deliver Stage B results until the baseline canvas gate resolves', async () => {
    const order: string[] = [];
    let releaseBaseline!: () => void;
    const baselineGate = new Promise<void>((resolve) => {
      releaseBaseline = resolve;
    });
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          `${JSON.stringify({
            type: 'baseline',
            result: { ok: true, result: { content: [{ id: 'baseline' }] }, artifacts: {} },
          })}\n${JSON.stringify({ type: 'result', result: { ok: true, stage: 'stage_b_final' } })}\n`,
        ));
        controller.close();
      },
    }), {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

    const resultPromise = readBricksHandoffStreamResponse(
      response,
      undefined,
      undefined,
      async () => {
        order.push('baseline-start');
        await baselineGate;
        order.push('baseline-verified');
      },
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['baseline-start']);
    releaseBaseline();

    await expect(resultPromise).resolves.toEqual({ ok: true, stage: 'stage_b_final' });
    expect(order).toEqual(['baseline-start', 'baseline-verified']);
  });
});

it('removes converter-only evidence while preserving compact source identity for WordPress safety checks', () => {
  const compacted = compactBricksHandoffResultForWordPressApply({
    content: [{ id: 'root', children: ['child', 'missing'] }, { id: 'child', parent: 'root' }],
    stage_b_header: {
      content: [{ id: 'header-root', children: [] }],
    },
    global_classes: [{ id: 'class-1' }],
    stage_b_theme_style_payload: { settings: { color: '#fff' } },
    diagnostics: { computed: 'large' },
    stage_b_source_provenance: [
      { bricksElementId: 'root', sourceNodeId: 'page-root', kind: 'source_node', largeEvidence: { rect: [1, 2, 3] } },
      { bricksElementId: 'header-root', sourceNodeId: 'site-header', kind: 'source_node' },
      { bricksElementId: 'removed', sourceNodeId: 'removed-source', kind: 'source_node' },
      { bricksElementId: 'child', sourceNodeId: '', kind: 'synthetic' },
    ],
    stage_b_structure_ir: { nodes: [1, 2, 3] },
    color_system: { duplicate: true },
  });

  expect(compacted).toEqual({
    content: [{ id: 'root', children: ['child'] }, { id: 'child', parent: 'root' }],
    stage_b_header: { content: [{ id: 'header-root', children: [] }] },
    global_classes: [{ id: 'class-1' }],
    stage_b_theme_style_payload: { settings: { color: '#fff' } },
    stage_b_source_provenance: [
      { bricksElementId: 'root', sourceNodeId: 'page-root', kind: 'source_node' },
      { bricksElementId: 'header-root', sourceNodeId: 'site-header', kind: 'source_node' },
    ],
  });
});
