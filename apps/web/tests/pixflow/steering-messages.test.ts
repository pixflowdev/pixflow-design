import { expect, it } from 'vitest';
import { expandSteeringMessages, steeringTranscriptEvents } from '../../src/pixflow/steering-messages';
import type { ChatMessage } from '../../src/types';

it('keeps a streamed reply intact until its native item completes, without an empty Preparing row', () => {
  const message: ChatMessage = { id: 'run', role: 'assistant', content: 'A partial sentence', runStatus: 'running', events: [
    { kind: 'assistant_message_boundary', phase: 'started', messageId: 'item-1', contentOffset: 0 },
    { kind: 'text', text: 'A partial sentence' },
    { kind: 'steering_message', id: 'one', text: 'Use blue', contentOffset: 18, createdAt: 1 },
  ] };
  expect(expandSteeringMessages([message])).toEqual([message]);
  const completed = { ...message, content: 'A partial sentence, now finished.', events: [...message.events!,
    { kind: 'text' as const, text: ', now finished.' },
    { kind: 'assistant_message_boundary' as const, phase: 'completed' as const, messageId: 'item-1', contentOffset: 33 },
  ] };
  const rows = expandSteeringMessages([completed]);
  expect(rows.map(row => [row.role, row.content])).toEqual([['assistant', completed.content], ['user', 'Use blue']]);
  expect(rows[0]).toMatchObject({ id: 'run', runStatus: 'running' });
});

it('preserves ordered multiple steers and resumes text only after the message boundary', () => {
  const message: ChatMessage = { id: 'run', role: 'assistant', content: 'Full answer.\n\nNext answer.', runStatus: 'running', events: [
    { kind: 'assistant_message_boundary', phase: 'started', messageId: 'first', contentOffset: 0 },
    { kind: 'text', text: 'Full ' },
    { kind: 'steering_message', id: 'one', text: 'Use blue', contentOffset: 5, createdAt: 1 },
    { kind: 'steering_message', id: 'two', text: 'And a footer', contentOffset: 5, createdAt: 2 },
    { kind: 'text', text: 'answer.' },
    { kind: 'assistant_message_boundary', phase: 'completed', messageId: 'first', contentOffset: 12 },
    { kind: 'assistant_message_boundary', phase: 'started', messageId: 'second', contentOffset: 12 },
    { kind: 'text', text: '\n\nNext answer.' },
  ] };
  const rows = expandSteeringMessages([message]);
  expect(rows.map(row => [row.role, row.content])).toEqual([['assistant', 'Full answer.'], ['user', 'Use blue'], ['user', 'And a footer'], ['assistant', '\n\nNext answer.']]);
  expect(rows.at(-1)?.runStatus).toBe('running');
  const retained = steeringTranscriptEvents(message.events);
  expect(expandSteeringMessages([{ ...message, events: retained }]).map(row => row.content)).toEqual(rows.map(row => row.content));
});

it('places each accepted message at its stream boundary and leaves the live tail in charge', () => {
  const message = { id: 'run', role: 'assistant', content: 'BeforeAfter', runStatus: 'running', events: [
    { kind: 'text', text: 'Before' },
    { kind: 'steering_message', id: 'one', text: 'Change this', contentOffset: 6, createdAt: 123, attachments: [{ kind: 'image', name: 'Reference', path: 'image.png' }] },
    { kind: 'steering_message', id: 'two', text: 'Also this', contentOffset: 6, createdAt: 124 },
    { kind: 'text', text: 'After' },
  ] } as ChatMessage;
  const rows = expandSteeringMessages([message]);
  expect(rows.map(row => [row.role, row.content])).toEqual([['assistant', 'Before'], ['user', 'Change this'], ['user', 'Also this'], ['assistant', 'After']]);
  expect(rows[1]?.attachments).toHaveLength(1);
  expect(rows.at(-1)).toMatchObject({ id: 'run', runStatus: 'running' });
  expect(rows[0]?.runStatus).toBe('succeeded');
  expect(expandSteeringMessages([{ ...message, events: steeringTranscriptEvents(message.events) }]).map(row => row.content)).toEqual(rows.map(row => row.content));
});

it('deduplicates accepted acknowledgments without inventing an empty streaming tail', () => {
  const steer = { kind: 'steering_message', id: 'one', text: 'Hello', contentOffset: 0, createdAt: 12 };
  const rows = expandSteeringMessages([{ id: 'run', role: 'assistant', content: '', events: [steer, steer] } as ChatMessage]);
  expect(rows.map(row => row.role)).toEqual(['user']);
});

it.each(['canceled', 'failed'] as const)('retains pending accepted guidance when the native item ends with %s', runStatus => {
  const message: ChatMessage = { id: 'run', role: 'assistant', content: 'Partial output', runStatus, endedAt: 10, events: [
    { kind: 'assistant_message_boundary', phase: 'started', messageId: 'unfinished', contentOffset: 0 },
    { kind: 'steering_message', id: 'accepted', text: 'Keep this correction', contentOffset: 7, createdAt: 5 },
  ] };
  expect(expandSteeringMessages([message]).map(row => [row.role,row.content])).toEqual([['assistant','Partial output'],['user','Keep this correction']]);
  expect(expandSteeringMessages([message])[0]?.runStatus).toBe(runStatus);
});
