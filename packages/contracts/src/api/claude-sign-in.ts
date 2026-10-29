export type ClaudeSignInStatus = {
  state: 'idle' | 'waiting' | 'connected' | 'cancelled' | 'failed' | 'timed-out';
  source: 'desktop' | 'cli' | null;
};
