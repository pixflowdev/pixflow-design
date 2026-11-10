// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { AgentInfo } from '../../src/types';
import { useLocalAgentHydration } from '../../src/hooks/useLocalAgentHydration';

afterEach(cleanup);
const agents = [{ id: 'codex' }] as AgentInfo[];
function deferred() {
  let resolve!: (value: AgentInfo[]) => void;
  const promise = new Promise<AgentInfo[]>(done => { resolve = done; });
  return { promise, resolve };
}

it('finishes API-to-CLI discovery despite its own loading rerender', async () => {
  const request = deferred();
  const load = vi.fn(() => request.promise);
  const onAgents = vi.fn();
  const { result, rerender } = renderHook(({ enabled }) => useLocalAgentHydration({
    enabled, hasAgents: false, bootstrapLoading: false, load, onAgents,
  }), { initialProps: { enabled: false } });
  expect(load).not.toHaveBeenCalled();
  rerender({ enabled: true });
  expect(result.current).toBe(true);
  await act(async () => { request.resolve(agents); });
  expect(onAgents).toHaveBeenCalledWith(agents);
  expect(result.current).toBe(false);
  expect(load).toHaveBeenCalledTimes(1);
});

it('waits for bootstrap and respects an inventory already supplied by the host', async () => {
  const load = vi.fn().mockResolvedValue(agents);
  const onAgents = vi.fn();
  const { rerender } = renderHook(({ bootstrapLoading, hasAgents }) => useLocalAgentHydration({
    enabled: true, bootstrapLoading, hasAgents, load, onAgents,
  }), { initialProps: { bootstrapLoading: true, hasAgents: false } });
  expect(load).not.toHaveBeenCalled();
  rerender({ bootstrapLoading: false, hasAgents: true });
  expect(load).not.toHaveBeenCalled();
  await act(async () => { rerender({ bootstrapLoading: false, hasAgents: false }); });
  expect(onAgents).toHaveBeenCalledWith(agents);
});

it('ignores late results after leaving CLI, then discovers on re-entry', async () => {
  const old = deferred(); const next = deferred();
  const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const onAgents = vi.fn();
  const { result, rerender } = renderHook(({ enabled }) => useLocalAgentHydration({
    enabled, hasAgents: false, bootstrapLoading: false, load, onAgents,
  }), { initialProps: { enabled: true } });
  rerender({ enabled: false });
  expect(result.current).toBe(false);
  rerender({ enabled: true });
  await act(async () => { old.resolve([]); });
  expect(onAgents).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledTimes(2);
  expect(result.current).toBe(true);
  await act(async () => { next.resolve(agents); });
  expect(onAgents).toHaveBeenCalledTimes(1);
  expect(result.current).toBe(false);
});

it('forces one retry for an empty result and settles without a retry loop', async () => {
  const load = vi.fn().mockResolvedValue([]);
  const { result } = renderHook(() => useLocalAgentHydration({
    enabled: true, hasAgents: false, bootstrapLoading: false, load, onAgents: vi.fn(),
  }));
  await act(async () => {});
  expect(load.mock.calls).toEqual([[false], [true]]);
  expect(result.current).toBe(false);
});

it('settles failures and allows another attempt on re-entry', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(agents);
  const onAgents = vi.fn();
  const { result, rerender } = renderHook(({ enabled }) => useLocalAgentHydration({
    enabled, hasAgents: false, bootstrapLoading: false, load, onAgents,
  }), { initialProps: { enabled: true } });
  await act(async () => {});
  expect(result.current).toBe(false);
  expect(onAgents).not.toHaveBeenCalled();
  rerender({ enabled: false });
  await act(async () => { rerender({ enabled: true }); });
  expect(onAgents).toHaveBeenCalledWith(agents);
});

it('does not apply late results or force retry after unmount', async () => {
  const request = deferred(); const load = vi.fn(() => request.promise); const onAgents = vi.fn();
  const { unmount } = renderHook(() => useLocalAgentHydration({
    enabled: true, hasAgents: false, bootstrapLoading: false, load, onAgents,
  }));
  unmount();
  await act(async () => { request.resolve([]); });
  expect(load).toHaveBeenCalledTimes(1);
  expect(onAgents).not.toHaveBeenCalled();
});
