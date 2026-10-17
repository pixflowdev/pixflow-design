import { afterEach, describe, expect, it, vi } from 'vitest';
import { toPixflowRuntimeIframeUrl, toPixflowRuntimeUrl, toPixflowWordPressApiUrl } from '../../src/pixflow/bridge-url';

describe('Pixflow WordPress API URL routing', () => {
  const setWordPressConfig = (apiBaseUrl: string) => {
    vi.stubGlobal('window', {
      location: { href: 'http://wp.test/' },
      parent: null,
      top: null,
      sessionStorage: { getItem: () => null, setItem: () => undefined },
      __PIXFLOW_DESIGN_WORDPRESS__: {
        runtime: 'wordpress',
        version: '1.1.5',
        apiBaseUrl,
        bridgeBaseUrl: 'http://127.0.0.1:7456',
      },
    });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps connector catalogue, credentials and actions on the Bridge that owns them', () => {
    setWordPressConfig('http://wp.test/wp-json/pixflow-design/v1/od');
    for (const path of ['/api/connectors', '/api/connectors/discovery?refresh=true', '/api/connectors/status', '/api/connectors/composio/config', '/api/connectors/github/connect', '/api/connectors/logos/github?theme=dark']) {
      expect(toPixflowWordPressApiUrl(path)).toBeNull();
      expect(toPixflowRuntimeUrl(path)).toBe(`http://127.0.0.1:7456${path}`);
    }
  });

  it('appends paths and query parameters to a pretty REST base', () => {
    setWordPressConfig('http://wp.test/wp-json/pixflow-design/v1/od');

    expect(toPixflowWordPressApiUrl('/api/projects/project-1/files?contentHashes=1')).toBe(
      'http://wp.test/wp-json/pixflow-design/v1/od/projects/project-1/files?contentHashes=1',
    );
  });

  it('appends paths inside rest_route while preserving request query parameters', () => {
    setWordPressConfig('http://wp.test/index.php?rest_route=/pixflow-design/v1/od');

    const result = toPixflowWordPressApiUrl('/api/projects/project-1/files?contentHashes=1');
    const url = new URL(result ?? '');

    expect(url.origin + url.pathname).toBe('http://wp.test/index.php');
    expect(url.searchParams.get('rest_route')).toBe('/pixflow-design/v1/od/projects/project-1/files');
    expect(url.searchParams.get('contentHashes')).toBe('1');
  });

  it('routes public research through the Bridge daemon in WordPress embeds', () => {
    setWordPressConfig('http://wp.test/wp-json/pixflow-design/v1/od');
    expect(toPixflowRuntimeUrl('/api/pixflow/direct-site/run-stream')).toBe('http://127.0.0.1:7456/api/pixflow/direct-site/run-stream');
    expect(toPixflowRuntimeUrl('/api/pixflow/dictation/status')).toBe('http://127.0.0.1:7456/api/pixflow/dictation/status');
    expect(toPixflowWordPressApiUrl('/api/pixflow/dictation/transcribe')).toBeNull();

    expect(toPixflowRuntimeUrl('/api/research/status')).toBe(
      'http://127.0.0.1:7456/api/research/status',
    );
    expect(toPixflowRuntimeUrl('/api/research/search')).toBe(
      'http://127.0.0.1:7456/api/research/search',
    );
  });

  it.each([
    'http://wp.test/wp-json/pixflow-design/v1/od',
    'http://wp.test/index.php?rest_route=/pixflow-design/v1/od',
  ])('authenticates embedded raw assets using %s', (apiBaseUrl) => {
    setWordPressConfig(apiBaseUrl);
    Object.assign(window.__PIXFLOW_DESIGN_WORDPRESS__!, {
      restBaseUrl: 'http://wp.test/wp-json/pixflow-design/v1', restNonce: 'preview-nonce',
    });
    const url = new URL(toPixflowRuntimeIframeUrl('/api/projects/example/raw/image.png?v=123#preview'));
    expect(url.searchParams.get('_wpnonce')).toBe('preview-nonce');
    expect(url.searchParams.get('v')).toBe('123');
    expect(url.hash).toBe('#preview');
    if (url.searchParams.has('rest_route')) {
      expect(url.searchParams.get('rest_route')).toBe('/pixflow-design/v1/od/projects/example/raw/image.png');
    }
  });

  it('never adds a WordPress nonce to external or unrelated resources', () => {
    setWordPressConfig('http://wp.test/index.php?rest_route=/pixflow-design/v1/od');
    Object.assign(window.__PIXFLOW_DESIGN_WORDPRESS__!, {
      restBaseUrl: 'http://wp.test/wp-json/pixflow-design/v1', restNonce: 'preview-nonce',
    });
    for (const url of [
      'https://external.test/image.png',
      'http://wp.test/index.php?rest_route=/unrelated/v1/image',
      'http://wp.test/index.php?rest_route=/pixflow-design/v1/od-other/image',
      'http://wp.test/wp-json/pixflow-design/v1-other/image',
      '/api/pixflow/direct-site/run-stream',
    ]) expect(toPixflowRuntimeIframeUrl(url)).not.toContain('_wpnonce');
  });
});
