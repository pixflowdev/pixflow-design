import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  persistWpAdminSessionMode,
  restoreWpAdminSessionMode,
  wpAdminSessionModeStorageKey,
  resolveWpAdminDirectAgent,
  mergeWpAdminRuntimeConfig,
} from '../../src/pixflow/WpAdminAgentFrameApp';
import type { AgentInfo, AppConfig } from '../../src/types';

const runtime = {
  siteHash: 'qa-site',
  context: { user: { id: 2 } },
};

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('WP Admin session mode continuity', () => {
  it('keeps local protocol credentials when applying public preference notifications', () => {
    const next = mergeWpAdminRuntimeConfig({ apiProtocolConfigs: { openai: { model: 'gpt-6-luna' } } }, {
      apiProtocolConfigs: { openai: { apiKey: 'local-only-key', baseUrl: 'https://api.openai.com/v1', model: 'old-model' } },
    }, false);
    expect(next.apiProtocolConfigs?.openai).toEqual({
      apiKey: 'local-only-key', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-luna',
    });
  });
  it('applies a live API choice without restoring a stale local CLI preference', () => {
    const current = { mode: 'daemon', agentId: 'codex', apiKey: 'local-only-key', model: 'gpt-6-luna' } as Partial<AppConfig>;
    const next = mergeWpAdminRuntimeConfig({ mode: 'api' }, current, false);
    expect(next).toMatchObject({ mode: 'api', agentId: 'codex', apiKey: 'local-only-key', model: 'gpt-6-luna' });
  });
  it('restores the saved Local CLI choice over a stale API runtime seed', () => {
    expect(mergeWpAdminRuntimeConfig({ mode: 'api' }, { mode: 'daemon', agentId: 'codex' }, true).mode).toBe('daemon');
    expect(mergeWpAdminRuntimeConfig({ mode: 'daemon' }, { mode: 'api', agentId: 'codex' }, true).mode).toBe('api');
  });
  it('waits for agent discovery when a prompt arrives before panel hydration finishes', async () => {
    const codex = { id: 'codex', name: 'Codex', available: true } as AgentInfo;
    const discover = vi.fn().mockResolvedValue([codex]);
    expect(await resolveWpAdminDirectAgent({ agentId: 'codex' } as AppConfig, [], discover)).toBe(codex);
    expect(discover).toHaveBeenCalledOnce();
  });

  it('uses an already hydrated runner without another discovery request', async () => {
    const codex = { id: 'codex', name: 'Codex', available: true } as AgentInfo;
    const discover = vi.fn();
    expect(await resolveWpAdminDirectAgent({ agentId: 'codex' } as AppConfig, [codex], discover)).toBe(codex);
    expect(discover).not.toHaveBeenCalled();
  });

  it('reports a genuinely unavailable runner after discovery without retrying forever', async () => {
    const discover = vi.fn().mockResolvedValue([]);
    expect(await resolveWpAdminDirectAgent({ agentId: 'codex' } as AppConfig, [], discover)).toBeNull();
    expect(discover).toHaveBeenCalledOnce();
  });
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it('persists the selected interaction mode across object-context remounts', () => {
    expect(restoreWpAdminSessionMode(runtime)).toBe('design');
    persistWpAdminSessionMode(runtime, 'design');
    expect(restoreWpAdminSessionMode(runtime)).toBe('design');
  });

  it('scopes the preference to the site and user, not the current post', () => {
    const firstPost = { ...runtime, context: { user: { id: 2 }, post: { id: 42 } } };
    const secondPost = { ...runtime, context: { user: { id: 2 }, post: { id: 54 } } };
    expect(wpAdminSessionModeStorageKey(firstPost)).toBe(wpAdminSessionModeStorageKey(secondPost));
  });

  it('rejects invalid persisted values', () => {
    localStorage.setItem(wpAdminSessionModeStorageKey(runtime), 'execute-now');
    expect(restoreWpAdminSessionMode(runtime)).toBe('design');
  });
});
