import { afterEach, expect, it, vi } from 'vitest';
import { fetchDesignSystemShowcase, fetchPluginPreviewHtml } from '../../src/providers/registry';
import { applyPlugin, fetchPlugin, listPlugins } from '../../src/state/projects';
afterEach(() => vi.unstubAllGlobals());
it('authenticates raw previews on WordPress query-string REST installations', async () => {
  const nativeFetch = vi.fn(async () => new Response('<h1>Reference</h1>'));
  vi.stubGlobal('window', {
    location: { href: 'http://wp.test/wp-admin/' }, parent: null, top: null,
    sessionStorage: { getItem: () => null, setItem: () => {} },
    __PIXFLOW_DESIGN_NATIVE_FETCH__: nativeFetch,
    __PIXFLOW_DESIGN_WORDPRESS__: {
      runtime: 'wordpress', version: '2.0.2',
      apiBaseUrl: 'http://wp.test/index.php?rest_route=/pixflow-design/v1/od',
      restBaseUrl: 'http://wp.test/index.php?rest_route=/pixflow-design/v1',
      restRouteBaseUrl: 'http://wp.test/', restNonce: 'local-test-nonce',
    },
  });
  expect(await fetchDesignSystemShowcase('airbnb')).toContain('Reference');
  await fetchPluginPreviewHtml('example');
  expect(nativeFetch).toHaveBeenCalledTimes(2);
  for (const call of nativeFetch.mock.calls as unknown as [string, RequestInit][]) {
    expect(new URL(call[0]).origin).toBe('http://wp.test');
    expect(new Headers(call[1].headers).get('X-WP-Nonce')).toBe('local-test-nonce');
  }
});

it('authenticates catalogue, detail and composer handoff on query-string REST', async () => {
  const record = { id: 'example', title: 'Example', manifest: {} };
  const fetchMock = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    const route = url.searchParams.get('rest_route') || '';
    const body = route.endsWith('/apply') ? { query: 'Create an illustration' }
      : route.endsWith('/example') ? record : { plugins: [record] };
    return new Response(JSON.stringify(body));
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', {
    location: { href: 'http://wp.test/wp-admin/' }, parent: null, top: null,
    sessionStorage: { getItem: () => null, setItem: () => {} },
    __PIXFLOW_DESIGN_WORDPRESS__: {
      runtime: 'wordpress', version: '2.0.2',
      apiBaseUrl: 'http://wp.test/index.php?rest_route=/pixflow-design/v1/od',
      restBaseUrl: 'http://wp.test/index.php?rest_route=/pixflow-design/v1',
      restRouteBaseUrl: 'http://wp.test/', restNonce: 'local-test-nonce',
    },
  });
  expect(await listPlugins()).toEqual([record]);
  expect(await fetchPlugin('example')).toEqual(record);
  expect(await applyPlugin('example')).toMatchObject({ query: 'Create an illustration' });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  for (const [url, init] of fetchMock.mock.calls) {
    expect(new URL(String(url)).origin).toBe('http://wp.test');
    expect(new Headers(init?.headers).get('X-WP-Nonce')).toBe('local-test-nonce');
  }
});
