import { describe, expect, it } from 'vitest';
import {
  agentReadinessCacheKey,
  buildAgentReadiness,
  clearAgentReadinessCache,
  readCachedAgentReadiness,
  rememberAgentReadiness,
} from '../src/agent-readiness.js';

const baseAgent = {
  id: 'codex',
  name: 'Codex',
  bin: 'codex',
  available: true,
  authStatus: 'ok' as const,
  modelsSource: 'live' as const,
  models: [
    { id: 'gpt-5.6-luna', label: 'Luna' },
    { id: 'gpt-5.6-sol', label: 'Sol' },
  ],
};

describe('selected agent readiness', () => {
  it('reports a non-billable ready result for an installed, authenticated agent and model', () => {
    const readiness = buildAgentReadiness(baseAgent, 'gpt-5.6-luna', 1_000, false);

    expect(readiness).toMatchObject({
      schema: 'pixflow.agent-readiness.v1',
      agentId: 'codex',
      model: 'gpt-5.6-luna',
      status: 'ready',
      checkedAt: 1_000,
      cached: false,
      nonBillable: true,
    });
    expect(readiness.expiresAt).toBeGreaterThan(readiness.checkedAt);
  });

  it('fails readiness when authentication or the selected live model is unavailable', () => {
    expect(buildAgentReadiness({ ...baseAgent, authStatus: 'missing' }, undefined, 1_000, false).status)
      .toBe('auth_required');
    expect(buildAgentReadiness(baseAgent, 'missing-model', 1_000, false).status)
      .toBe('model_unavailable');
  });

  it('does not reject custom models when the CLI only exposes fallback discovery', () => {
    expect(buildAgentReadiness({ ...baseAgent, modelsSource: 'fallback' }, 'custom-model', 1_000, false).status)
      .toBe('ready');
  });

  it('shares readiness across navigation but isolates different site CLI profiles', () => {
    clearAgentReadinessCache();
    const firstKey = agentReadinessCacheKey('codex', 'gpt-5.6-luna', {
      OPENAI_BASE_URL: 'https://one.example',
      OPENAI_API_KEY: 'secret-one',
    });
    const sameProfileKey = agentReadinessCacheKey('codex', 'gpt-5.6-luna', {
      OPENAI_API_KEY: 'secret-one',
      OPENAI_BASE_URL: 'https://one.example',
    });
    const otherSiteProfileKey = agentReadinessCacheKey('codex', 'gpt-5.6-luna', {
      OPENAI_BASE_URL: 'https://two.example',
      OPENAI_API_KEY: 'secret-two',
    });
    rememberAgentReadiness(firstKey, buildAgentReadiness(baseAgent, 'gpt-5.6-luna', Date.now(), false));

    expect(sameProfileKey).toBe(firstKey);
    expect(otherSiteProfileKey).not.toBe(firstKey);
    expect(readCachedAgentReadiness(sameProfileKey)?.cached).toBe(true);
    expect(readCachedAgentReadiness(otherSiteProfileKey)).toBeNull();
    expect(firstKey).not.toContain('secret-one');
  });
});
