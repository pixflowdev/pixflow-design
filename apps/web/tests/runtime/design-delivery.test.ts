import { describe, expect, it } from 'vitest';
import {
  applyDesignDeliveryOutcome,
  designDeliveryVerificationPending,
  isRetryableAssistantTerminalFailure,
  resolveDesignDeliveryOutcome,
} from '../../src/runtime/design-delivery';

describe('design delivery', () => {
  it('accepts successful native tool output without requiring invented final prose', () => {
    expect(resolveDesignDeliveryOutcome({ sessionMode: 'design', runStatus: 'succeeded', content: '', producedFileCount: 0,
      events: [{ kind: 'tool_use', id: 'handoff', name: 'builder.handoff', input: {} }, { kind: 'tool_result', toolUseId: 'handoff', content: '{"handoff":{"id":"receipt"}}', isError: false }],
    })).toBe('report_only');
    expect(resolveDesignDeliveryOutcome({ sessionMode: 'design', runStatus: 'succeeded', content: '', producedFileCount: 0,
      events: [{ kind: 'tool_result', toolUseId: 'handoff', content: 'Failed', isError: true }],
    })).toBe('no_result');
  });
  it('never presents an uncertain site mutation as a replayable failure', () => {
    expect(isRetryableAssistantTerminalFailure({ runStatus: 'failed', events: [{ kind: 'status', label: 'error', code: 'PIXFLOW_SITE_DELIVERY_UNCERTAIN', detail: 'Inspect first' }] })).toBe(false);
    expect(isRetryableAssistantTerminalFailure({ runStatus: 'failed' })).toBe(true);
  });
  it('accepts substantive text without a mutation attempt as a report-only result', () => {
    expect(resolveDesignDeliveryOutcome({
      sessionMode: 'design',
      runStatus: 'succeeded',
      content: 'The hero needs stronger contrast.',
      events: [{ kind: 'tool_use', id: 'read-1', name: 'Read', input: { file_path: 'hero.png' } }],
      producedFileCount: 0,
    })).toBe('report_only');
  });

  it('still requires delivery after a file mutation was attempted', () => {
    for (const event of [
      { kind: 'tool_use' as const, id: 'write-1', name: 'Write', input: { file_path: 'index.html' } },
      { kind: 'tool_use' as const, id: 'edit-1', name: 'Edit', input: { file_path: 'index.html' } },
      { kind: 'tool_use' as const, id: 'delete-1', name: 'Bash', input: { command: 'rm stale.html' } },
    ]) {
      expect(resolveDesignDeliveryOutcome({
        sessionMode: 'design',
        runStatus: 'succeeded',
        content: 'Done.',
        events: [event],
        producedFileCount: 0,
      })).toBe('no_result');
    }
  });

  it('does not accept an empty answer as report-only', () => {
    expect(resolveDesignDeliveryOutcome({
      sessionMode: 'design',
      runStatus: 'succeeded',
      content: '   ',
      events: [],
      producedFileCount: 0,
    })).toBe('no_result');
  });

  it('accepts files, persisted artifacts, and live artifacts as delivery evidence', () => {
    const base = {
      sessionMode: 'design' as const,
      runStatus: 'succeeded' as const,
      content: 'Done.',
      events: [],
      producedFileCount: 0,
    };
    expect(resolveDesignDeliveryOutcome({ ...base, producedFileCount: 1 })).toBe('delivered');
    expect(resolveDesignDeliveryOutcome({ ...base, persistenceSucceeded: true })).toBe('delivered');
    expect(resolveDesignDeliveryOutcome({
      ...base,
      events: [{
        kind: 'live_artifact',
        action: 'created',
        projectId: 'p',
        artifactId: 'a',
        title: 'Artifact',
      }],
    })).toBe('delivered');
  });

  it('does not fail clarification or unfinished turns', () => {
    expect(resolveDesignDeliveryOutcome({
      sessionMode: 'design',
      runStatus: 'succeeded',
      content: '<question-form />',
      events: [],
      producedFileCount: 0,
    })).toBe('awaiting_input');
  });

  it('does not let an unrelated produced file hide an artifact persistence failure', () => {
    expect(resolveDesignDeliveryOutcome({
      sessionMode: 'design',
      runStatus: 'succeeded',
      content: 'Done.',
      events: [],
      producedFileCount: 1,
      persistenceFailed: true,
    })).toBe('delivery_failed');
  });

  it('makes delivery failures retryable and suppresses premature completion', () => {
    expect(isRetryableAssistantTerminalFailure({
      runStatus: 'succeeded',
      resultDeliveryState: 'delivery_failed',
    })).toBe(true);
    expect(designDeliveryVerificationPending({
      sessionMode: 'design',
      runStatus: 'succeeded',
      content: 'Done.',
      events: [],
      producedFiles: undefined,
    })).toBe(true);
  });

  it('classifies rejected HTML as a source persistence failure instead of ARTIFACT_NOT_FOUND', () => {
    const result = applyDesignDeliveryOutcome({
      id: 'assistant-1',
      role: 'assistant',
      content: '<artifact identifier="probajarealty-clone">Saved above.</artifact>',
      runStatus: 'succeeded',
      events: [],
    }, 'delivery_failed', {
      code: 'HTML_ARTIFACT_INVALID',
      artifactIdentifier: 'probajarealty-clone',
      validationReason: 'content does not start with a complete HTML document',
      detail: 'The HTML source artifact "probajarealty-clone" is invalid: content does not start with a complete HTML document.',
      lifecycleMark: 'source_artifact_persist_failed',
    });

    expect(result.resultDeliveryState).toBe('delivery_failed');
    expect(result.events).toContainEqual(expect.objectContaining({
      kind: 'status',
      label: 'source_artifact_persist_failed',
      code: 'HTML_ARTIFACT_INVALID',
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      kind: 'status',
      label: 'error',
      code: 'HTML_ARTIFACT_INVALID',
    }));
    expect(result.events).not.toContainEqual(expect.objectContaining({ code: 'ARTIFACT_NOT_FOUND' }));
  });

  it('keeps ARTIFACT_NOT_FOUND for a genuinely missing deliverable', () => {
    const result = applyDesignDeliveryOutcome({
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runStatus: 'succeeded',
      events: [],
    }, 'no_result');

    expect(result.events).toContainEqual(expect.objectContaining({
      kind: 'status',
      label: 'error',
      code: 'ARTIFACT_NOT_FOUND',
    }));
  });
});
