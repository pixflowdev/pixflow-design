export type PixflowSiteRuntimeState = 'ready' | 'working' | 'sleeping' | 'waking' | 'releasing' | 'unavailable';
export interface PixflowBridgeSiteStatus {
  key: string;
  label: string;
  url: string;
  state: PixflowSiteRuntimeState;
  lastUsedAt: number;
}
export interface PixflowBridgeSitesResponse {
  sites: PixflowBridgeSiteStatus[];
  warmIdleLimit: number;
  idleGraceMs: number;
}
export interface PixflowBridgeSiteActionResponse { ok: boolean; reason?: string }

/** Status safe to expose to a local client. Omit installer paths and credentials. */
export type PixflowBridgeUpdateStatus = {
  state: 'idle' | 'checking' | 'downloading' | 'opening' | 'installing' | 'up-to-date' | 'busy' | 'failed';
  percent?: number;
};
