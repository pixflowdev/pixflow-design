/** Safe to include in a user-requested WordPress export. Free text, paths and identifiers have no place here. */
export const claudeSupportStages = [
  'start-requested', 'no-supported-login-runtime', 'process-started', 'launch-failed', 'stdin-failed',
  'authorization-address-detected', 'manual-code-requested', 'browser-reopen-failed', 'browser-reopen-dispatched',
  'manual-code-submitted', 'process-exited', 'auth-verified', 'auth-not-signed-in', 'auth-check-failed',
  'timed-out', 'cancelled',
] as const;
export type ClaudeSupportStage = typeof claudeSupportStages[number];
export interface PixflowBridgeSupport {
  schema: 'pixflow.bridge-support.v1';
  capturedAt: string;
  platform: string;
  arch: string;
  osRelease: string | null;
  nodeVersion: string;
  bridgeVersion: string | null;
  uptimeSeconds: number;
  logicalCpus: number;
  memoryGiB: number;
  claude: {
    desktopRuntimeDetected: boolean;
    cliOnPath: boolean;
    selectedSource: 'desktop' | 'cli' | null;
    state: string;
    storage: 'private-file' | 'file-unavailable';
    source: 'desktop' | 'cli' | null;
    milestones: { at: string; stage: ClaudeSupportStage; exitCode?: number }[];
  };
}
