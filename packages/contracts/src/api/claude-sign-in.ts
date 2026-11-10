export type ClaudeSignInStatus = {
  state: 'idle' | 'waiting' | 'connected' | 'cancelled' | 'failed' | 'timed-out';
  source: 'desktop' | 'cli' | null;
  /** Opaque identity of the currently owned login; never an OAuth URL or token. */
  attemptId?: string;
  canOpenBrowser?: boolean;
  acceptsCode?: boolean;
};
