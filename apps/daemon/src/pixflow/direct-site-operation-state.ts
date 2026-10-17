interface OperationEntry {
  runId?: string;
  requestId?: string;
  tool?: string;
  phase?: string;
  commandId?: string;
  pending?: boolean;
  ok?: boolean;
}

const nativeEdits = new Set(['bricks.mutate', 'bricks.run', 'bricks.save']);

/** Native command acknowledgement is independent of the agent exiting cleanly.
 * Only this run's structured transport records contribute; prose never does.
 * Successful retry of the same native edit clears its rejection. Reads of an
 * older expired command are observations, not a failed edit in the current run.
 * This reports transport evidence; it neither limits tools nor judges design.
 */
export function directOperationState(journal: string, runId: string): 'interrupted' | 'failed' | null {
  const requests = new Set<string>();
  const pending = new Map<string, string>();
  const rejected = new Set<string>();
  for (const line of journal.split('\n')) {
    let entry: OperationEntry;
    try { entry = JSON.parse(line) as OperationEntry; } catch { continue; }
    if (entry.runId !== runId || !entry.tool) continue;
    if (entry.phase === 'dispatched' && entry.requestId && nativeEdits.has(entry.tool)) requests.add(entry.requestId);
    if (entry.phase !== 'received') continue;
    if (entry.requestId) requests.delete(entry.requestId);
    const commandTool = entry.commandId ? pending.get(entry.commandId) : undefined;
    if (entry.commandId) {
      if (entry.pending && nativeEdits.has(entry.tool)) pending.set(entry.commandId,entry.tool);
      else if (!entry.pending) pending.delete(entry.commandId);
    }
    const editTool = nativeEdits.has(entry.tool) ? entry.tool : commandTool;
    if (editTool && entry.ok === false) rejected.add(editTool);
    else if (editTool && entry.ok === true && !entry.pending) rejected.delete(editTool);
  }
  if (requests.size || pending.size) return 'interrupted';
  return rejected.size ? 'failed' : null;
}
