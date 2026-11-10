import { expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../src/claude-stream.js';

it.each(['stream-first', 'wrapper-first'] as const)('emits a Claude tool once across %s and repeated assistant frames', order => {
  const events: Record<string, unknown>[] = [];
  const parser = createClaudeStreamHandler(event => events.push(event));
  const feed = (value: object) => parser.feed(JSON.stringify(value) + '\n');
  const block = { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'read-only inspection' } };
  const wrapper = { type: 'assistant', message: { id: 'msg-1', content: [block], stop_reason: 'tool_use' } };
  const streamed = () => {
    feed({ type: 'stream_event', event: { type: 'message_start', message: { id: 'msg-1' } } });
    feed({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: block } });
    feed({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } });
  };
  if (order === 'wrapper-first') feed(wrapper);
  streamed();
  feed(wrapper);
  feed(wrapper);
  feed({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'Read confirmed', is_error: false }] } });
  // A genuinely new call with identical input is still a separate execution.
  feed({ type: 'assistant', message: { id: 'msg-2', content: [{ ...block, id: 'tool-2' }] } });
  parser.flush();
  expect(events.filter(event => event.type === 'tool_use')).toEqual([
    { type: 'tool_use', id: 'tool-1', name: 'Bash', input: block.input },
    { type: 'tool_use', id: 'tool-2', name: 'Bash', input: block.input },
  ]);
  expect(events.filter(event => event.type === 'tool_result')).toHaveLength(1);
});
