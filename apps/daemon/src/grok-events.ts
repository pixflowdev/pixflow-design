type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

const TOOL_NAMES: Record<string, string> = {
  read_file: 'Read', write: 'Write', search_replace: 'Edit',
  run_terminal_command: 'Bash', todo_write: 'TodoWrite', grep: 'Grep',
};

/** Grok Build's native `streaming-json` protocol (validated with CLI 1.0.77).
 * Only explicit public activity is forwarded; command inventories and signed
 * usage envelopes are not chat content. End usage is cumulative, not a delta.
 */
export function createGrokEvents(emit: (event: RecordValue) => void) {
  const started = new Set<string>();
  const finished = new Set<string>();
  let ended = false;
  let failed = false;
  let hasText = false;
  const fail = (message: string) => {
    if (!failed) emit({ type: 'error', message });
    failed = true;
  };
  return {
    accept(raw: unknown): boolean {
      const event = object(raw);
      if (event.type === 'available_commands' || event.type === 'usage') return true;
      if (event.type === 'text' && typeof event.data === 'string') {
        hasText ||= event.data.trim().length > 0;
        emit({ type: 'text_delta', delta: event.data });
        return true;
      }
      if (event.type === 'tool_call' || event.type === 'tool_call_update') {
        const id = event.toolCallId;
        if (typeof id !== 'string' || !id) return true;
        if (event.type === 'tool_call' && !started.has(id)) {
          started.add(id);
          const name = typeof event.toolName === 'string' ? event.toolName : String(event.title || 'Tool');
          const input = { ...object(event.rawInput) };
          if (['read_file', 'write', 'search_replace'].includes(name) && typeof input.target_file === 'string') input.file_path = input.target_file;
          emit({ type: 'tool_use', id, name: TOOL_NAMES[name] || name, input });
        }
        if (['completed', 'failed', 'cancelled', 'canceled'].includes(String(event.status)) && !finished.has(id)) {
          finished.add(id);
          const parts = Array.isArray(event.content) ? event.content : [];
          const text = parts.map(part => {
            const item = object(part);
            const content = item.type === 'content' ? object(item.content) : item;
            return content.type === 'text' && typeof content.text === 'string' ? content.text : '';
          }).filter(Boolean).join('\n');
          emit({ type: 'tool_result', toolUseId: id,
            content: text || (typeof event.rawOutput === 'string' ? event.rawOutput : JSON.stringify(event.rawOutput ?? '')),
            isError: event.status !== 'completed' });
        }
        return true;
      }
      if (event.type === 'error') {
        const error = object(event.error);
        fail(String(event.message || error.message || event.error || 'Grok reported an error.'));
        return true;
      }
      if (event.type === 'end') {
        if (ended) return true;
        ended = true;
        if (!['end_turn', 'stop'].includes(String(event.stopReason))) fail(`Grok stopped before completing the request (${String(event.stopReason || 'unknown reason')}).`);
        else if (!hasText && !started.size) fail('Grok finished without a reply or tool activity. Try again.');
        const rawUsage = object(event.usage);
        const usage: RecordValue = {};
        for (const [from, to] of Object.entries({ input_tokens: 'input_tokens', output_tokens: 'output_tokens', cache_read_input_tokens: 'cached_read_tokens', cache_creation_input_tokens: 'cached_write_tokens', reasoning_tokens: 'thought_tokens' })) {
          if (typeof rawUsage[from] === 'number' && Number.isFinite(rawUsage[from]) && rawUsage[from] >= 0) usage[to] = rawUsage[from];
        }
        if (Object.keys(usage).length) emit({ type: 'usage', usage, ...(typeof event.total_cost_usd === 'number' ? { total_cost_usd: event.total_cost_usd } : {}) });
        if (typeof event.sessionId === 'string') emit({ type: 'status', label: 'completed', sessionId: event.sessionId });
        emit({ type: 'turn_end', stopReason: event.stopReason, ...(typeof event.sessionId === 'string' ? { sessionId: event.sessionId } : {}) });
        return true;
      }
      // Future metadata must not become a raw JSON wall in the chat.
      return true;
    },
    flush() {
      if (!ended) fail('Grok ended without a completion event. Check the retained activity before trying again.');
    },
  };
}
