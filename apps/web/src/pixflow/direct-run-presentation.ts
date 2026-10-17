/** User cancellation is a terminal outcome, not a retryable failure. */
export function directRunFailurePresentation(error: unknown, aborted: boolean, outcome: string) {
  const stopped = aborted || outcome === 'canceled';
  return {
    stopped,
    failureStatus: stopped ? 'canceled' : outcome,
    failure: stopped ? '' : error instanceof Error ? error.message : String(error),
  };
}
