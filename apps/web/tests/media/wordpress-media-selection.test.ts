import { describe, expect, it } from 'vitest';

import {
  configuredWordPressMediaModelChoices,
  findConfiguredWordPressMediaChoice,
  resolveWordPressImageSelection,
  shouldUseWordPressMediaRoute,
} from '../../src/media/wordpress-media-selection';

describe('configuredWordPressMediaModelChoices', () => {
  it('lists only providers with request-scoped keys and never daemon markers', () => {
    const choices = configuredWordPressMediaModelChoices({
      surface: 'image',
      mediaProviders: {
        openai: { apiKey: 'sk-test', baseUrl: '' },
        nanobanana: { apiKey: 'AIza-test', baseUrl: '' },
        aihubmix: { apiKey: '', apiKeyConfigured: true, baseUrl: '' },
      },
    });

    expect(choices.some((choice) => choice.providerId === 'openai')).toBe(true);
    expect(choices.some((choice) => choice.providerId === 'nanobanana')).toBe(true);
    expect(choices.some((choice) => choice.providerId === 'aihubmix')).toBe(false);
    expect(choices.every((choice) => !choice.value.includes('sk-test'))).toBe(true);
  });

  it('accepts a configured custom model and validates the submitted value', () => {
    const choices = configuredWordPressMediaModelChoices({
      surface: 'image',
      mediaProviders: {
        aihubmix: { apiKey: 'ah-test', baseUrl: '', model: 'custom-image-model' },
      },
    });

    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({
      providerId: 'aihubmix',
      model: 'custom-image-model',
      value: 'aihubmix::custom-image-model',
    });
    expect(findConfiguredWordPressMediaChoice(choices, 'aihubmix::custom-image-model')).toEqual(choices[0]);
    expect(findConfiguredWordPressMediaChoice(choices, 'openai::gpt-image-2')).toBeUndefined();
  });

  it('keeps a known AIHubMix video seed available when the live catalogue is unavailable', () => {
    const choices = configuredWordPressMediaModelChoices({
      surface: 'video',
      mediaProviders: {
        aihubmix: { apiKey: 'ah-test', baseUrl: '' },
      },
    });

    expect(choices).toContainEqual(expect.objectContaining({
      providerId: 'aihubmix',
      model: 'aihubmix-wan3.0-video',
      value: 'aihubmix::aihubmix-wan3.0-video',
    }));
  });

  it('exposes Google AI Studio video models for the existing Nano Banana key', () => {
    const choices = configuredWordPressMediaModelChoices({
      surface: 'video',
      mediaProviders: {
        nanobanana: { apiKey: 'AIza-test', baseUrl: '' },
      },
    });

    expect(choices).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: 'nanobanana',
        model: 'veo-3.1-generate-preview',
        label: 'Google AI Studio — Veo 3.1',
      }),
      expect.objectContaining({
        providerId: 'nanobanana',
        model: 'veo-3.1-fast-generate-preview',
      }),
      expect.objectContaining({
        providerId: 'nanobanana',
        model: 'gemini-omni-flash-preview',
      }),
    ]));
  });

  it('uses a Google BYOK key as a Nano Banana choice when no media entry exists', () => {
    const choices = configuredWordPressMediaModelChoices({
      surface: 'image',
      mediaProviders: {},
      apiProtocol: 'google',
      apiKey: 'AIza-test',
    });

    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({
      providerId: 'nanobanana',
      model: 'gemini-3.1-flash-image-preview',
    });
  });

  it('uses a Google BYOK key as a Veo choice for video when no media entry exists', () => {
    const choices = configuredWordPressMediaModelChoices({
      surface: 'video',
      mediaProviders: {},
      apiProtocol: 'google',
      apiKey: 'AIza-test',
    });

    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({
      providerId: 'nanobanana',
      model: 'veo-3.1-generate-preview',
    });
  });

  it('does not offer a saved Google image model as a video choice', () => {
    const choices = configuredWordPressMediaModelChoices({
      surface: 'video',
      mediaProviders: {
        nanobanana: {
          apiKey: 'AIza-test',
          baseUrl: '',
          model: 'gemini-3.1-flash-image-preview',
        },
      },
    });

    expect(choices.some((choice) => choice.model === 'gemini-3.1-flash-image-preview')).toBe(false);
    expect(choices.some((choice) => choice.model === 'veo-3.1-generate-preview')).toBe(true);
  });
});

describe('resolveWordPressImageSelection', () => {
  it('prefers a configured Nano Banana provider over Google Imagen defaults', () => {
    const result = resolveWordPressImageSelection({
      apiProtocol: 'google',
      mediaProviders: {
        nanobanana: { apiKey: 'AIza-test', baseUrl: '', model: '' },
      },
      fallbackModel: 'imagen-4',
    });

    expect(result.providerId).toBe('nanobanana');
    expect(result.model).toBe('gemini-3.1-flash-image-preview');
  });

  it('uses a configured provider model when one is supplied', () => {
    const result = resolveWordPressImageSelection({
      apiProtocol: 'google',
      mediaProviders: {
        nanobanana: {
          apiKey: 'AIza-test',
          baseUrl: '',
          model: 'gemini-2.5-flash-image',
        },
      },
      fallbackModel: 'imagen-4',
    });

    expect(result).toMatchObject({
      providerId: 'nanobanana',
      model: 'gemini-2.5-flash-image',
    });
  });

  it('does not route a saved Google video model through the image adapter', () => {
    const result = resolveWordPressImageSelection({
      apiProtocol: 'google',
      mediaProviders: {
        nanobanana: {
          apiKey: 'AIza-test',
          baseUrl: '',
          model: 'veo-3.1-generate-preview',
        },
      },
      fallbackModel: 'gemini-3.1-flash-image-preview',
    });

    expect(result).toMatchObject({
      providerId: 'nanobanana',
      model: 'gemini-3.1-flash-image-preview',
    });
  });

  it('does not let a stale Settings model override a configured provider', () => {
    const result = resolveWordPressImageSelection({
      configuredModel: 'imagen-4',
      apiProtocol: 'google',
      mediaProviders: {
        nanobanana: { apiKey: 'AIza-test', baseUrl: '', model: '' },
      },
      fallbackModel: 'imagen-4',
    });

    expect(result.providerId).toBe('nanobanana');
    expect(result.model).toBe('gemini-3.1-flash-image-preview');
  });

  it('does not replace an explicitly selected model', () => {
    const result = resolveWordPressImageSelection({
      metadataModel: 'imagen-4',
      apiProtocol: 'google',
      mediaProviders: {
        nanobanana: { apiKey: 'AIza-test', baseUrl: '', model: '' },
      },
      fallbackModel: 'imagen-4',
    });

    expect(result.providerId).toBe('google');
    expect(result.model).toBe('imagen-4');
  });

  it('falls back to the active protocol when no media provider is configured', () => {
    const result = resolveWordPressImageSelection({
      apiProtocol: 'google',
      mediaProviders: {},
      fallbackModel: 'imagen-4',
    });

    expect(result.providerId).toBe('google');
    expect(result.model).toBe('imagen-4');
  });
});

describe('shouldUseWordPressMediaRoute', () => {
  it('uses the WordPress adapter for API media projects', () => {
    expect(shouldUseWordPressMediaRoute({
      wordpressRuntime: true,
      mode: 'api',
      surface: 'image',
      mediaProviders: {},
    })).toBe(true);
  });

  it('uses the WordPress adapter for Local CLI media when a browser key is present', () => {
    expect(shouldUseWordPressMediaRoute({
      wordpressRuntime: true,
      mode: 'daemon',
      surface: 'image',
      mediaProviders: { openai: { apiKey: 'sk-test', baseUrl: '' } },
    })).toBe(true);
  });

  it('keeps standalone Local CLI media on the daemon dispatcher', () => {
    expect(shouldUseWordPressMediaRoute({
      wordpressRuntime: true,
      mode: 'daemon',
      surface: 'image',
      mediaProviders: { openai: { apiKey: '', baseUrl: '', apiKeyConfigured: true } },
    })).toBe(false);
    expect(shouldUseWordPressMediaRoute({
      wordpressRuntime: false,
      mode: 'daemon',
      surface: 'image',
      mediaProviders: { openai: { apiKey: 'sk-test', baseUrl: '' } },
    })).toBe(false);
  });
});
