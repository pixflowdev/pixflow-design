export interface AppVersionInfo {
  version: string;
  runtimeVersion?: string;
  product?: string;
  channel: string;
  packaged: boolean;
  platform: string;
  arch: string;
}

export interface AppVersionResponse {
  version: AppVersionInfo;
}
