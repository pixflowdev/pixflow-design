import { describe, expect, it } from 'vitest';
import { expandVoiceMessages } from '../../src/pixflow/voice-messages';
import { translateAgentEvent } from '../../src/providers/daemon';
import type { ChatMessage } from '../../src/types';

describe('spoken chat turns', () => {
  it('reconciles old browser partials and native completions, preserving the written reply without its spoken duplicate', () => {
    const rows = expandVoiceMessages([{ id: 'old-call', role: 'assistant', content: '', events: [
      { kind: 'voice_transcript', role: 'user', id: 'browser-turn', text: 'Can you' },
      { kind: 'voice_transcript', role: 'user', text: 'Can you build a plugin?' },
      { kind: 'text', text: 'Yes, I can write a plugin.' },
      { kind: 'voice_transcript', role: 'assistant', text: 'Yes, what should it do?' },
    ] }]);
    expect(rows.map(row => [row.role, row.content])).toEqual([['user', 'Can you build a plugin?'], ['assistant', 'Yes, I can write a plugin.']]);
  });
  const message: ChatMessage = { id: 'voice', role: 'assistant', content: '', runStatus: 'running', events: [
    { kind: 'voice_transcript', role: 'user', text: 'What is on this page?' },
    { kind: 'voice_transcript', role: 'assistant', text: 'There is a hero.' },
    { kind: 'voice_transcript', role: 'user', text: 'Make its heading shorter.' },
    { kind: 'text', text: 'I’ll edit the heading.' },
    { kind: 'status', code: 'voice_connection', label: 'connected' },
  ] };
  it('alternates real user and assistant rows without changing the saved run', () => {
    const rows = expandVoiceMessages([message]);
    expect(rows.map(row => [row.role, row.content])).toEqual([
      ['user', 'What is on this page?'], ['assistant', 'There is a hero.'],
      ['user', 'Make its heading shorter.'], ['assistant', 'I’ll edit the heading.'],
    ]);
    expect(rows.at(-1)).toMatchObject({ id: 'voice', runStatus: 'running' });
    expect(rows.slice(0, -1).filter(row => row.role === 'assistant').every(row => row.runStatus === 'succeeded')).toBe(true);
    expect(message.content).toBe('');
    expect(rows.filter(row => row.role === 'assistant').every(row => row.agentName === 'Codex Voice')).toBe(true);
    expect(expandVoiceMessages(JSON.parse(JSON.stringify([message])))).toEqual(rows);
  });
  it('keeps typed messages and text resembling speaker labels unchanged', () => {
    const typed: ChatMessage = { id: 'typed', role: 'assistant', content: '**You:** quoted text' };
    expect(expandVoiceMessages([typed])[0]).toBe(typed);
  });
  it('preserves structured speaker identity at the transport boundary', () => {
    expect(translateAgentEvent({ type: 'voice_transcript', role: 'user', text: 'Hello', id: 'one' })).toMatchObject({ kind: 'voice_transcript', role: 'user', text: 'Hello', id: 'one' });
  });
});
