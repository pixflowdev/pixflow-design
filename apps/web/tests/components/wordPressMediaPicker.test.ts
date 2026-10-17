// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadWordPressMediaSelection } from '../../src/components/wordPressMediaPicker';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WordPress Media Library attachment loading', () => {
  it('loads an attachment by WordPress id instead of fetching its Unicode static URL', async () => {
    const content = '<!doctype html><title>Billow ⋅ Run on facts</title>';
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://example.test/wp-json/pixflow-design/v1/media/attachments/321/content');
      return new Response(JSON.stringify({
        ok: true,
        item: {
          filename: 'Billow-⋅-Run-on-facts.html',
          mimeType: 'text/html',
          contentBase64: Buffer.from(content, 'utf8').toString('base64'),
          sizeBytes: new TextEncoder().encode(content).byteLength,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(window, {
      __PIXFLOW_DESIGN_WORDPRESS__: {
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce',
      },
    });

    const file = await loadWordPressMediaSelection({
      id: 321,
      filename: 'Billow-⋅-Run-on-facts.html',
      mime: 'text/html',
      url: 'https://example.test/wp-content/uploads/Billow-%E2%8B%85-Run-on-facts.html',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(file.name).toBe('Billow-⋅-Run-on-facts.html');
    expect(file.type).toBe('text/html');
    expect(await file.text()).toBe(content);
  });

  it('keeps a saved-page asset basename out of the multipart filename', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      item: {
        filename: 'Alexium_files/hero-microcapsules.jpg',
        mimeType: 'image/jpeg',
        contentBase64: Buffer.from('image-bytes').toString('base64'),
        sizeBytes: 11,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(window, {
      __PIXFLOW_DESIGN_WORDPRESS__: {
        restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1',
        restNonce: 'nonce',
      },
    });

    const file = await loadWordPressMediaSelection({
      id: 654,
      filename: 'Alexium_files/hero-microcapsules.jpg',
      mime: 'image/jpeg',
      url: 'https://example.test/wp-content/uploads/2026/08/Alexium_files/hero-microcapsules.jpg',
    });

    expect(file.name).toBe('hero-microcapsules.jpg');
  });
});
