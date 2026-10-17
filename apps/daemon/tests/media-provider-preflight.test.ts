import { describe, expect, it } from 'vitest';

import {
  hasConfiguredMediaProviderForSurface,
  mediaProviderPreflightNotice,
} from '../src/media-provider-preflight.js';

const intent = (mediaPolicy: 'generated' | 'none', mediaSurface: 'image' | 'video' | 'audio' | 'none') => ({
  mediaPolicy,
  mediaSurface,
});

describe('media provider preflight', () => {
  it('uses the selected agent contract rather than prompt or research vocabulary', () => {
    expect(mediaProviderPreflightNotice(intent('none', 'none'), [])).toBeNull();
    expect(mediaProviderPreflightNotice(null, [])).toBeNull();
  });

  it('requires a configured provider for the requested surface', () => {
    const catalog = [
      { providerId: 'openai', model: 'gpt-image-2', surface: 'image', configured: true },
      { providerId: 'nanobanana', model: 'veo-3.1-fast-generate-preview', surface: 'video', configured: true },
    ];

    expect(hasConfiguredMediaProviderForSurface(catalog, 'image')).toBe(true);
    expect(hasConfiguredMediaProviderForSurface(catalog, 'audio')).toBe(false);
    expect(mediaProviderPreflightNotice(intent('generated', 'audio'), catalog)).toMatchObject({
      code: 'MEDIA_PROVIDER_REQUIRED',
      surface: 'audio',
    });
    expect(mediaProviderPreflightNotice(intent('generated', 'image'), catalog)).toBeNull();
    expect(mediaProviderPreflightNotice(intent('none', 'video'), catalog)).toBeNull();
  });

  it('uses provider/model names when a surface field is not present', () => {
    expect(hasConfiguredMediaProviderForSurface([
      { providerId: 'google', model: 'veo-3.1-fast', configured: true },
    ], 'video')).toBe(true);
    expect(hasConfiguredMediaProviderForSurface([
      { providerId: 'openai', model: 'gpt-image-2', configured: false },
    ], 'image')).toBe(false);
  });
});
