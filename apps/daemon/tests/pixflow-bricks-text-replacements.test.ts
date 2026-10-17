import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizePixflowBricksTextReplacements } from '../src/pixflow-bricks-working-memory.js';

const targets = [
  { elementId: 'heading', fieldKey: 'text', targetKind: 'text', currentText: 'Sharper.' },
  { elementId: 'button', fieldKey: 'text', targetKind: 'text', currentText: 'Start a conversation' },
];
const change = { elementId: 'button', fieldKey: 'text', replacementText: "Let's talk" };
describe('Bricks stream text replacement authority', () => {
  it('builds the stream presentation from validated patches without a selected-target fallback', () => {
    // Execute the real server handoff: helper-only tests cannot detect stale
    // locals in server.ts, whose legacy module still disables type checking.
    const source = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
    const start = source.indexOf('const sourceItems =', source.indexOf('const textPatches ='));
    const end = source.indexOf('const mutationType = resultMutationType;', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = ts.transpile(source.slice(start, end));
    const present = new Function('patches', 'directPatches', 'targetIndex', 'result', 'target', 'selectedId', `${body}; return { firstId, targetLabel };`);
    expect(present(
      [{ id: 'button', settings: { text: "Let's talk" } }], [],
      new Map([['button', { targetLabel: 'Button' }]]), {}, { targetLabel: 'Heading' }, 'heading',
    )).toEqual({ firstId: 'button', targetLabel: 'Button' });
  });
  it.each([
    [], [{ ...change, elementId: 'wrapper' }], [{ ...change, fieldKey: 'url' }],
    [{ replacementText: "Let's talk" }], [change, { ...change, elementId: 'missing' }],
    [change, change], [{ ...change, replacementText: '' }],
  ])('rejects incomplete or incompatible batches: %j', (...replacements) => {
    expect(normalizePixflowBricksTextReplacements(replacements, targets)).toBeNull();
  });
  it('does not substitute selection for an empty normalized list', () => {
    expect(normalizePixflowBricksTextReplacements([], targets)).toBeNull();
  });
  it('retains every exact agent-chosen target', () => {
    expect(normalizePixflowBricksTextReplacements([change], targets)).toEqual([
      { id: 'button', settings: { text: "Let's talk" } },
    ]);
  });
});
