export type AmrWalletSnapshotStatus = 'signed_out' | 'available' | 'unavailable';
export type AmrWalletSnapshotSource = 'vela_cli' | 'daemon_cache' | 'unavailable';

export interface AmrWalletSnapshot {
  status: AmrWalletSnapshotStatus;
  profile: string;
  user: {
    id?: string;
    email?: string;
    name?: string;
    plan?: string;
  } | null;
  balanceUsd: string | null;
  updatedAt: string | null;
  fetchedAt: string;
  stale: boolean;
  source: AmrWalletSnapshotSource;
  error?: {
    code: 'signed_out' | 'network' | 'upstream';
    message: string;
  };
}
