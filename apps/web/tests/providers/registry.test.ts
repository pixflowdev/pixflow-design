import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import {
  appendProjectFileQuery,
  cancelConnectorAuthorization,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  connectConnector,
  DEFAULT_DEPLOY_PROVIDER_ID,
  deployProjectFile,
  fetchAgentsStream,
  fetchCloudflarePagesZones,
  fetchDeployConfig,
  fetchAppVersionInfo,
  invalidateAppVersionCache,
  fetchConnectorDetail,
  fetchConnectorDiscovery,
  fetchPluginExampleHtml,
  fetchPluginPreviewHtml,
  fetchProjectDesignSystemPackageAudit,
  fetchProjectFileText,
  fetchProjectFiles,
  fetchSkillExample,
  generateProjectMediaOnWordPress,
  isDeployProviderId,
  projectRawUrl,
  saveProjectFileToPixflowMedia,
  updateDeployConfig,
  uploadProjectFiles,
  writeProjectTextFileDetailed,
} from '../../src/providers/registry';

describe('fetchProjectFiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('enumerates an explicitly active WordPress overlay workspace even when its project is not in the URL', async () => {
    const nativeFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      files: [{ name: 'preview.html', size: 42, mtime: 1, kind: 'html' }],
    }), { status: 200 }));
    vi.stubGlobal('window', {
      location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
      __PIXFLOW_DESIGN_NATIVE_FETCH__: nativeFetch,
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.0',
        apiBaseUrl: 'https://example.test/wp-json/pixflow-design/v1/od',
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce-1',
        bridgeBaseUrl: 'http://127.0.0.1:7456',
      },
    });
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error('The WordPress fetch wrapper must not own active workspace files.');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectFiles('overlay-project', { activeWorkspace: true })).resolves.toEqual([
      { name: 'preview.html', size: 42, mtime: 1, kind: 'html' },
    ]);
    expect(nativeFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/projects/overlay-project/files',
      { targetAddressSpace: 'loopback' },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still suppresses background WordPress project file fan-out', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.0',
        bridgeBaseUrl: 'http://127.0.0.1:7456',
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectFiles('background-project')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['offline', 'missing', 'unavailable', 'denied'])(
    'reads durable WordPress files when the active Bridge is %s', async (state) => {
      const nativeFetch = vi.fn(async () => {
        if (state === 'offline') throw new TypeError('Failed to fetch');
        return new Response('', { status: state === 'denied' ? 403 : state === 'missing' ? 404 : 503 });
      });
      vi.stubGlobal('window', {
        location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
        __PIXFLOW_DESIGN_NATIVE_FETCH__: nativeFetch,
        __PIXFLOW_DESIGN_WORDPRESS__: {
          apiBaseUrl: 'https://example.test/wp-json/pixflow-design/v1/od',
          restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
          restNonce: 'nonce-read', bridgeBaseUrl: 'http://127.0.0.1:7456',
        },
      });
      const saved = [{ name: 'saved.png', size: 42, mtime: 1, kind: 'image' }];
      const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ files: saved })));
      vi.stubGlobal('fetch', fetchMock);
      if (state === 'denied') {
        await expect(fetchProjectFiles('saved-project', { activeWorkspace: true })).resolves.toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
        return;
      }
      await expect(fetchProjectFiles('saved-project', { activeWorkspace: true })).resolves.toEqual(saved);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.test/wp-json/pixflow-design/v1/od/projects/saved-project/files');
    },
  );
});

describe('WordPress-only media generation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('posts the BYOK media request to the WordPress runtime with its REST nonce', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.0',
        apiBaseUrl: 'https://example.test/wp-json/pixflow-design/v1/od',
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce-media',
      },
    });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      ok: true,
      provider: 'openai',
      file: { name: 'byok-image.png', kind: 'image', size: 4, mtime: 1, mime: 'image/png' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateProjectMediaOnWordPress({
      projectId: 'project-1',
      protocol: 'openai',
      apiKey: 'sk-test',
      surface: 'image',
      model: 'gpt-image-2',
      prompt: 'A bright test image',
    })).resolves.toMatchObject({ provider: 'openai', file: { name: 'byok-image.png' } });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/wp-json/pixflow-design/v1/od/media/generate',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.any(Headers),
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Headers).get('X-WP-Nonce')).toBe('nonce-media');
    expect(JSON.parse(String(init.body))).toMatchObject({
      projectId: 'project-1',
      apiKey: 'sk-test',
      surface: 'image',
    });
  });

  it('adds the REST nonce to raw project URLs used by media previews', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.0',
        apiBaseUrl: 'https://example.test/wp-json/pixflow-design/v1/od',
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce-raw',
      },
    });

    expect(projectRawUrl('project-1', 'assets/hero.png')).toBe(
      'https://example.test/wp-json/pixflow-design/v1/od/projects/project-1/raw/assets/hero.png?_wpnonce=nonce-raw',
    );
    expect(appendProjectFileQuery(projectRawUrl('project-1', 'assets/hero.png'), 'v=2')).toBe(
      'https://example.test/wp-json/pixflow-design/v1/od/projects/project-1/raw/assets/hero.png?_wpnonce=nonce-raw&v=2',
    );
  });

  it('keeps the raw route, nonce and media cache version separate on plain permalinks', () => {
    vi.stubGlobal('window', {
      location: { href: 'https://example.test/wp-admin/' },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '2.0.2',
        apiBaseUrl: 'https://example.test/index.php?rest_route=/pixflow-design/v1/od',
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce-raw',
      },
    });
    const url = new URL(appendProjectFileQuery(projectRawUrl('project-1', 'assets/hero.png'), 'v=2'));
    expect(url.searchParams.get('rest_route')).toBe('/pixflow-design/v1/od/projects/project-1/raw/assets/hero.png');
    expect(url.searchParams.get('_wpnonce')).toBe('nonce-raw');
    expect(url.searchParams.get('v')).toBe('2');
  });

  it('continues a queued BYOK video task through the WordPress task endpoint', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.0',
        apiBaseUrl: 'https://example.test/wp-json/pixflow-design/v1/od',
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce-video',
      },
    });
    vi.stubGlobal('setTimeout', ((callback: () => void) => {
      callback();
      return 0;
    }) as typeof setTimeout);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        pending: true,
        provider: 'volcengine',
        task: { id: 'task-1', status: 'queued' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        pending: false,
        provider: 'volcengine',
        file: { name: 'byok-video.mp4', kind: 'video', size: 4, mtime: 2, mime: 'video/mp4' },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onProgress = vi.fn();

    await expect(generateProjectMediaOnWordPress({
      projectId: 'project-1',
      protocol: 'volcengine',
      apiKey: 'ark-test',
      surface: 'video',
      model: 'doubao-seedance-2-0-260128',
      prompt: 'A short product launch clip',
      onProgress,
    })).resolves.toMatchObject({ provider: 'volcengine', file: { name: 'byok-video.mp4' } });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.test/wp-json/pixflow-design/v1/od/media/tasks/task-1',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onProgress).toHaveBeenCalled();
  });

  it('sends descriptive generated filename and WordPress attachment metadata', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.0',
        apiBaseUrl: 'https://example.test/wp-json/pixflow-design/v1/od',
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce-upload',
      },
    });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        item: { attachmentId: 42, filename: 'launch-dashboard.png' },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveProjectFileToPixflowMedia({
      projectId: 'project-1',
      filePath: 'byok-20260806-133752-5lgwdmhu.unnamed-file',
      mimeType: 'image/png',
      surface: 'image',
      prompt: 'A launch dashboard for a calm analytics product. No text.',
    })).resolves.toMatchObject({ attachmentId: 42 });

    const uploadInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const form = uploadInit.body as FormData;
    const file = form.get('file') as File;
    expect(file.name).toMatch(/^a-launch-dashboard-for-a-calm-analytics-product-[a-z0-9]+\.png$/);
    expect(file.name).not.toContain('unnamed-file');
    expect(form.get('source')).toBe('generated');
    expect(form.get('title')).toBe('A launch dashboard for a calm analytics product');
    expect(form.get('altText')).toBe('A launch dashboard for a calm analytics product');
    expect(form.get('caption')).toBe('Generated image: A launch dashboard for a calm analytics product');
    expect(form.get('description')).toBe('Generated by Pixflow Design from this brief: A launch dashboard for a calm analytics product. No text.');
  });
});

function agentStreamResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}

describe('fetchAgentsStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('collects streamed agents only after the terminal done event', async () => {
    const agent = {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => agentStreamResponse(
        `event: agent\ndata: ${JSON.stringify(agent)}\n\n` +
          'event: done\ndata: {}\n\n',
      )),
    );
    const onAgent = vi.fn();

    await expect(fetchAgentsStream({ onAgent })).resolves.toEqual([agent]);
    expect(onAgent).toHaveBeenCalledWith(agent);
  });

  it('throws when the stream emits an error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => agentStreamResponse(
        'event: error\ndata: {"error":"agent probe failed"}\n\n',
      )),
    );

    await expect(fetchAgentsStream({ onAgent: vi.fn() }))
      .rejects.toThrow('agent probe failed');
  });

  it('throws when the stream closes before the terminal done event', async () => {
    const agent = {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => agentStreamResponse(
        `event: agent\ndata: ${JSON.stringify(agent)}\n\n`,
      )),
    );

    await expect(fetchAgentsStream({ onAgent: vi.fn() }))
      .rejects.toThrow('agents stream ended before done');
  });
});

describe('fetchAppVersionInfo', () => {
  afterEach(() => {
    invalidateAppVersionCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns version info from the daemon response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        version: { version: '1.2.3', channel: 'beta', packaged: true, platform: 'darwin', arch: 'arm64' },
      }), { status: 200 })),
    );

    await expect(fetchAppVersionInfo()).resolves.toEqual({
      version: '1.2.3',
      channel: 'beta',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
    });
  });

  it('returns null when version info is unavailable or malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ version: { version: '1.2.3' } }), { status: 200 })),
    );

    await expect(fetchAppVersionInfo()).resolves.toBeNull();
  });
});

describe('writeProjectTextFileDetailed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('surfaces daemon save errors instead of collapsing them to null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        error: { code: 'ARTIFACT_REGRESSION', message: 'new artifact is smaller than the prior version' },
      }), { status: 422, headers: { 'Content-Type': 'application/json' } })),
    );

    await expect(writeProjectTextFileDetailed('project-1', 'preview.html', '<html></html>')).resolves.toEqual({
      ok: false,
      status: 422,
      code: 'ARTIFACT_REGRESSION',
      message: 'new artifact is smaller than the prior version',
    });
  });

  it('persists artifact-only output to WordPress and the active Bridge workspace', async () => {
    const wordpressFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      file: { name: 'preview.html', size: 42, mtime: 1, kind: 'html' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const bridgeFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      file: { name: 'preview.html', size: 42, mtime: 2, kind: 'html' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('window', {
      location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
      __PIXFLOW_DESIGN_NATIVE_FETCH__: bridgeFetch,
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.0',
        apiBaseUrl: 'https://example.test/wp-json/pixflow-design/v1/od',
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce-artifact',
        bridgeBaseUrl: 'http://127.0.0.1:7456',
      },
    });
    vi.stubGlobal('fetch', wordpressFetch);

    const options = { activeWorkspace: true } as Parameters<typeof writeProjectTextFileDetailed>[3] & {
      activeWorkspace: true;
    };
    await expect(
      writeProjectTextFileDetailed('project-1', 'preview.html', '<html></html>', options),
    ).resolves.toEqual({
      ok: true,
      file: { name: 'preview.html', size: 42, mtime: 2, kind: 'html' },
    });

    expect(wordpressFetch).toHaveBeenCalledTimes(1);
    expect(bridgeFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/projects/project-1/files',
      expect.objectContaining({
        method: 'POST',
        targetAddressSpace: 'loopback',
      }),
    );

    bridgeFetch.mockImplementation(async () => new Response('', { status: 503 }));
    wordpressFetch.mockClear();
    await expect(writeProjectTextFileDetailed('project-1', 'preview.html', '<html>updated</html>', options))
      .resolves.toMatchObject({ ok: false, status: 503, code: 'ACTIVE_WORKSPACE_MIRROR_FAILED' });
    // Only the original durable save occurs; the failed Bridge write is never retried against WordPress.
    expect(wordpressFetch).toHaveBeenCalledTimes(1);
  });
});

describe('fetchSkillExample', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Regression coverage for nexu-io/open-design#897. Skills declared with
  // a non-html `od.preview.type` ship no fetchable HTML — the daemon's
  // /example endpoint only resolves HTML files and 404s for everything
  // else, which left the gallery stuck on a misleading "Couldn't load
  // this example. The example HTML failed to fetch." state. The dispatch
  // now short-circuits at the data layer so the modal can render a calm
  // "no shipped preview" placeholder without firing a doomed network
  // call.
  it('short-circuits without a fetch when previewType is not html', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('hatch-pet', 'image')).resolves.toEqual({
      unavailable: true,
      kind: 'image',
    });
    await expect(
      fetchSkillExample('dcf-valuation', 'markdown'),
    ).resolves.toEqual({ unavailable: true, kind: 'markdown' });

    // The doomed-call is the bug we're fixing — assert no network call
    // was made for either non-html dispatch.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to html fetch when previewType is omitted (legacy callers)', async () => {
    const fetchMock = vi.fn(
      async () => new Response('<html><body>ok</body></html>', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('blog-post')).resolves.toEqual({
      html: '<html><body>ok</body></html>',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/blog-post/example');
  });

  it('treats missing html previews as unavailable instead of an error', async () => {
    const fetchMock = vi.fn(
      async () => new Response('not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('design-brief', 'html')).resolves.toEqual({
      unavailable: true,
      kind: 'html',
    });
    // Confirm the dispatch did call through to the daemon for the html
    // path (i.e. the short-circuit above only catches non-html types).
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/design-brief/example');
  });

  it('forwards real html preview fetch failures as discriminated errors', async () => {
    const fetchMock = vi.fn(
      async () => new Response('server error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('design-brief', 'html')).resolves.toEqual({
      error: 'HTTP 500',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/design-brief/example');
  });
});

// Plugin previews use the same daemon contract as skill examples (the
// daemon returns 404 when the manifest declares a preview entry but no
// file ships at that path). Skills already map that 404 to
// { unavailable: true, kind: 'html' } per #897 so the modal renders a
// calm "no shipped preview" placeholder instead of "Couldn't load this
// example. The example HTML failed to fetch." Plugins lacked the
// symmetric treatment, so bundled plugins like `example-live-artifact`
// surfaced the misleading error from the Home Community grid even
// though the catalog simply ships no example HTML for that plugin.
describe('fetchPluginPreviewHtml', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats missing previews as unavailable instead of an error', async () => {
    const fetchMock = vi.fn(
      async () => new Response('preview not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginPreviewHtml('example-live-artifact'),
    ).resolves.toEqual({ unavailable: true, kind: 'html' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-live-artifact/preview',
    );
  });

  it('forwards real preview fetch failures as discriminated errors', async () => {
    const fetchMock = vi.fn(
      async () => new Response('server error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginPreviewHtml('example-live-artifact'),
    ).resolves.toEqual({ error: 'HTTP 500' });
  });

  it('returns html on success', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('<html><body>preview</body></html>', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginPreviewHtml('example-live-artifact'),
    ).resolves.toEqual({ html: '<html><body>preview</body></html>' });
  });
});

describe('fetchPluginExampleHtml', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats missing example stems as unavailable instead of an error', async () => {
    const fetchMock = vi.fn(
      async () => new Response('example not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginExampleHtml('example-live-artifact', 'index'),
    ).resolves.toEqual({ unavailable: true, kind: 'html' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-live-artifact/example/index',
    );
  });

  it('forwards real example fetch failures as discriminated errors', async () => {
    const fetchMock = vi.fn(
      async () => new Response('server error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginExampleHtml('example-live-artifact', 'index'),
    ).resolves.toEqual({ error: 'HTTP 500' });
  });
});

describe('fetchProjectFileText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('can bypass caches when fetching source text', async () => {
    const fetchMock = vi.fn(async () => new Response('<svg />', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchProjectFileText('project-1', 'diagram.svg', {
        cache: 'no-store',
        cacheBustKey: '1710000000-2',
      }),
    ).resolves.toBe('<svg />');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/diagram.svg?cacheBust=1710000000-2',
      { cache: 'no-store' },
    );
  });

  it('reads canonical active-workspace Build source from the bridge instead of the WordPress mirror', async () => {
    const nativeFetch = vi.fn(async () => new Response('{"schema":"pixflow.build_in_bricks.source_index.v1"}', { status: 200 }));
    vi.stubGlobal('window', {
      location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
      __PIXFLOW_DESIGN_NATIVE_FETCH__: nativeFetch,
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.5',
        apiBaseUrl: 'https://example.test/wp-json/pixflow-design/v1/od',
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce-1',
        bridgeBaseUrl: 'http://127.0.0.1:7456',
      },
    });
    const fetchMock = vi.fn(async () => {
      throw new Error('The WordPress fetch wrapper must not remap canonical Build source.');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectFileText(
      'build-project',
      'pixflow/handoffs/bricks/source-index.json',
      { activeWorkspace: true, cache: 'no-store' },
    )).resolves.toContain('pixflow.build_in_bricks.source_index.v1');

    expect(nativeFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/projects/build-project/raw/pixflow/handoffs/bricks/source-index.json',
      { cache: 'no-store', targetAddressSpace: 'loopback' },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs HTTP failure context before returning null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404, statusText: 'Not Found' })));

    await expect(fetchProjectFileText('project-1', 'missing.svg')).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      '[fetchProjectFileText] failed:',
      expect.objectContaining({
        name: 'missing.svg',
        projectId: 'project-1',
        status: 404,
        statusText: 'Not Found',
        url: '/api/projects/project-1/raw/missing.svg',
      }),
    );
  });

  it('logs thrown fetch errors before returning null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('network down');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw error;
    }));

    await expect(fetchProjectFileText('project-1', 'diagram.svg')).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      '[fetchProjectFileText] failed:',
      expect.objectContaining({
        error,
        name: 'diagram.svg',
        projectId: 'project-1',
        url: '/api/projects/project-1/raw/diagram.svg',
      }),
    );
  });
});

describe('fetchProjectDesignSystemPackageAudit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the daemon package audit for a project', async () => {
    const audit = {
      ok: false,
      projectPath: '/tmp/project',
      filesInspected: 4,
      errors: [{
        severity: 'error',
        code: 'ui_kit_index_missing_runtime_bootstrap',
        message: 'UI kit must mount.',
        path: 'ui_kits/app/index.html',
      }],
      warnings: [],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ audit }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectDesignSystemPackageAudit('ds acme')).resolves.toEqual(audit);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/ds%20acme/design-system-package-audit',
      { cache: 'no-store' },
    );
  });

  it('returns null when the audit endpoint is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));

    await expect(fetchProjectDesignSystemPackageAudit('missing')).resolves.toBeNull();
  });
});

describe('fetchConnectorDiscovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('caches connector discovery after a successful fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      connectors: [{ id: 'github', name: 'GitHub', tools: [{ name: 'issues' }] }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchConnectorDiscovery({ refresh: true })).resolves.toEqual([
      { id: 'github', name: 'GitHub', tools: [{ name: 'issues' }] },
    ]);
    await expect(fetchConnectorDiscovery()).resolves.toEqual([
      { id: 'github', name: 'GitHub', tools: [{ name: 'issues' }] },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/discovery?refresh=true');
  });
});

describe('fetchConnectorDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests paginated hydrated tool previews for one connector', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connector: {
        id: 'canvas',
        name: 'Canvas',
        tools: [{ name: 'canvas.list_courses' }],
        toolCount: 574,
        toolsNextCursor: 'cursor_2',
        toolsHasMore: true,
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchConnectorDetail('canvas', {
      hydrateTools: true,
      toolsLimit: 50,
      toolsCursor: 'cursor_1',
    })).resolves.toMatchObject({
      id: 'canvas',
      toolCount: 574,
      toolsNextCursor: 'cursor_2',
      tools: [{ name: 'canvas.list_courses' }],
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/canvas?hydrateTools=true&toolsLimit=50&toolsCursor=cursor_1');
  });
});

describe('connectConnector', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a fallback link before navigating the auth popup', async () => {
    const replace = vi.fn();
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace },
      close: vi.fn(),
    };
    const open = vi.fn(() => authWindow);
    vi.stubGlobal('window', {
      open,
      location: { assign: vi.fn() },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            airtable: { status: 'ready', authConfigId: 'ac_airtable' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'airtable', name: 'Airtable' },
        auth: {
          kind: 'redirect_required',
          redirectUrl: 'https://connect.composio.dev/link/lk_test?a=1&b=2',
        },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('airtable')).resolves.toMatchObject({
      connector: { id: 'airtable' },
      auth: {
        kind: 'redirect_required',
        redirectUrl: 'https://connect.composio.dev/link/lk_test?a=1&b=2',
      },
    });

    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(authWindow.document.body.innerHTML).toContain('Open Composio');
    expect(authWindow.document.body.innerHTML).toContain('https://connect.composio.dev/link/lk_test?a=1&amp;b=2');
    expect(replace).toHaveBeenCalledWith('https://connect.composio.dev/link/lk_test?a=1&b=2');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/connectors/auth-configs/prepare',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/connectors/airtable/connect', { method: 'POST' });
  });

  it('keeps the popup open with custom auth guidance when initialization fails', async () => {
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.stubGlobal('window', {
      open: vi.fn(() => authWindow),
      location: { assign: vi.fn() },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        results: {
          canvas: {
            status: 'custom_required',
            message: 'Canvas requires a custom Composio auth config. Create or enable a Canvas auth config in Composio with your own OAuth credentials, then retry this connection.',
          },
        },
      }), { status: 200 })),
    );

    await expect(connectConnector('canvas')).resolves.toEqual({
      connector: null,
      error: 'Canvas requires a custom Composio auth config. Create or enable a Canvas auth config in Composio with your own OAuth credentials, then retry this connection.',
    });

    expect(authWindow.close).not.toHaveBeenCalled();
    expect(authWindow.document.title).toBe('Connection failed');
    expect(authWindow.document.body.innerHTML).toContain('Canvas requires a custom Composio auth config.');
    expect(authWindow.document.body.innerHTML).not.toContain('Default auth config not found');
  });

  it('opens the system browser through the daemon when the OAuth popup is blocked', async () => {
    const open = vi.fn(() => null);
    const assign = vi.fn();
    vi.stubGlobal('window', {
      open,
      location: { assign },
    } as unknown as Window & typeof globalThis);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200 });
      }
      if (url === '/api/system/open-external') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('github')).resolves.toEqual({
      connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
      auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(assign).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/system/open-external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/oauth' }),
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/connectors/github/authorization/cancel', {
      method: 'POST',
    });
  });

  it('renders an info notice in the popup when the connect response carries no redirect URL', async () => {
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.stubGlobal('window', {
      open: vi.fn(() => authWindow),
      location: { assign: vi.fn() },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: { twitter: { status: 'ready', authConfigId: 'ac_twitter' } },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'twitter', name: 'Twitter', status: 'available', tools: [] },
        auth: { kind: 'pending', expiresAt: '2026-05-08T10:00:00.000Z' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('twitter')).resolves.toMatchObject({
      connector: { id: 'twitter' },
      auth: { kind: 'pending' },
    });

    expect(authWindow.close).not.toHaveBeenCalled();
    expect(authWindow.document.title).toBe('Authorization pending');
    expect(authWindow.document.body.innerHTML).toContain('Authorization pending');
  });

  it('opens connector auth in the system browser when the host bridge succeeds', async () => {
    const open = vi.fn();
    const openExternal = vi.fn(async () => ({ ok: true as const }));
    vi.stubGlobal('window', {
      open,
    } as unknown as Window & typeof globalThis);
    const restoreHost = installMockOpenDesignHost({
      host: { shell: { openExternal } },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(connectConnector('github')).resolves.toEqual({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      });
    } finally {
      restoreHost();
    }
    expect(open).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/oauth');
  });

  it('surfaces an error when the host bridge cannot confirm that the system browser opened', async () => {
    const open = vi.fn();
    const openExternal = vi.fn(async () => ({ ok: false as const, reason: 'blocked' }));
    vi.stubGlobal('window', {
      open,
    } as unknown as Window & typeof globalThis);
    const restoreHost = installMockOpenDesignHost({
      host: { shell: { openExternal } },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(connectConnector('github')).resolves.toEqual({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
        error: 'Popup blocked. Allow popups for Pixflow Design and try again.',
      });
    } finally {
      restoreHost();
    }
    expect(open).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/oauth');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/connectors/github/authorization/cancel', {
      method: 'POST',
    });
  });
});

describe('cancelConnectorAuthorization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('invalidates pending connector authorization on the daemon', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(cancelConnectorAuthorization('github')).resolves.toEqual({
      id: 'github',
      name: 'GitHub',
      status: 'available',
      tools: [],
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/github/authorization/cancel', {
      method: 'POST',
    });
  });
});

describe('uploadProjectFiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats every response entry as a success regardless of originalName drift', async () => {
    // Simulates an encoding edge case: the browser File.name carries a
    // composed CJK name (NFC) but multer round-trips it through latin1 and
    // returns a slightly different decoded form. The old name-equality
    // matching marked these as failed even though the server stored them.
    const composed = '测试.pdf';
    const decomposed = '测试.pdf'; // pretend the server returned a normalized variant
    const file = new File(['hello'], composed, { type: 'application/pdf' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        files: [
          {
            name: 'mxk7-test.pdf',
            path: 'mxk7-test.pdf',
            size: 5,
            originalName: decomposed,
          },
        ],
      }), { status: 200 })),
    );

    const result = await uploadProjectFiles('project-1', [file]);

    expect(result.failed).toEqual([]);
    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0]).toMatchObject({
      path: 'mxk7-test.pdf',
      name: decomposed,
      size: 5,
    });
  });

  it('marks the unmatched tail as failed when the server drops files mid-flight', async () => {
    const a = new File(['a'], 'a.txt', { type: 'text/plain' });
    const b = new File(['b'], 'b.txt', { type: 'text/plain' });
    const c = new File(['c'], 'c.txt', { type: 'text/plain' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        files: [
          { name: 't1-a.txt', path: 't1-a.txt', size: 1, originalName: 'a.txt' },
          { name: 't2-b.txt', path: 't2-b.txt', size: 1, originalName: 'b.txt' },
        ],
      }), { status: 200 })),
    );

    const result = await uploadProjectFiles('project-1', [a, b, c]);

    expect(result.uploaded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ name: 'c.txt' });
  });

  it('uses PHP multipart array fields for WordPress project uploads', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.0',
        apiBaseUrl: 'https://example.test/wp-json/pixflow-design/v1/od',
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce-upload',
      },
    });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      ok: true,
      files: [
        { name: 'bundle/a.css', path: 'bundle/a.css', size: 1, originalName: 'a.css' },
        { name: 'bundle/b.css', path: 'bundle/b.css', size: 1, originalName: 'b.css' },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const a = new File(['a'], 'a.css', { type: 'text/css' });
    const b = new File(['b'], 'b.css', { type: 'text/css' });
    const result = await uploadProjectFiles('project-1', [a, b], 'bundle');

    expect(result.failed).toEqual([]);
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect(Array.from((body as FormData).keys())).toEqual(['dir', 'files[]', 'files[]']);
  });

  it('authenticates project uploads through a query-style WordPress REST transport', async () => {
    vi.stubGlobal('window', {
      location: { href: 'http://wp.test/wp-admin/post.php', pathname: '/wp-admin/post.php', hash: '', search: '' },
      parent: null,
      top: null,
      sessionStorage: { getItem: () => null, setItem: () => undefined },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        runtime: 'wordpress',
        version: '1.1.5',
        apiBaseUrl: 'http://wp.test/index.php?rest_route=/pixflow-design/v1/od',
        restBaseUrl: 'http://wp.test/index.php?rest_route=/pixflow-design/v1',
        restRouteBaseUrl: 'http://wp.test/',
        restNonce: 'query-upload-nonce',
      },
    });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      ok: true,
      files: [{ name: 'fixture.html', path: 'fixture.html', size: 7, originalName: 'fixture.html' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadProjectFiles('project-1', [
      new File(['fixture'], 'fixture.html', { type: 'text/html' }),
    ]);

    expect(result.failed).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://wp.test/index.php?rest_route=%2Fpixflow-design%2Fv1%2Fod%2Fprojects%2Fproject-1%2Fupload');
    expect(init.credentials).toBe('same-origin');
    expect(new Headers(init.headers).get('X-WP-Nonce')).toBe('query-upload-nonce');
    expect(Array.from((init.body as FormData).keys())).toEqual(['files[]']);
  });

  it('sends only the basename in multipart while preserving the destination directory', async () => {
    vi.stubGlobal('window', {
      location: { pathname: '/wp-admin/post.php', hash: '', search: '' },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        version: '1.1.0',
        apiBaseUrl: 'https://example.test/wp-json/pixflow-design/v1/od',
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce-upload',
      },
    });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      ok: true,
      files: [
        { name: 'Alexium_files/hero.jpg', path: 'Alexium_files/hero.jpg', size: 5, originalName: 'hero.jpg' },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['image'], 'Alexium_files/hero.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'Alexium_files/hero.jpg' });

    const result = await uploadProjectFiles('project-1', [file]);

    expect(result.failed).toEqual([]);
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get('dir')).toBe('Alexium_files');
    expect((body.get('files[]') as File).name).toBe('hero.jpg');
  });
});

describe('deploy provider registry helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('recognizes Vercel and Cloudflare Pages provider ids only', () => {
    expect(isDeployProviderId(DEFAULT_DEPLOY_PROVIDER_ID)).toBe(true);
    expect(isDeployProviderId(CLOUDFLARE_PAGES_PROVIDER_ID)).toBe(true);
    expect(isDeployProviderId('netlify')).toBe(false);
    expect(isDeployProviderId(null)).toBe(false);
  });

  it('fetches provider-specific deploy config via query string', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      tokenMask: 'saved-cloudflare-token',
      teamId: '',
      teamSlug: '',
      accountId: 'account-123',
      projectName: '',
      target: 'preview',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID)).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      accountId: 'account-123',
      projectName: '',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/config?providerId=cloudflare-pages');
  });

  it('fetches Cloudflare Pages zones from the deploy helper route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
      cloudflarePages: { lastZoneId: 'zone-1', lastDomainPrefix: 'demo' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCloudflarePagesZones()).resolves.toEqual({
      zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
      cloudflarePages: { lastZoneId: 'zone-1', lastDomainPrefix: 'demo' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/cloudflare-pages/zones');
  });

  it('sends Cloudflare Pages config fields without dropping provider-specific metadata', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      tokenMask: 'saved-cloudflare-token',
      teamId: '',
      teamSlug: '',
      accountId: 'account-123',
      projectName: '',
      target: 'preview',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateDeployConfig({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      token: 'cf-token',
      accountId: 'account-123',
    })).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      accountId: 'account-123',
      projectName: '',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        token: 'cf-token',
        accountId: 'account-123',
      }),
    });
  });

  it('passes the selected Cloudflare Pages provider id and custom domain through deploy requests', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'deployment-row-1',
      projectId: 'project-1',
      fileName: 'index.html',
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://open-design-preview.pages.dev',
      deploymentId: 'cf-deployment-1',
      deploymentCount: 1,
      target: 'preview',
      status: 'ready',
      createdAt: 1,
      updatedAt: 2,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID, {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      }),
    ).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      deploymentId: 'cf-deployment-1',
      url: 'https://open-design-preview.pages.dev',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'index.html',
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        cloudflarePages: {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          domainPrefix: 'demo',
        },
      }),
    });
  });
});
