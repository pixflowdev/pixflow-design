import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveStockImages, testUnsplashConnection } from '../src/stock-images.js';

describe('stock image resolver', () => {
  let root = '';
  const originalMediaConfigDir = process.env.OD_MEDIA_CONFIG_DIR;
  const originalUnsplashKey = process.env.OD_UNSPLASH_ACCESS_KEY;
  const originalCanonicalUnsplashKey = process.env.UNSPLASH_ACCESS_KEY;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'od-stock-images-'));
    process.env.OD_MEDIA_CONFIG_DIR = root;
    delete process.env.OD_UNSPLASH_ACCESS_KEY;
    delete process.env.UNSPLASH_ACCESS_KEY;
  });

  afterEach(async () => {
    if (originalMediaConfigDir == null) delete process.env.OD_MEDIA_CONFIG_DIR;
    else process.env.OD_MEDIA_CONFIG_DIR = originalMediaConfigDir;
    if (originalUnsplashKey == null) delete process.env.OD_UNSPLASH_ACCESS_KEY;
    else process.env.OD_UNSPLASH_ACCESS_KEY = originalUnsplashKey;
    if (originalCanonicalUnsplashKey == null) delete process.env.UNSPLASH_ACCESS_KEY;
    else process.env.UNSPLASH_ACCESS_KEY = originalCanonicalUnsplashKey;
    await rm(root, { recursive: true, force: true });
  });

  async function configure(entry: { apiKey?: string; enabled?: boolean }) {
    await writeFile(
      path.join(root, 'media-config.json'),
      JSON.stringify({ providers: { unsplash: entry } }),
      'utf8',
    );
  }

  it('returns a deterministic placeholder without making a request when disabled', async () => {
    await configure({ apiKey: 'test-access-key', enabled: false });
    const fetchImpl = vi.fn();
    const result = await resolveStockImages({
      projectRoot: root,
      request: { query: 'modern architecture', orientation: 'portrait' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider: 'placeholder',
      fallback: true,
      reason: 'disabled',
      images: [{ width: 1200, height: 1600, provider: 'placeholder' }],
    });
    expect(result.images[0]?.url).toContain('placehold.co/1200x1600');
  });

  it('tests a stored key while disabled and returns Unsplash hourly limits', async () => {
    await configure({ apiKey: 'stored-access-key', enabled: false });
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.unsplash.com/photos?page=1&per_page=1');
      expect(new Headers(init?.headers).get('authorization')).toBe('Client-ID stored-access-key');
      return new Response('[]', {
        status: 200,
        headers: {
          'x-ratelimit-limit': '50',
          'x-ratelimit-remaining': '47',
        },
      });
    });

    const result = await testUnsplashConnection({
      projectRoot: root,
      request: {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      kind: 'success',
      status: 200,
      limit: 50,
      remaining: 47,
    });
  });

  it('tests an unsaved draft without persisting it and classifies invalid keys', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Client-ID draft-access-key');
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'x-ratelimit-limit': '50',
          'x-ratelimit-remaining': '49',
        },
      });
    });

    const result = await testUnsplashConnection({
      projectRoot: root,
      request: { apiKey: 'draft-access-key' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: false,
      kind: 'auth_failed',
      status: 401,
      limit: 50,
      remaining: 49,
    });
  });

  it('searches the official API, tracks selection, and returns attributed hotlink HTML', async () => {
    await configure({ apiKey: 'test-access-key', enabled: true });
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get('authorization');
      expect(authorization).toBe('Client-ID test-access-key');
      if (url.includes('/search/photos')) {
        expect(url).toContain('query=quiet+luxury+hotel');
        expect(url).toContain('orientation=landscape');
        return new Response(JSON.stringify({
          results: [{
            id: 'photo-1',
            width: 2400,
            height: 1350,
            alt_description: 'Minimal hotel lobby',
            urls: { regular: 'https://images.unsplash.com/photo-1?ixid=abc' },
            links: {
              html: 'https://unsplash.com/photos/photo-1',
              download_location: 'https://api.unsplash.com/photos/photo-1/download',
            },
            user: {
              name: 'Alex Example',
              links: { html: 'https://unsplash.com/@alex' },
            },
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      expect(url).toBe('https://api.unsplash.com/photos/photo-1/download');
      return new Response(JSON.stringify({ url: 'https://images.unsplash.com/photo-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await resolveStockImages({
      projectRoot: root,
      request: { query: 'quiet luxury hotel', orientation: 'landscape' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      provider: 'unsplash',
      fallback: false,
      images: [{
        id: 'photo-1',
        provider: 'unsplash',
        url: 'https://images.unsplash.com/photo-1?ixid=abc',
        photographer: 'Alex Example',
      }],
    });
    expect(result.images[0]?.html).toContain('<figure class="pixflow-stock-image">');
    expect(result.images[0]?.html).toContain('Photo by <a href=');
    expect(result.images[0]?.html).toContain('utm_source=pixflow_design');
  });

  it('falls back instead of using an image when required use tracking fails', async () => {
    await configure({ apiKey: 'test-access-key', enabled: true });
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/search/photos')) {
        return new Response(JSON.stringify({
          results: [{
            id: 'photo-1',
            width: 1600,
            height: 900,
            alt_description: 'A useful photo',
            urls: { regular: 'https://images.unsplash.com/photo-1?ixid=abc' },
            links: {
              html: 'https://unsplash.com/photos/photo-1',
              download_location: 'https://api.unsplash.com/photos/photo-1/download',
            },
            user: {
              name: 'Alex Example',
              links: { html: 'https://unsplash.com/@alex' },
            },
          }],
        }), { status: 200 });
      }
      return new Response('rate limited', { status: 429 });
    });

    const result = await resolveStockImages({
      projectRoot: root,
      request: { query: 'useful photo' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      provider: 'placeholder',
      fallback: true,
      reason: 'tracking_failed',
    });
  });

  it('never sends the access key to a non-Unsplash tracking origin', async () => {
    await configure({ apiKey: 'test-access-key', enabled: true });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      results: [{
        id: 'photo-1',
        width: 1600,
        height: 900,
        alt_description: 'A useful photo',
        urls: { regular: 'https://images.unsplash.com/photo-1?ixid=abc' },
        links: {
          html: 'https://unsplash.com/photos/photo-1',
          download_location: 'https://attacker.example/collect',
        },
        user: {
          name: 'Alex Example',
          links: { html: 'https://unsplash.com/@alex' },
        },
      }],
    }), { status: 200 }));

    const result = await resolveStockImages({
      projectRoot: root,
      request: { query: 'useful photo' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ provider: 'placeholder', reason: 'upstream_error' });
  });
});
