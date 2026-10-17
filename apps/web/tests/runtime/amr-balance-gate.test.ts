// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmrWalletSnapshot } from '@open-design/contracts';

const { fetchAmrWalletSnapshot } = vi.hoisted(() => ({
  fetchAmrWalletSnapshot: vi.fn(),
}));
vi.mock('../../src/providers/daemon', () => ({ fetchAmrWalletSnapshot }));

import {
  checkAmrBalanceGate,
  setAmrLowBalanceWarnOptedOut,
} from '../../src/runtime/amr-balance-gate';

function snapshot(
  balanceUsd: string | null,
  overrides: Partial<AmrWalletSnapshot> = {},
): AmrWalletSnapshot {
  return {
    status: 'available',
    profile: 'prod',
    user: { plan: 'free' },
    balanceUsd,
    updatedAt: null,
    fetchedAt: new Date(0).toISOString(),
    stale: false,
    source: 'vela_cli',
    ...overrides,
  };
}

describe('Open Design Cloud pre-run balance gate', () => {
  beforeEach(() => {
    fetchAmrWalletSnapshot.mockReset();
    window.localStorage.clear();
  });

  it('allows a healthy balance without a refresh', async () => {
    fetchAmrWalletSnapshot.mockResolvedValue(snapshot('8.50'));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
    expect(fetchAmrWalletSnapshot).toHaveBeenCalledTimes(1);
  });

  it('warns for a low but usable balance', async () => {
    const low = snapshot('1.25');
    fetchAmrWalletSnapshot.mockResolvedValue(low);
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'soft', snapshot: low });
  });

  it('confirms a hard block against a fresh snapshot', async () => {
    const empty = snapshot('0');
    fetchAmrWalletSnapshot.mockResolvedValueOnce(empty).mockResolvedValueOnce(empty);
    await expect(checkAmrBalanceGate()).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: empty,
    });
    expect(fetchAmrWalletSnapshot).toHaveBeenLastCalledWith({ refresh: true });
  });

  it('fails open when wallet data is unavailable', async () => {
    fetchAmrWalletSnapshot.mockRejectedValue(new Error('offline'));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it('honors the explicit low-balance reminder opt-out', async () => {
    setAmrLowBalanceWarnOptedOut();
    fetchAmrWalletSnapshot.mockResolvedValue(snapshot('1.00'));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });
});
