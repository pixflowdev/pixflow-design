import { describe, expect, it } from 'vitest';

import {
  buildQuestionFormKey,
  mergeServerMessagesIntoConversation,
} from '../../src/components/ProjectView';
import type { ChatMessage, ProjectFile } from '../../src/types';

describe('buildQuestionFormKey', () => {
  it('is stable across a streaming form-id change (no remount mid-answer)', () => {
    // The streaming preview shows the `discovery` fallback id until the body id
    // streams in; a form that emits answerable questions before its id flips
    // the parsed id late. The React key must NOT change across that flip, or
    // the panel remounts and drops in-progress selections. Same conversation +
    // message ⇒ same key regardless of the parsed id.
    const early = buildQuestionFormKey('conv-1', 'msg-1', true);
    const settled = buildQuestionFormKey('conv-1', 'msg-1', true);
    expect(early).toBe('conv-1:msg-1');
    expect(settled).toBe(early);
  });

  it('gives a distinct key to a later form in a different assistant message', () => {
    // A second discovery form (same `discovery` template id) lives in its own
    // assistant message, so it still gets its own key and replays the reveal —
    // without folding the id into the key.
    expect(buildQuestionFormKey('conv-1', 'msg-1', true)).not.toBe(
      buildQuestionFormKey('conv-1', 'msg-2', true),
    );
  });

  it('returns null until a form, conversation, and message are all present', () => {
    expect(buildQuestionFormKey(null, 'msg-1', true)).toBeNull();
    expect(buildQuestionFormKey('conv-1', null, true)).toBeNull();
    expect(buildQuestionFormKey('conv-1', 'msg-1', false)).toBeNull();
  });
});

describe('mergeServerMessagesIntoConversation', () => {
  it('keeps older loaded history before the latest page when refreshing a continued fork', () => {
    const current = Array.from({ length: 6 }, (_, i) => ({ id: `saved-${i}`, role: 'assistant' as const, content: `Paragraph ${i}\n\nSecond paragraph.`, historySequence: i + 1 }));
    const pending: ChatMessage = { id: 'pending', role: 'user', content: 'Next request' };
    const recent = [...current.slice(2), { id: 'new-reply', role: 'assistant' as const, agentId: 'codex', content: 'Latest answer', historySequence: 7 }];
    const merged = mergeServerMessagesIntoConversation([...current, pending], recent);
    expect(merged.map(message => message.id)).toEqual([...current.map(message => message.id), 'new-reply', 'pending']);
    expect(merged[0]?.content).toBe('Paragraph 0\n\nSecond paragraph.');
    expect(merged[6]?.agentId).toBe('codex');
  });
  it('does not replace a newer streamed assistant turn with a stale WordPress copy', () => {
    const local = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'The complete streamed response with the generated artifact.',
      createdAt: 1,
      runId: 'run-1',
      runStatus: 'succeeded',
      events: [
        { kind: 'text', text: 'The complete streamed response with the generated artifact.' },
      ],
    } satisfies ChatMessage;
    const server = {
      ...local,
      content: 'Working',
      runStatus: 'running' as const,
      events: [{ kind: 'text' as const, text: 'Working' }],
    };

    const [merged] = mergeServerMessagesIntoConversation([local], [server]);

    expect(merged?.content).toBe(local.content);
    expect(merged?.events).toEqual(local.events);
    expect(merged?.runStatus).toBe('succeeded');
  });

  it('adds server-created CTA messages while preserving local produced files', () => {
    const producedFile: ProjectFile = {
      name: 'deck.html',
      size: 1024,
      mtime: 1,
      kind: 'html',
      mime: 'text/html',
    };
    const localMessages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Use this SKILL.md',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        runStatus: 'succeeded',
        producedFiles: [producedFile],
      },
    ];
    const serverMessages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Use this SKILL.md',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        runStatus: 'succeeded',
      },
      {
        id: 'cta-1',
        role: 'assistant',
        content: '',
        events: [
          {
            kind: 'plugin_candidate',
            candidateId: 'candidate-1',
            title: 'Main',
            description: 'This repo looks like a plugin.',
          },
        ],
      },
    ];

    const merged = mergeServerMessagesIntoConversation(localMessages, serverMessages);

    expect(merged.map((message) => message.id)).toEqual(['user-1', 'assistant-1', 'cta-1']);
    expect(merged[1]?.producedFiles).toEqual([producedFile]);
  });
});
