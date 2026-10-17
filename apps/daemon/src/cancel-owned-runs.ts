interface RunCancellationService {
  list: (filter: {
    projectId?: string;
    conversationId?: string;
    status?: string;
  }) => unknown[];
  cancel: (run: unknown) => unknown | Promise<unknown>;
}

/**
 * Stop active agent processes before deleting the project or conversation
 * that owns them. Cancellation is best-effort per run so one stale process
 * record cannot prevent the user's requested deletion.
 */
export async function cancelRunsOwnedBy(
  runs: RunCancellationService,
  scope: { projectId?: string; conversationId?: string },
): Promise<void> {
  const activeRuns = runs.list({ ...scope, status: 'active' });
  await Promise.all(
    activeRuns.map((run) => Promise.resolve(runs.cancel(run)).catch(() => undefined)),
  );
}
