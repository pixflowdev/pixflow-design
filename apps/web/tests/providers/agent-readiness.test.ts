import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentReadinessBridgeStatusSignature,
  bridgeStatusCanWarmAgentReadiness,
  clearAgentReadinessCache,
  readSelectedAgentReadiness,
  warmSelectedAgentReadiness,
} from '../../src/providers/agent-readiness';

afterEach(() => {
  clearAgentReadinessCache();
  vi.unstubAllGlobals();
});

describe('selected agent readiness client', () => {
  it('distinguishes heartbeat transitions without changing on identical checks', () => {
    const connected = {
      running: true,
      siteMismatch: false,
      instanceId: 'bridge-a',
      site: { key: 'site-a' },
    };
    expect(agentReadinessBridgeStatusSignature(connected))
      .toBe(agentReadinessBridgeStatusSignature({ ...connected }));
    expect(agentReadinessBridgeStatusSignature(connected))
      .not.toBe(agentReadinessBridgeStatusSignature({ ...connected, site: { key: 'site-b' } }));
    expect(agentReadinessBridgeStatusSignature(connected))
      .not.toBe(agentReadinessBridgeStatusSignature({ ...connected, running: false }));
    expect(bridgeStatusCanWarmAgentReadiness(connected)).toBe(true);
    expect(bridgeStatusCanWarmAgentReadiness({ ...connected, siteMismatch: true })).toBe(false);
  });

  it('deduplicates warmups across workspace surfaces and reuses the daemon result', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      readiness: {
        schema: 'pixflow.agent-readiness.v1',
        agentId: 'codex',
        model: 'gpt-5.6-luna',
        status: 'ready',
        checkedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        cached: false,
        nonBillable: true,
        agent: { id: 'codex', name: 'Codex', bin: 'codex', available: true },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const input = { mode: 'daemon' as const, agentId: 'codex', model: 'gpt-5.6-luna' };
    const [first, second] = await Promise.all([
      warmSelectedAgentReadiness(input),
      warmSelectedAgentReadiness(input),
    ]);

    expect(first?.status).toBe('ready');
    expect(second?.status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readSelectedAgentReadiness('codex', 'gpt-5.6-luna')?.status).toBe('ready');
  });

  it('deduplicates simultaneous forced warmups published by shared bridge surfaces', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      readiness: {
        schema: 'pixflow.agent-readiness.v1',
        agentId: 'antigravity',
        model: 'gemini-3.6-flash-high',
        status: 'ready',
        checkedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        cached: false,
        nonBillable: true,
        agent: { id: 'antigravity', name: 'Antigravity', bin: 'antigravity', available: true },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const input = {
      mode: 'daemon' as const,
      agentId: 'antigravity',
      model: 'gemini-3.6-flash-high',
      force: true,
    };
    await Promise.all([
      warmSelectedAgentReadiness(input),
      warmSelectedAgentReadiness(input),
      warmSelectedAgentReadiness(input),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not probe CLI readiness for BYOK mode', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(warmSelectedAgentReadiness({
      mode: 'api',
      agentId: 'codex',
      model: 'gpt-5.6-luna',
    })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
