import { describe, expect, it } from 'vitest';
import { buildPixflowWordPressAppConfigPrefs } from '../../src/pixflow/wordpress-settings-prefs';
import type { AppConfig } from '../../src/types';

describe('shared WordPress settings persistence', () => {
  it('saves only the explicitly changed fields for a composer selection', () => {
    const config = { mode: 'api', theme: 'light', model: 'current', agentId: 'codex' } as AppConfig;
    expect(buildPixflowWordPressAppConfigPrefs(config, { mode: 'api' })).toEqual({ mode: 'api' });
    expect(buildPixflowWordPressAppConfigPrefs(config, { model: 'current' })).toEqual({ model: 'current' });
    expect(buildPixflowWordPressAppConfigPrefs(config, {})).toEqual({});
  });
  it('retains full-modal preferences without including provider secrets or runtime facts', () => {
    const result = buildPixflowWordPressAppConfigPrefs({
      mode: 'daemon', apiKey: 'test-only-secret', model: 'test', baseUrl: '',
      customInstructions: 'Keep answers concise', disabledSkills: ['example'],
      designSystemId: 'studio', disabledDesignSystems: ['old'],
      allowVisualReviewerFallback: true, disableBricksEmptyDivMinimumSize: false,
      bricksAbilitiesEnabled: false, bricksIntegrationActive: true,
      bricksExtensions: { twoFactorAuthentication: { enabled: false } },
    } as AppConfig);
    expect(result).toMatchObject({
      customInstructions: 'Keep answers concise', disabledSkills: ['example'],
      designSystemId: 'studio', disabledDesignSystems: ['old'],
      allowVisualReviewerFallback: true, disableBricksEmptyDivMinimumSize: false,
      bricksAbilitiesEnabled: false,
      bricksExtensions: { twoFactorAuthentication: { enabled: false } },
    });
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('bricksIntegrationActive');
  });
});
