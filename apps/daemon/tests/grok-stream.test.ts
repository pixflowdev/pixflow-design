import { describe, expect, it } from 'vitest';
import { createJsonEventStreamHandler } from '../src/json-event-stream.js';
import { grokBuildAgentDef } from '../src/runtimes/defs/grok-build.js';

function replay(rows: unknown[], split = false) {
  const events: Record<string, unknown>[] = [];
  const parser = createJsonEventStreamHandler('grok-build', event => events.push(event));
  const text = rows.map(row => JSON.stringify(row)).join('\n');
  if (split) for (const character of text) parser.feed(character); else parser.feed(text);
  parser.flush();
  return events;
}

describe('Grok native streaming transport', () => {
  it('uses structured output in real panel runs and resumes the captured native session', () => {
    expect(grokBuildAgentDef).toMatchObject({ streamFormat: 'json-event-stream', eventParser: 'grok-build', resumesSessionViaCli: true, capturesSessionIdFromStream: true });
    expect(grokBuildAgentDef.buildArgs('', [], [], {}, { promptFilePath: '/fixture/prompt.txt', resumeSessionId: 'saved-session' })).toEqual(expect.arrayContaining(['--output-format', 'streaming-json', '--resume', 'saved-session']));
  });

  it('streams text, file tools and final usage once, including split JSON and an unterminated last line', () => {
    const done = { type: 'tool_call_update', toolCallId: 'read-1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: '42' } }], rawOutput: { type: 'ReadFile' } };
    const events = replay([
      { type: 'available_commands', tools: ['read_file'], commands: ['private-command'] },
      { type: 'usage', usage: { input_tokens: 10, output_tokens: 2 }, signature: 'never expose' },
      { type: 'tool_call', toolCallId: 'read-1', toolName: 'read_file', rawInput: { target_file: '/fixture/sample.txt' }, status: 'pending' },
      { type: 'tool_call_update', toolCallId: 'read-1', status: null, content: [], rawOutput: null },
      done, done,
      { type: 'text', data: 'Answer: ' }, { type: 'text', data: '42' },
      { type: 'end', stopReason: 'end_turn', sessionId: 'saved-session', usage: { input_tokens: 12, output_tokens: 5, cache_read_input_tokens: 20, reasoning_tokens: 3 }, total_cost_usd: 0.01 },
    ], true);
    expect(events.filter(e => e.type === 'text_delta').map(e => e.delta).join('')).toBe('Answer: 42');
    expect(events.filter(e => e.type === 'tool_use')).toEqual([{ type: 'tool_use', id: 'read-1', name: 'Read', input: { target_file: '/fixture/sample.txt', file_path: '/fixture/sample.txt' } }]);
    expect(events.filter(e => e.type === 'tool_result')).toEqual([{ type: 'tool_result', toolUseId: 'read-1', content: '42', isError: false }]);
    expect(events.filter(e => e.type === 'usage')).toEqual([{ type: 'usage', usage: { input_tokens: 12, output_tokens: 5, cached_read_tokens: 20, thought_tokens: 3 }, total_cost_usd: 0.01 }]);
    expect(events).toContainEqual({ type: 'turn_end', stopReason: 'end_turn', sessionId: 'saved-session' });
    expect(JSON.stringify(events)).not.toMatch(/private-command|never expose/);
    expect(events.some(e => e.type === 'error')).toBe(false);
  });

  it('preserves failed tools without marking a later successful answer failed', () => {
    const events = replay([
      { type: 'tool_call', toolCallId: 'shell-1', toolName: 'run_terminal_command', rawInput: { command: 'missing-command' } },
      { type: 'tool_call_update', toolCallId: 'shell-1', status: 'failed', rawOutput: { error: 'Not found' } },
      { type: 'text', data: 'The command was not found.' }, { type: 'end', stopReason: 'end_turn' },
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_use', name: 'Bash' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'tool_result', isError: true }));
    expect(events.some(e => e.type === 'error')).toBe(false);
  });

  it.each([
    [{ type: 'text', data: 'Incomplete' }],
    [{ type: 'end', stopReason: 'max_turns' }],
    [{ type: 'end', stopReason: 'end_turn' }],
    [{ type: 'error', message: 'Provider unavailable' }, { type: 'end', stopReason: 'error' }],
  ])('does not silently pass a failed, empty or truncated stream: %j', (...rows) => {
    expect(replay(rows).some(e => e.type === 'error')).toBe(true);
  });
});
