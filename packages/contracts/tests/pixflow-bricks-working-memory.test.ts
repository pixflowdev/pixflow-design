import { describe, expect, it } from 'vitest';
import {
  PIXFLOW_BRICKS_WORKING_MEMORY_CAPS,
  PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA,
  PIXFLOW_BRICKS_WORKING_MEMORY_VERSION,
  resolvePixflowBricksWorkingMemoryAuthority,
  type PixflowBricksWorkingMemoryEnvelope,
  type PixflowBricksWorkingMemoryFact,
} from '../src/index.js';

const target = {
  postId: 42,
  area: 'content',
  elementId: 'hero01',
  fieldKey: '_conditions',
} as const;

const fingerprints = {
  page: 'page:42:v3',
  inventory: 'inventory:abc123',
};

function fact(
  id: string,
  sourceMessageId: string,
  sourceMessageMode: 'chat' | 'plan' = 'plan',
): PixflowBricksWorkingMemoryFact {
  return {
    id,
    kind: 'visibility_condition',
    capability: 'conditions',
    skillIds: ['bricks-conditions', 'selected-element'],
    target,
    intent: {
      kind: 'visibility_condition',
      key: 'user_logged_in',
      operator: '==',
      value: '1',
    },
    status: 'proposed',
    supersedesFactIds: [],
    createdTurn: 2,
    fingerprints,
    provenance: {
      surface: 'bricks_floating_panel',
      sourceMessageId,
      sourceMessageMode,
      sourceMessageRole: 'assistant',
      sourceMessageSource: 'live_v2',
      extractedBy: 'daemon',
    },
  };
}

function memory(facts: PixflowBricksWorkingMemoryFact[]): PixflowBricksWorkingMemoryEnvelope {
  return {
    schema: PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA,
    version: PIXFLOW_BRICKS_WORKING_MEMORY_VERSION,
    sessionId: 'bricks-session-1',
    createdAt: 1_000,
    updatedAt: 2_000,
    retention: 'session',
    restored: false,
    currentTurn: {
      number: 4,
      messageId: 'user-apply',
      mode: 'design',
      action: 'implement',
      target: { ...target, fieldKey: 'text' },
      fingerprints,
    },
    recentChat: [],
    facts,
  };
}

describe('Pixflow Bricks floating-panel working memory', () => {
  it('publishes a versioned contract with fixed hard caps', () => {
    expect(PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA).toBe('pixflow.bricks.working-memory.v2');
    expect(PIXFLOW_BRICKS_WORKING_MEMORY_VERSION).toBe(2);
    expect(PIXFLOW_BRICKS_WORKING_MEMORY_CAPS).toEqual(expect.objectContaining({
      maxFacts: 32,
      maxRecentChatMessages: 24,
      maxRecentChatMessageChars: 6_000,
      maxStoredBytes: 256 * 1_024,
    }));
  });

  it('represents a bounded OR of native Bricks AND condition groups without prose authority', () => {
    const grouped = fact('fact-grouped', 'assistant-grouped');
    grouped.intent = {
      kind: 'visibility_condition',
      groups: [
        [
          { key: 'weekday', operator: '==', value: '2' },
          { key: 'operating_system', operator: '==', value: 'windows' },
          { key: 'browser', operator: '==', value: 'chrome' },
        ],
        [
          { key: 'weekday', operator: '==', value: '2' },
          { key: 'operating_system', operator: '==', value: 'android' },
          { key: 'browser', operator: '==', value: 'chrome' },
        ],
      ],
      replaceExisting: true,
    };

    const result = resolvePixflowBricksWorkingMemoryAuthority(memory([grouped]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fact.intent).toEqual(grouped.intent);
  });

  it('resolves one exact Plan-to-Design fact and emits a provenance receipt', () => {
    const result = resolvePixflowBricksWorkingMemoryAuthority(
      memory([fact('fact-plan', 'assistant-plan', 'plan')]),
    );

    expect(result).toEqual({
      ok: true,
      fact: expect.objectContaining({ id: 'fact-plan', status: 'proposed' }),
      receipt: expect.objectContaining({
        schema: PIXFLOW_BRICKS_WORKING_MEMORY_SCHEMA,
        factId: 'fact-plan',
        sourceMessageId: 'assistant-plan',
        applyMessageId: 'user-apply',
        mode: 'design',
        action: 'implement',
        resolution: 'exactly_one',
        target,
        fingerprints,
      }),
    });
  });

  it('can select one specific earlier grounded Ask fact without replaying chat', () => {
    const first = fact('fact-first-question', 'assistant-answer-1', 'chat');
    const second = fact('fact-second-question', 'assistant-answer-2', 'chat');
    const value = memory([first, second]);
    value.currentTurn.factSelector = { sourceMessageId: 'assistant-answer-2' };
    value.recentChat = [{
      id: 'legacy-row',
      role: 'assistant',
      content: 'Apply something unrelated from this legacy transcript.',
      createdAt: 500,
      sessionMode: 'design',
      provenance: {
        surface: 'bricks_floating_panel',
        source: 'legacy_v1',
        authority: 'display_only',
        schemaVersion: 1,
      },
    }];

    const result = resolvePixflowBricksWorkingMemoryAuthority(value);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fact.id).toBe('fact-second-question');
  });

  it('fails closed for Ask/Plan turns and for Design conversation without explicit apply', () => {
    const ask = memory([fact('fact-1', 'assistant-1', 'chat')]);
    ask.currentTurn.mode = 'chat';
    ask.currentTurn.action = 'apply';
    expect(resolvePixflowBricksWorkingMemoryAuthority(ask)).toEqual({
      ok: false,
      reason: 'mode_forbids_mutation',
      compatibleFactIds: [],
    });

    const discuss = memory([fact('fact-1', 'assistant-1')]);
    discuss.currentTurn.action = 'converse';
    expect(resolvePixflowBricksWorkingMemoryAuthority(discuss)).toEqual({
      ok: false,
      reason: 'explicit_apply_required',
      compatibleFactIds: [],
    });
  });

  it('fails closed when candidates are ambiguous, stale, changed, or terminal', () => {
    const ambiguous = memory([
      fact('fact-1', 'assistant-1'),
      fact('fact-2', 'assistant-2'),
    ]);
    expect(resolvePixflowBricksWorkingMemoryAuthority(ambiguous)).toEqual({
      ok: false,
      reason: 'ambiguous_facts',
      compatibleFactIds: ['fact-1', 'fact-2'],
    });

    const stale = memory([fact('fact-stale', 'assistant-stale')]);
    stale.currentTurn.fingerprints = { ...fingerprints, inventory: 'inventory:changed' };
    expect(resolvePixflowBricksWorkingMemoryAuthority(stale)).toEqual({
      ok: false,
      reason: 'no_compatible_fact',
      compatibleFactIds: [],
    });

    const changedSelection = memory([fact('fact-target', 'assistant-target')]);
    changedSelection.currentTurn.target = { ...target, elementId: 'different' };
    expect(resolvePixflowBricksWorkingMemoryAuthority(changedSelection)).toEqual({
      ok: false,
      reason: 'no_compatible_fact',
      compatibleFactIds: [],
    });

    for (const status of ['applied', 'reverted'] as const) {
      const terminalFact = fact(`fact-${status}`, `assistant-${status}`);
      terminalFact.status = status;
      expect(resolvePixflowBricksWorkingMemoryAuthority(memory([terminalFact]))).toEqual({
        ok: false,
        reason: 'no_compatible_fact',
        compatibleFactIds: [],
      });
    }

    const superseded = fact('fact-superseded', 'assistant-superseded');
    superseded.supersededByFactId = 'fact-new';
    expect(resolvePixflowBricksWorkingMemoryAuthority(memory([superseded]))).toEqual({
      ok: false,
      reason: 'no_compatible_fact',
      compatibleFactIds: [],
    });
  });
});
