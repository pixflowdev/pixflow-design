import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildInBricksRetainedSourceConflictNotice,
  hashBuildInBricksOwnedNativeContent,
  lookupBuildInBricksSource,
  markBuildInBricksRetainedSourceConflict,
  persistBuildInBricksSourceIndex,
  readBuildInBricksSource,
  resolveBuildInBricksDispatchSelection,
  resolveBuildInBricksPageSourceOwner,
  resolveBuildInBricksSelectedSourceOwner,
  resolveBuildInBricksSelectedSourceOwnerSet,
} from '../../src/pixflow/build-in-bricks-source-provenance';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function response(text: string, ok = true): Response {
  return { ok, status: ok ? 200 : 404, statusText: ok ? 'OK' : 'Not Found', text: async () => text } as Response;
}

const index = {
  schema: 'pixflow.build_in_bricks.source_index.v1',
  version: 1,
  updatedAt: '2026-08-16T00:00:00.000Z',
  entries: [{
    sourceId: 'bib-42-abc',
    version: 1,
    projectId: 'project-1',
    targetPostId: 42,
    scope: 'full_page',
    fragmentNamespace: null,
    placement: null,
    files: {
      html: { path: 'stage-a/source/index.html', hash: 'sha256:html', required: true },
      css: { path: 'stage-a/source/styles.css', hash: 'sha256:css', required: true },
      js: null,
    },
    sourceHash: 'sha256:source',
    convertedElementIds: ['abc123'],
    convertedGlobalClassIds: [],
    handoffId: 'handoff-1',
    runId: 'run-1',
    contextRevision: 'route-1-bricks',
    skillVersion: '1.0.0',
    status: 'active',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    lastSuccessfulConversionAt: '2026-08-16T00:00:00.000Z',
    previousSourceId: null,
  }],
} as const;

describe('Build in Bricks source provenance', () => {
  it('does not treat a failed scratch project without an accepted source index as retained page authority', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/projects/project-1/')) return response(JSON.stringify(index));
      return response('', false);
    }) as typeof fetch;

    await expect(resolveBuildInBricksPageSourceOwner({
      projectIds: ['failed-project'],
      targetPostId: 42,
    })).resolves.toMatchObject({ status: 'missing', projectId: null, entry: null });

    await expect(resolveBuildInBricksPageSourceOwner({
      projectIds: ['failed-project', 'project-1'],
      targetPostId: 42,
    })).resolves.toMatchObject({ status: 'available', projectId: 'project-1', entry: { sourceId: 'bib-42-abc' } });
  });

  it('does not promote an accepted section fragment into page-level retained authority', async () => {
    const sectionIndex = {
      ...index,
      entries: [{ ...index.entries[0], scope: 'section' }],
    };
    globalThis.fetch = vi.fn(async () => response(JSON.stringify(sectionIndex))) as typeof fetch;

    await expect(resolveBuildInBricksPageSourceOwner({
      projectIds: ['project-1'],
      targetPostId: 42,
    })).resolves.toMatchObject({ status: 'missing', projectId: null, entry: null });
  });

  it('lets the fresh dispatch selection supersede a stale preflight source owner', () => {
    expect(resolveBuildInBricksDispatchSelection({
      liveSelectedElementId: 'hlike6',
      retainedOwnerSelectedElementId: '1a2qc8',
    })).toEqual({
      selectedElementId: 'hlike6',
      retainedOwnerMatchesSelection: false,
    });

    expect(resolveBuildInBricksDispatchSelection({
      liveSelectedElementId: 'hlike6',
      retainedOwnerSelectedElementId: 'hlike6',
    })).toEqual({
      selectedElementId: 'hlike6',
      retainedOwnerMatchesSelection: true,
    });
  });

  it('presents retained native-content conflicts as an explicit reconciliation stop', () => {
    const notice = buildInBricksRetainedSourceConflictNotice(
      'The Pixflow-owned native Bricks content changed after conversion.',
    );
    expect(notice).toBe(
      'Retained Build source edit paused: The Pixflow-owned native Bricks content changed after conversion. Reconciliation is required before Pixflow can overwrite native content.',
    );
    expect(markBuildInBricksRetainedSourceConflict(
      [{ id: 'user-1', content: 'Edit it.' }, { id: 'assistant-1', content: 'Generating...', status: 'streaming' }],
      'assistant-1',
      notice,
      1234,
    )).toEqual([
      { id: 'user-1', content: 'Edit it.' },
      {
        id: 'assistant-1',
        content: notice,
        status: 'done',
        runStatus: 'failed',
        endedAt: 1234,
      },
    ]);
  });

  it('keeps canonical Build source-index I/O on the daemon scratch project in WordPress', async () => {
    const html = '<main data-build="1">Accepted</main>';
    const css = '.accepted { display: grid; }';
    const bridgeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url.startsWith('http://127.0.0.1:7456/api/projects/project-1/')).toBe(true);
      if (url.includes('/raw/build-source/source/index.html')) return response(html);
      if (url.includes('/raw/build-source/source/styles.css')) return response(css);
      if (url.includes('/raw/pixflow/handoffs/bricks/source-index.json')) return response('', false);
      if (url.endsWith('/files') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}')) as { name?: string };
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ file: { name: body.name, path: body.name } }),
        } as Response;
      }
      return response('', false);
    });
    vi.stubGlobal('window', {
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.5',
        apiBaseUrl: 'http://wordpress.test/wp-json/pixflow-design/v1',
        bridgeBaseUrl: 'http://127.0.0.1:7456',
      },
      __PIXFLOW_DESIGN_NATIVE_FETCH__: bridgeFetch,
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
      parent: null,
      top: null,
      location: { search: '' },
    });
    globalThis.fetch = vi.fn(async () => {
      throw new Error('The WordPress-remapped fetch must not own daemon scratch project files.');
    }) as typeof fetch;

    const result = await persistBuildInBricksSourceIndex({
      projectId: 'project-1',
      targetPostId: 42,
      scope: 'full_page',
      source: {
        htmlPath: 'build-source/source/index.html',
        cssPath: 'build-source/source/styles.css',
      },
      convertedElementIds: ['el-1'],
      persistedNativeElements: [{ id: 'el-1', name: 'section', parent: '', settings: {} }],
    });

    expect(result.ok).toBe(true);
    expect(bridgeFetch).toHaveBeenCalled();
  });

  it('persists a canonical source index after verified conversion', async () => {
    const html = '<main data-build="1">Accepted</main>';
    const css = '.accepted { display: grid; }';
    const written: Array<{ name: string; content: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/build-source/source/index.html')) return response(html);
      if (url.includes('/build-source/source/styles.css')) return response(css);
      if (url.includes('source-index.json')) return response('', false);
      if (url.endsWith('/files') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}')) as { name?: string; content?: string };
        written.push({ name: body.name || '', content: body.content || '' });
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ file: { name: body.name, path: body.name } }),
        } as Response;
      }
      return response('', false);
    }) as typeof fetch;

    const result = await persistBuildInBricksSourceIndex({
      projectId: 'project-1',
      targetPostId: 42,
      scope: 'full_page',
      source: {
        htmlPath: 'build-source/source/index.html',
        cssPath: 'build-source/source/styles.css',
        jsPath: null,
      },
      convertedElementIds: ['el-1'],
      persistedNativeElements: [{ id: 'el-1', name: 'section', parent: '', settings: {} }],
      themeStyleSnapshotHash: 'theme-1',
    });

    expect(result.ok).toBe(true);
    expect(result.entry?.files.html.path).toBe('build-source/source/index.html');
    expect(result.entry?.files.css.path).toBe('build-source/source/styles.css');
    expect(written).toHaveLength(1);
    expect(written[0]?.name).toBe('pixflow/handoffs/bricks/source-index.json');
    expect(JSON.parse(written[0]?.content || '{}')).toMatchObject({
      schema: 'pixflow.build_in_bricks.source_index.v1',
      entries: [expect.objectContaining({
        projectId: 'project-1',
        targetPostId: 42,
        themeStyleSnapshotHash: 'theme-1',
      })],
    });
  });

  it('fails closed when the project rejects the source-index write', async () => {
    const html = '<main data-build="1">Accepted</main>';
    const css = '.accepted { display: grid; }';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/build-source/source/index.html')) return response(html);
      if (url.includes('/build-source/source/styles.css')) return response(css);
      if (url.includes('source-index.json')) return response('', false);
      if (url.endsWith('/files') && init?.method === 'POST') {
        return {
          ok: false,
          status: 409,
          statusText: 'Conflict',
          text: async () => JSON.stringify({
            code: 'project_file_write_failed',
            message: 'Project storage rejected the source-index write.',
          }),
          json: async () => ({
            code: 'project_file_write_failed',
            message: 'Project storage rejected the source-index write.',
          }),
        } as Response;
      }
      return response('', false);
    }) as typeof fetch;

    const result = await persistBuildInBricksSourceIndex({
      projectId: 'project-1',
      targetPostId: 42,
      scope: 'full_page',
      source: {
        htmlPath: 'build-source/source/index.html',
        cssPath: 'build-source/source/styles.css',
        jsPath: null,
      },
      convertedElementIds: ['el-1'],
      persistedNativeElements: [{ id: 'el-1', name: 'section', parent: '', settings: {} }],
    });

    expect(result.ok).toBe(false);
    expect(result.entry).toBeNull();
    expect(result.index).toBeNull();
    expect(result.message).toContain('Project storage rejected the source-index write.');
  });

  it('keeps historical stage-a metadata read-compatible without writing a canonical index from it', async () => {
    const result = await persistBuildInBricksSourceIndex({
      projectId: 'project-1',
      targetPostId: 42,
      scope: 'full_page',
      stageASource: {
        htmlPath: 'stage-a/source/index.html',
        cssPath: 'stage-a/source/styles.css',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.entry).toBeNull();
    expect(result.message).toContain('read-compatible only');
  });

  it('does not select source by prompt or loose class names', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) return response(JSON.stringify(index));
      return response('', false);
    }) as typeof fetch;

    const missing = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 99,
    });
    expect(missing.status).toBe('missing');

    const available = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
      convertedElementId: 'abc123',
    });
    expect(available.status).toBe('available');
    expect(available.entry?.sourceId).toBe('bib-42-abc');
  });

  it('resolves one retained scoped source by persisted project/page ownership, not a later semantic scope', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          scope: 'component',
          fragmentNamespace: 'intro-container',
        }],
      }));
      return response('', false);
    }) as typeof fetch;

    expect((await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
      scope: 'section',
    })).status).toBe('missing');

    const retained = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
    });
    expect(retained.status).toBe('available');
    expect(retained.entry).toMatchObject({
      scope: 'component',
      fragmentNamespace: 'intro-container',
    });
  });

  it('keeps retained project/page ownership fail-closed when more than one source is active', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) return response(JSON.stringify({
        ...index,
        entries: [
          { ...index.entries[0], sourceId: 'component-a', scope: 'component', fragmentNamespace: 'a' },
          { ...index.entries[0], sourceId: 'component-b', scope: 'component', fragmentNamespace: 'b' },
        ],
      }));
      return response('', false);
    }) as typeof fetch;

    const result = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
    });
    expect(result.status).toBe('ambiguous');
    expect(result.entry).toBeNull();
  });

  it('resolves selected-element ownership from the persisted source index instead of page-level last-project memory', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/projects/unrelated-project/')) return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          projectId: 'unrelated-project',
          targetPostId: 3946,
          convertedElementIds: ['appended-component-root'],
        }],
      }));
      if (url.includes('/projects/full-page-owner/')) return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          projectId: 'full-page-owner',
          targetPostId: 3946,
          convertedElementIds: ['selected-heading'],
        }],
      }));
      return response('', false);
    }) as typeof fetch;

    const owner = await resolveBuildInBricksSelectedSourceOwner({
      projectIds: ['unrelated-project', 'full-page-owner'],
      targetPostId: 3946,
      convertedElementId: 'selected-heading',
    });

    expect(owner.status).toBe('available');
    expect(owner.projectId).toBe('full-page-owner');
    expect(owner.entry?.convertedElementIds).toContain('selected-heading');
  });

  it('fails closed when more than one retained project claims the selected native element', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const projectId = url.includes('/projects/project-a/') ? 'project-a' : 'project-b';
      return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          projectId,
          targetPostId: 3946,
          convertedElementIds: ['selected-heading'],
        }],
      }));
    }) as typeof fetch;

    const owner = await resolveBuildInBricksSelectedSourceOwner({
      projectIds: ['project-a', 'project-b'],
      targetPostId: 3946,
      convertedElementId: 'selected-heading',
    });

    expect(owner.status).toBe('ambiguous');
    expect(owner.projectId).toBeNull();
    expect(owner.message).toContain('More than one retained Build source owns');
  });

  it('fails closed when a factual multi-selection spans independent retained source owners', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/projects/feedback-owner/')) return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          sourceId: 'feedback-source',
          projectId: 'feedback-owner',
          targetPostId: 3946,
          convertedElementIds: ['feedback-section'],
        }],
      }));
      if (url.includes('/projects/cta-owner/')) return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          sourceId: 'cta-source',
          projectId: 'cta-owner',
          targetPostId: 3946,
          convertedElementIds: ['cta-section'],
        }],
      }));
      return response('', false);
    }) as typeof fetch;

    const owner = await resolveBuildInBricksSelectedSourceOwnerSet({
      projectIds: ['feedback-owner', 'cta-owner'],
      targetPostId: 3946,
      convertedElementIds: ['feedback-section', 'cta-section'],
    });

    expect(owner.status).toBe('ambiguous');
    expect(owner.projectId).toBeNull();
    expect(owner.entry).toBeNull();
    expect(owner.message).toContain('span more than one retained Build source');
  });

  it('keeps a factual multi-selection retained only when every element has the same source owner', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes('/projects/full-page-owner/')) return response('', false);
      return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          sourceId: 'full-page-source',
          projectId: 'full-page-owner',
          targetPostId: 3946,
          convertedElementIds: ['services-section', 'testimonials-section'],
        }],
      }));
    }) as typeof fetch;

    const owner = await resolveBuildInBricksSelectedSourceOwnerSet({
      projectIds: ['full-page-owner'],
      targetPostId: 3946,
      convertedElementIds: ['services-section', 'testimonials-section'],
    });

    expect(owner.status).toBe('available');
    expect(owner.projectId).toBe('full-page-owner');
    expect(owner.entry?.sourceId).toBe('full-page-source');
  });

  it('returns stale rather than editing source changed outside the recorded version', async () => {
    const html = '<main>Changed</main>';
    const css = '.editorial { display: grid; }';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          placement: { pageFingerprint: 'before-native-edit' },
          files: {
            ...index.entries[0].files,
            html: { ...index.entries[0].files.html, hash: 'sha256:not-the-current-hash' },
          },
        }],
      }));
      if (url.includes('index.html')) return response(html);
      if (url.includes('styles.css')) return response(css);
      return response('', false);
    }) as typeof fetch;

    const result = await readBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
    });
    expect(result.status).toBe('stale');
    expect(result.html).toBe(html);
  });

  it('returns a conflict when the recorded page fingerprint changed', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) {
        return response(JSON.stringify({
          ...index,
          entries: [{ ...index.entries[0], placement: { pageFingerprint: 'before-native-edit' } }],
        }));
      }
      return response('', false);
    }) as typeof fetch;
    const result = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
      currentPageFingerprint: 'after-native-edit',
    });
    expect(result.status).toBe('conflict');
  });

  it('returns a conflict when the retained source Theme Style snapshot changed', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) {
        return response(JSON.stringify({
          ...index,
          entries: [{ ...index.entries[0], themeStyleSnapshotHash: 'theme-style-old' }],
        }));
      }
      return response('', false);
    }) as typeof fetch;
    const result = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
      currentThemeStyleSnapshotHash: 'theme-style-new',
    });
    expect(result.status).toBe('conflict');
    expect(result.message).toContain('Theme Style changed');
  });

  it('fingerprints only the owned native subtree and detects manual native edits', async () => {
    const accepted = [
      { id: 'outside', name: 'section', parent: '', settings: { _background: '#fff' } },
      { id: 'owned-root', name: 'section', parent: '', settings: { _padding: '2rem' } },
      { id: 'owned-child', name: 'heading', parent: 'owned-root', settings: { text: 'Original' } },
    ];
    const fingerprint = await hashBuildInBricksOwnedNativeContent(accepted, ['owned-root', 'owned-child']);
    expect(fingerprint).toMatch(/^sha256:/);
    expect(await hashBuildInBricksOwnedNativeContent([
      { ...accepted[0], settings: { _background: '#000' } },
      accepted[1],
      accepted[2],
    ], ['owned-root', 'owned-child'])).toBe(fingerprint);
    expect(await hashBuildInBricksOwnedNativeContent([
      accepted[0],
      accepted[1],
      { ...accepted[2], settings: { text: 'Manually edited' } },
    ], ['owned-root', 'owned-child'])).not.toBe(fingerprint);
  });

  it('treats WordPress root-parent serialization as equivalent without ignoring hierarchy edits', async () => {
    const inserted = [
      { id: 'owned-root', name: 'section', parent: '', children: ['owned-child'], settings: {} },
      { id: 'owned-child', name: 'heading', parent: 'owned-root', children: [], settings: { text: 'Original' } },
    ];
    const fingerprint = await hashBuildInBricksOwnedNativeContent(inserted, ['owned-root', 'owned-child']);

    expect(await hashBuildInBricksOwnedNativeContent([
      { ...inserted[0], parent: 0 },
      inserted[1],
    ], ['owned-root', 'owned-child'])).toBe(fingerprint);

    expect(await hashBuildInBricksOwnedNativeContent([
      inserted[0],
      { ...inserted[1], parent: '' },
    ], ['owned-root', 'owned-child'])).not.toBe(fingerprint);
  });

  it('blocks a retained edit when owned native content drifted but not for outside-page edits', async () => {
    const accepted = [
      { id: 'outside', name: 'section', parent: '', settings: { color: 'blue' } },
      { id: 'abc123', name: 'section', parent: '', settings: { gap: '2rem' } },
      { id: 'child', name: 'heading', parent: 'abc123', settings: { text: 'Accepted' } },
    ];
    const fingerprint = await hashBuildInBricksOwnedNativeContent(accepted, ['abc123']);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          nativeContentFingerprint: fingerprint,
          nativeContentFingerprintAlgorithm: 'pixflow-owned-bricks-subtree-v1',
        }],
      }));
      return response('', false);
    }) as typeof fetch;

    const outsideOnly = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
      currentNativeElements: [{ ...accepted[0], settings: { color: 'red' } }, accepted[1], accepted[2]],
    });
    expect(outsideOnly.status).toBe('available');

    const ownedEdit = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
      currentNativeElements: [accepted[0], accepted[1], { ...accepted[2], settings: { text: 'Manual edit' } }],
    });
    expect(ownedEdit.status).toBe('conflict');
    expect(ownedEdit.conflicts).toEqual(['native_content_drift']);
    expect(ownedEdit.message).toContain('native Bricks content changed');
  });

  it('does not let valid retained files overwrite an authoritative ownership conflict', async () => {
    const accepted = [
      { id: 'abc123', name: 'section', parent: '', settings: { gap: '2rem' } },
      { id: 'child', name: 'heading', parent: 'abc123', settings: { text: 'Accepted' } },
    ];
    const fingerprint = await hashBuildInBricksOwnedNativeContent(accepted, ['abc123']);
    const sourceReads: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          nativeContentFingerprint: fingerprint,
          nativeContentFingerprintAlgorithm: 'pixflow-owned-bricks-subtree-v1',
        }],
      }));
      sourceReads.push(url);
      return response('<main>Retained bytes are still valid.</main>');
    }) as typeof fetch;

    const result = await readBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
      currentNativeElements: [
        accepted[0],
        { ...accepted[1], settings: { text: 'Manual native edit' } },
      ],
    });

    expect(result.status).toBe('conflict');
    expect(result.conflicts).toEqual(['native_content_drift']);
    expect(result.html).toBeNull();
    expect(result.css).toBeNull();
    expect(result.js).toBeNull();
    expect(sourceReads).toEqual([]);
  });

  it('fails closed when current owned native content cannot be verified', async () => {
    const accepted = [{ id: 'abc123', name: 'section', parent: '', settings: { gap: '2rem' } }];
    const fingerprint = await hashBuildInBricksOwnedNativeContent(accepted, ['abc123']);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          nativeContentFingerprint: fingerprint,
          nativeContentFingerprintAlgorithm: 'pixflow-owned-bricks-subtree-v1',
        }],
      }));
      return response('', false);
    }) as typeof fetch;

    const result = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
      currentNativeElements: null,
    });
    expect(result.status).toBe('conflict');
    expect(result.conflicts).toEqual(['native_verification_unavailable']);
  });

  it('reports native-content drift and Theme Style drift independently', async () => {
    const accepted = [{ id: 'abc123', name: 'section', parent: '', settings: { gap: '2rem' } }];
    const fingerprint = await hashBuildInBricksOwnedNativeContent(accepted, ['abc123']);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) return response(JSON.stringify({
        ...index,
        entries: [{
          ...index.entries[0],
          nativeContentFingerprint: fingerprint,
          nativeContentFingerprintAlgorithm: 'pixflow-owned-bricks-subtree-v1',
          themeStyleSnapshotHash: 'theme-style-a',
        }],
      }));
      return response('', false);
    }) as typeof fetch;

    const result = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
      currentNativeElements: [{ ...accepted[0], settings: { gap: '4rem' } }],
      currentThemeStyleSnapshotHash: 'theme-style-b',
    });
    expect(result.status).toBe('conflict');
    expect(result.conflicts).toEqual(['native_content_drift', 'theme_style_drift']);
    expect(result.message).toContain('native Bricks content changed');
    expect(result.message).toContain('Theme Style changed');
  });

  it('fails closed when an authoritative Theme Style check cannot resolve the current snapshot', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('source-index.json')) {
        return response(JSON.stringify({
          ...index,
          entries: [{ ...index.entries[0], themeStyleSnapshotHash: 'theme-style-recorded' }],
        }));
      }
      return response('', false);
    }) as typeof fetch;
    const result = await lookupBuildInBricksSource({
      projectId: 'project-1',
      targetPostId: 42,
      currentThemeStyleSnapshotHash: null,
    });
    expect(result.status).toBe('conflict');
    expect(result.message).toContain('could not be resolved');
  });
});
