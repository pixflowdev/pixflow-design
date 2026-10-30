/** Account allowance, not conversation context or an API billing estimate. */
export interface CodexUsage {
  status: 'available' | 'unavailable';
  source: 'desktop' | 'cli' | null;
  checkedAt: string;
  windows: Array<{ bucket: string; durationMinutes: number; remainingPercent: number; resetsAt: number | null }>;
}
