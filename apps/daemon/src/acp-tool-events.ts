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
      const nativeInput = input as Record<string, unknown>;
      const pixflowName = typeof nativeInput.tool_name === 'string' && nativeInput.tool_name.startsWith('pixflow_builtin__')
        ? nativeInput.tool_name.slice('pixflow_builtin__'.length)
        : undefined;
      emit({
        type: 'tool_use', id,
        name: pixflowName ?? (typeof data.kind === 'string' ? data.kind : typeof data.title === 'string' ? data.title : 'Tool'),
        input: { ...(pixflowName && isObject(nativeInput.tool_input) ? nativeInput.tool_input : nativeInput),
          ...(typeof data.title === 'string' ? { description: data.title } : {}) },
      });
      call.sent = true;
    }
    if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
      const raw = data.rawOutput;
      const pixflowOutput = isObject(raw) && raw.type === 'MCP' && raw.server_name === 'pixflow_builtin' && isObject(raw.output)
        ? raw.output
        : undefined;
      const toolOutput = pixflowOutput?.OkayOutput ?? pixflowOutput?.Error ?? pixflowOutput?.ErrorOutput ?? raw ?? data.content ?? '';
      emit({ type: 'tool_result', toolUseId: id,
        content: typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput),
        isError: data.status !== 'completed' || pixflowOutput?.Error !== undefined || pixflowOutput?.ErrorOutput !== undefined
          || Boolean(pixflowOutput && isObject(raw) && raw.is_error === true) });
      call.done = true;
    }
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
