import { describe, expect, it, vi } from 'vitest';

import {
  buildPersistedConfig,
  buildPixflowWordPressAppConfigPrefs,
  isAutosaveDraftOnlyChange,
  persistComposioConfigChange,
  resolveSettingsCloseConfig,
  mergeIncomingWordPressConfig,
} from '../src/App';
import type { AppConfig } from '../src/types';

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

describe('WordPress shared settings credential preservation', () => {
  it('hydrates the latest saved credential before a public settings notification can overwrite it', () => {
    const stale = { ...baseConfig, apiKey: '' };
    const saved = { ...baseConfig, apiKey: 'synthetic-new-key', model: 'new-model' };
    const merged = mergeIncomingWordPressConfig(stale, saved, { model: 'new-model' });
    expect(merged.apiKey).toBe('synthetic-new-key');
    expect(merged.model).toBe('new-model');
  });
  it('honours an explicit saved credential removal rather than resurrecting stale state', () => {
    const saved = { ...baseConfig, apiKey: '' };
    expect(mergeIncomingWordPressConfig(baseConfig, saved, { model: 'new-model' }).apiKey).toBe('');
  });
});

describe('persistComposioConfigChange', () => {
  it('does not update local saved state when the daemon save fails', async () => {
    await expect(
      persistComposioConfigChange(
        baseConfig,
        { apiKey: 'cmp_new_key', apiKeyConfigured: false },
        vi.fn(async () => false),
      ),
    ).rejects.toThrow('Composio config save failed');
  });

  it('normalizes the saved Composio key after a successful daemon save', async () => {
    await expect(
      persistComposioConfigChange(
        baseConfig,
        { apiKey: 'cmp_new_key', apiKeyConfigured: false },
        vi.fn(async () => true),
      ),
    ).resolves.toMatchObject({
      composio: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '_key',
      },
    });
  });
});

describe('buildPersistedConfig', () => {
  it('preserves onboarding completion when a stale autosave snapshot says false', () => {
    expect(
      buildPersistedConfig(
        { ...baseConfig, onboardingCompleted: false },
        { ...baseConfig, onboardingCompleted: true },
      ),
    ).toMatchObject({ onboardingCompleted: true });
  });

  it('does not preserve removed privacy tracking state during settings autosave', () => {
    expect(
      buildPersistedConfig(
        {
          ...baseConfig,
          apiProtocol: 'google',
          privacyDecisionAt: null,
          telemetry: { metrics: true, content: true, artifactManifest: false },
        },
        {
          ...baseConfig,
          installationId: 'inst-current',
          privacyDecisionAt: 12345,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      ),
    ).toMatchObject({
      apiProtocol: 'google',
      privacyDecisionAt: null,
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });
  });
});

describe('buildPixflowWordPressAppConfigPrefs', () => {
  it('persists the site-wide Bricks module switches and 2FA email branding', () => {
    const bricksExtensions = {
      recentlyViewed: { enabled: false },
      twoFactorAuthentication: {
        enabled: true,
        email: { companyName: 'Pixflow Ltd', fromEmail: 'security@example.test' },
      },
    };

    expect(buildPixflowWordPressAppConfigPrefs({
      ...baseConfig,
      bricksExtensions,
    })).toMatchObject({ bricksExtensions });
  });
});

describe('isAutosaveDraftOnlyChange', () => {
  const savedComposio: AppConfig = {
    ...baseConfig,
    composio: { apiKey: '', apiKeyConfigured: true, apiKeyTail: 'beef' },
  };

  it('treats an in-flight Composio API key edit as draft-only', () => {
    const typing: AppConfig = {
      ...savedComposio,
      composio: { ...savedComposio.composio, apiKey: '111' },
    };
    expect(isAutosaveDraftOnlyChange(typing, savedComposio)).toBe(true);
  });

  it('flags a real change (non-draft field) as persist-worthy', () => {
    const flipped: AppConfig = { ...savedComposio, model: 'claude-opus-4-7' };
    expect(isAutosaveDraftOnlyChange(flipped, savedComposio)).toBe(false);
  });

  it('flags apiKeyConfigured / tail flips as persist-worthy', () => {
    const cleared: AppConfig = {
      ...savedComposio,
      composio: { apiKey: '', apiKeyConfigured: false, apiKeyTail: '' },
    };
    expect(isAutosaveDraftOnlyChange(cleared, savedComposio)).toBe(false);
  });

  it('returns true for an identical snapshot (no-op autosave tick)', () => {
    expect(isAutosaveDraftOnlyChange(savedComposio, savedComposio)).toBe(true);
  });
});

describe('resolveSettingsCloseConfig', () => {
  it('preserves incomplete onboarding and the latest persisted draft when settings close', () => {
    expect(
      resolveSettingsCloseConfig(
        {
          ...baseConfig,
          onboardingCompleted: false,
          orbit: { enabled: false, time: '09:00', templateSkillId: 'stale-template' },
        },
        {
          ...baseConfig,
          onboardingCompleted: false,
          orbit: { enabled: true, time: '11:30', templateSkillId: 'fresh-template' },
        },
      ),
    ).toMatchObject({
      onboardingCompleted: false,
      orbit: { enabled: true, time: '11:30', templateSkillId: 'fresh-template' },
    });
  });
});

it('adopts WordPress provider preferences even when the browser cache selected CLI', () => {
  vi.stubGlobal('window', { __PIXFLOW_DESIGN_WORDPRESS__: { version: '2.0.8', restBaseUrl: 'http://localhost/wp-json/pixflow-design/v1' } });
  try {
    const cached = { ...baseConfig, mode: 'daemon' as const, apiTransport: 'direct' as const };
    const merged = mergeIncomingWordPressConfig(cached, cached, {mode:'api',apiTransport:'composio',composioProvider:'openai',composioModel:'test-model'});
    expect(merged.mode).toBe('api');
    expect(merged.apiTransport).toBe('composio');
    expect(merged.composioModel).toBe('test-model');
    expect(merged.apiKey).toBe(cached.apiKey);
  } finally { vi.unstubAllGlobals(); }
});
