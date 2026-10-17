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
