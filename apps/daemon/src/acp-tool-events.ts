/** Converts ACP's partial tool-call updates into the same UI events as CLI adapters. */
export function createAcpToolEvents(emit: (event: Record<string, unknown>) => void) {
  const calls = new Map<string, { sent: boolean; done: boolean; data: Record<string, unknown> }>();
  return (update: Record<string, unknown>) => {
    if (typeof update.toolCallId !== 'string') return;
    const id = update.toolCallId;
    const call = calls.get(id) ?? { sent: false, done: false, data: {} };
    call.data = { ...call.data, ...update };
    calls.set(id, call);
    if (call.done) return;
    const data = call.data;
    if (!call.sent) {
      const raw = data.rawInput;
      const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { value: raw };
      emit({ type: 'tool_use', id, name: typeof data.kind === 'string' ? data.kind : 'Tool',
        input: { ...input, ...(typeof data.title === 'string' ? { description: data.title } : {}) } });
      call.sent = true;
    }
    if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
      emit({ type: 'tool_result', toolUseId: id,
        content: typeof data.rawOutput === 'string' ? data.rawOutput : JSON.stringify(data.rawOutput ?? data.content ?? ''),
        isError: data.status !== 'completed' });
      call.done = true;
    }
  };
}
