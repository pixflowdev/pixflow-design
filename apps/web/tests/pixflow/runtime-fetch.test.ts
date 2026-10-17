import { afterEach, describe, expect, it, vi } from 'vitest';
import { pixflowRuntimeFetch, pixflowWordPressRestFetch } from '../../src/pixflow/runtime-fetch';

describe('WordPress REST transport', () => {
  const browserWindow = () => ({
    location: { href: 'http://wp.test/' },
    parent: null,
    top: null,
    sessionStorage: { getItem: () => null, setItem: () => undefined },
  }) as unknown as Window & { __PIXFLOW_DESIGN_WORDPRESS__?: Record<string, unknown> };

  const setConfig = (config: Record<string, unknown>) => {
    const target = window as typeof window & { __PIXFLOW_DESIGN_WORDPRESS__?: Record<string, unknown> };
    target.__PIXFLOW_DESIGN_WORDPRESS__ = config;
  };

  const setWpAdminConfig = (config: Record<string, unknown>) => {
    const target = window as typeof window & { pixflowDesignWpAdmin?: Record<string, unknown> };
    target.pixflowDesignWpAdmin = config;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the query-string transport for WP Admin capability paths', async () => {
    vi.stubGlobal('window', browserWindow());
    setConfig({
      runtime: 'wordpress',
      version: '1.1.5',
      restBaseUrl: 'http://wp.test/wp-json/pixflow-design/v1',
      restRouteBaseUrl: 'http://wp.test/',
      restNonce: 'nonce',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await pixflowWordPressRestFetch('/wp-admin/capabilities?screen=plugins');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://wp.test/?rest_route=%2Fpixflow-design%2Fv1%2Fwp-admin%2Fcapabilities&screen=plugins',
      expect.objectContaining({
        credentials: 'same-origin',
        headers: expect.any(Headers),
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('X-WP-Nonce')).toBe('nonce');
  });

  it('uses the localized WP Admin mount config after a clean admin-page load', async () => {
    vi.stubGlobal('window', browserWindow());
    setWpAdminConfig({
      runtime: 'wordpress',
      version: '1.1.5',
      restBaseUrl: 'http://wp.test/wp-json/pixflow-design/v1',
      restRouteBaseUrl: 'http://wp.test/',
      restNonce: 'wp-admin-nonce',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await pixflowWordPressRestFetch('/wp-admin/capabilities');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://wp.test/?rest_route=%2Fpixflow-design%2Fv1%2Fwp-admin%2Fcapabilities');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('X-WP-Nonce')).toBe('wp-admin-nonce');
  });

  it('keeps non-WP-Admin REST paths on the pretty base', async () => {
    vi.stubGlobal('window', browserWindow());
    setConfig({
      runtime: 'wordpress',
      version: '1.1.5',
      restBaseUrl: 'http://wp.test/wp-json/pixflow-design/v1',
      restRouteBaseUrl: 'http://wp.test/',
      restNonce: 'nonce',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await pixflowWordPressRestFetch('/od/health');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://wp.test/wp-json/pixflow-design/v1/od/health');
  });

  it('keeps every Pixflow endpoint on the query transport when WordPress supplies a front-controller REST base', async () => {
    vi.stubGlobal('window', browserWindow());
    setConfig({
      runtime: 'wordpress',
      version: '1.1.5',
      restBaseUrl: 'http://wp.test/index.php?rest_route=/pixflow-design/v1',
      restRouteBaseUrl: 'http://wp.test/',
      restNonce: 'builder-nonce',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await pixflowWordPressRestFetch('/framework/route-context?postId=198');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://wp.test/?rest_route=%2Fpixflow-design%2Fv1%2Fframework%2Froute-context&postId=198');
    expect(init.credentials).toBe('same-origin');
    expect(new Headers(init.headers).get('X-WP-Nonce')).toBe('builder-nonce');
  });

  it('derives the query transport from a front-controller REST base when an older stored config has no route base', async () => {
    vi.stubGlobal('window', browserWindow());
    setConfig({
      runtime: 'wordpress',
      version: '1.1.5',
      restBaseUrl: 'http://wp.test/index.php?rest_route=/pixflow-design/v1',
      restNonce: 'builder-nonce',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await pixflowWordPressRestFetch('/framework/route-context?postId=198');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://wp.test/index.php?rest_route=%2Fpixflow-design%2Fv1%2Fframework%2Froute-context&postId=198');
    expect(init.credentials).toBe('same-origin');
    expect(new Headers(init.headers).get('X-WP-Nonce')).toBe('builder-nonce');
  });

  it('authenticates WordPress project-file requests carried by the query REST transport', async () => {
    vi.stubGlobal('window', browserWindow());
    setConfig({
      runtime: 'wordpress',
      version: '1.1.5',
      apiBaseUrl: 'http://wp.test/index.php?rest_route=/pixflow-design/v1/od',
      restBaseUrl: 'http://wp.test/index.php?rest_route=/pixflow-design/v1',
      restRouteBaseUrl: 'http://wp.test/',
      restNonce: 'builder-nonce',
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await pixflowRuntimeFetch('/api/projects/12345678-1234-1234-1234-123456789abc/files?contentHashes=1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://wp.test/index.php?rest_route=%2Fpixflow-design%2Fv1%2Fod%2Fprojects%2F12345678-1234-1234-1234-123456789abc%2Ffiles&contentHashes=1');
    expect(init.credentials).toBe('same-origin');
    expect(new Headers(init.headers).get('X-WP-Nonce')).toBe('builder-nonce');
  });
});
