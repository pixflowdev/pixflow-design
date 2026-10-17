import type { AmrWalletSnapshot } from '@open-design/contracts';
import { fetchAmrWalletSnapshot } from '../providers/daemon';

export const AMR_HARD_BLOCK_BALANCE_USD = 0;
export const AMR_LOW_BALANCE_WARN_USD = 2;
const OPTOUT_KEY = 'pixflow-design:amr-low-balance-warn-optout:v1';

export type AmrBalanceGateResult =
  | { kind: 'allow' }
  | { kind: 'hard'; reason: 'insufficient' | 'signed_out'; snapshot: AmrWalletSnapshot }
  | { kind: 'soft'; snapshot: AmrWalletSnapshot };

export function amrWalletBalanceUsd(snapshot: AmrWalletSnapshot | null | undefined): number | null {
  if (!snapshot || snapshot.status !== 'available') return null;
  const raw = snapshot.balanceUsd?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function isAmrLowBalanceWarnOptedOut(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(OPTOUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAmrLowBalanceWarnOptedOut(): void {
  try {
    window.localStorage.setItem(OPTOUT_KEY, '1');
  } catch {
    // A storage failure simply means the reminder can appear again later.
  }
}

export async function checkAmrBalanceGate(): Promise<AmrBalanceGateResult> {
  try {
    const cached = await fetchAmrWalletSnapshot().catch(() => null);
    const cachedBalance = amrWalletBalanceUsd(cached);
    const hardCandidate =
      cached?.status === 'signed_out' ||
      (cachedBalance != null && cachedBalance <= AMR_HARD_BLOCK_BALANCE_USD);
    if (!hardCandidate) {
      if (cachedBalance == null || cachedBalance > AMR_LOW_BALANCE_WARN_USD) return { kind: 'allow' };
      if (isAmrLowBalanceWarnOptedOut()) return { kind: 'allow' };
      return { kind: 'soft', snapshot: cached! };
    }
    const fresh = await fetchAmrWalletSnapshot({ refresh: true }).catch(() => null);
    if (!fresh) return { kind: 'allow' };
    if (fresh.status === 'signed_out') {
      return { kind: 'hard', reason: 'signed_out', snapshot: fresh };
    }
    if (fresh.stale || fresh.error) return { kind: 'allow' };
    const balance = amrWalletBalanceUsd(fresh);
    if (balance == null) return { kind: 'allow' };
    if (balance <= AMR_HARD_BLOCK_BALANCE_USD) {
      return { kind: 'hard', reason: 'insufficient', snapshot: fresh };
    }
    if (balance <= AMR_LOW_BALANCE_WARN_USD && !isAmrLowBalanceWarnOptedOut()) {
      return { kind: 'soft', snapshot: fresh };
    }
    return { kind: 'allow' };
  } catch {
    return { kind: 'allow' };
  }
}
