import { describe, expect, it } from 'vitest';

import {
  createRunSideEffectLedger,
  foldRunSideEffectEvent,
  runArtifactCountForRun,
  runSideEffectsForRun,
} from '../src/run-side-effect-ledger.js';

describe('run side-effect ledger', () => {
  it('keeps a successful artifact verdict after the event ring would truncate', () => {
    const ledger = createRunSideEffectLedger();
    foldRunSideEffectEvent(ledger, {
      event: 'agent',
      data: { type: 'tool_use', id: 'write-1', name: 'Write', input: { file_path: 'index.html' } },
    });
    foldRunSideEffectEvent(ledger, {
      event: 'agent',
      data: { type: 'tool_result', toolUseId: 'write-1', isError: false },
    });
    const run = { sideEffectLedger: ledger, events: [] };
    expect(runSideEffectsForRun(run)).toMatchObject({ artifactWriteSeen: true });
    expect(runArtifactCountForRun(run)).toBe(1);
  });

  it('does not count failed writes and drops resolved pending entries', () => {
    const ledger = createRunSideEffectLedger();
    foldRunSideEffectEvent(ledger, {
      event: 'agent',
      data: { type: 'tool_use', id: 'write-1', name: 'Edit', input: { path: 'index.html' } },
    });
    foldRunSideEffectEvent(ledger, {
      event: 'agent',
      data: { type: 'tool_result', toolUseId: 'write-1', isError: true },
    });
    expect(ledger.pendingWritePathById.size).toBe(0);
    expect(runArtifactCountForRun({ sideEffectLedger: ledger })).toBe(0);
  });

  it('does not retain results for non-write tools', () => {
    const ledger = createRunSideEffectLedger();
    for (let index = 0; index < 5_000; index += 1) {
      foldRunSideEffectEvent(ledger, {
        event: 'agent',
        data: { type: 'tool_result', toolUseId: `read-${index}`, isError: false },
      });
    }
    expect(ledger.pendingWritePathById.size).toBe(0);
  });
});
