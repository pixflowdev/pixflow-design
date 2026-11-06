import { writeFile } from 'node:fs/promises';

/** Synthetic fixtures in Grok Build 1.0.77's native streaming-json shape. */
export async function renderAsGrok(events: Record<string, unknown>[], opts: { reportFile?: string; emit?: (line: string) => void } = {}) {
  const emit = (value: unknown) => (opts.emit ?? (line => process.stdout.write(line)))(JSON.stringify(value) + '\n');
  emit({ type: 'available_commands', tools: [], commands: [] });
  const names: Record<string, string> = { Read: 'read_file', Write: 'write', Edit: 'search_replace', Bash: 'run_terminal_command' };
  for (const event of events) {
    if (event.type === 'tool_call') {
      const input = { ...(event.input as Record<string, unknown>) };
      if (input.file_path) { input.target_file = input.file_path; delete input.file_path; }
      emit({ type: 'tool_call', toolCallId: event.obs_id, toolName: names[String(event.name)] || event.name, rawInput: input, status: 'pending' });
    } else if (event.type === 'tool_result') {
      emit({ type: 'tool_call_update', toolCallId: event.obs_id, status: event.status === 'success' ? 'completed' : 'failed', content: [{ type: 'content', content: { type: 'text', text: event.output } }] });
    } else if (event.type === 'report') {
      emit({ type: 'text', data: event.content });
      if (opts.reportFile) await writeFile(opts.reportFile, String(event.content));
    }
  }
  emit({ type: 'end', stopReason: 'end_turn', sessionId: 'synthetic-grok', usage: { input_tokens: 10, output_tokens: 2 } });
}
