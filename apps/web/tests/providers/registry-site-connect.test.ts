import { expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => ({ ensure: vi.fn(async () => {}), stream: vi.fn(async () => []), fallback: vi.fn(async () => []) }));
vi.mock('../../src/pixflow/wordpress-context', async original => ({ ...await original<any>(), hasPixflowWordPressContext: () => true }));
vi.mock('../../src/pixflow/optional-bridge', async original => ({ ...await original<any>(), ensurePixflowOptionalBridgeSiteContext: bridge.ensure, fetchPixflowOptionalBridgeAgentsStream: bridge.stream, fetchPixflowOptionalBridgeAgents: bridge.fallback }));
import { fetchAgentsStream } from '../../src/providers/registry';
it('pairs the explicit Local CLI scan before requesting protected agents', async () => {
  await fetchAgentsStream({ onAgent: vi.fn() });
  expect(bridge.ensure).not.toHaveBeenCalled();
  await fetchAgentsStream({ onAgent: vi.fn(), useOptionalBridge: true });
  expect(bridge.ensure).toHaveBeenCalledOnce();
  expect(bridge.ensure.mock.invocationCallOrder[0]).toBeLessThan(bridge.stream.mock.invocationCallOrder[0]!);
});

it('does not request agents when site pairing fails', async () => {
  bridge.stream.mockClear();
  bridge.fallback.mockClear();
  bridge.ensure.mockRejectedValueOnce(new Error('Pairing failed'));
  await expect(fetchAgentsStream({ onAgent: vi.fn(), useOptionalBridge: true })).rejects.toThrow('Pairing failed');
  expect(bridge.stream).not.toHaveBeenCalled();
  expect(bridge.fallback).not.toHaveBeenCalled();
});
it('publishes a pairing connection diagnosis without retrying provider discovery', async () => {
  const {PixflowOptionalBridgeUnavailableError}=await import('../../src/pixflow/optional-bridge');
  const {getProviderDiscoveryState}=await import('../../src/pixflow/provider-discovery-state');
  bridge.stream.mockClear();bridge.fallback.mockClear();
  bridge.ensure.mockRejectedValueOnce(new PixflowOptionalBridgeUnavailableError('The connection was refused. Open Bridge.'));
  await expect(fetchAgentsStream({onAgent:vi.fn(),useOptionalBridge:true})).rejects.toThrow('refused');
  expect(getProviderDiscoveryState().error).toContain('refused');
  expect(bridge.stream).not.toHaveBeenCalled();expect(bridge.fallback).not.toHaveBeenCalled();
});
