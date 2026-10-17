import { describe, expect, it } from 'vitest';

import { buildStructuredCompoundPatchModelResult } from '../bricks-agent/mutation-planner.mjs';

describe('nested model-led compound inserts', () => {
  it('keeps the agent-authored nested subtree intact for native Bricks id generation', () => {
    const result = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [{
        opId: 'append-card',
        action: 'insert',
        elements: [{
          name: 'div',
          label: 'Feature card 04',
          settings: {},
          children: [
            { name: 'text-basic', settings: { text: '04' }, children: [] },
            { name: 'text-basic', settings: { text: 'Know which clients need attention' }, children: [] },
            { name: 'text-basic', settings: { text: 'Act before delayed invoices compound.' }, children: [] },
          ],
        }],
        position: { mode: 'append_to', targetId: 'cards1' },
      }],
    }, {
      mode: 'design',
      runContext: { authorizedMutationSession: true },
      bricksContext: { elements: [{ id: 'cards1', name: 'div', settings: {} }] },
    });

    const operation = result?.operations[0];
    const root = operation?.elements[0];

    expect(operation).toMatchObject({
      opId: 'append-card',
      operation: 'insert',
      position: { mode: 'append_to', targetId: 'cards1' },
    });
    expect(root).toEqual({
      name: 'div',
      label: 'Feature card 04',
      settings: {},
      children: [
        { name: 'text-basic', settings: { text: '04' }, children: [] },
        { name: 'text-basic', settings: { text: 'Know which clients need attention' }, children: [] },
        { name: 'text-basic', settings: { text: 'Act before delayed invoices compound.' }, children: [] },
      ],
    });
    expect(root).not.toHaveProperty('id');
    expect(root).not.toHaveProperty('parent');
    expect(root.children[0]).not.toHaveProperty('id');
  });

  it('retains explicit flat parent/children references for native validation', () => {
    const result = buildStructuredCompoundPatchModelResult({
      action: 'compound_mutation',
      operations: [{
        action: 'insert',
        elements: [
          { id: 'card04', name: 'div', parent: 'cards1', children: ['copy04'], settings: {} },
          { id: 'copy04', name: 'text-basic', parent: 'card04', children: [], settings: { text: '04' } },
        ],
        position: { mode: 'append_to', targetId: 'cards1' },
      }],
    }, {
      mode: 'design',
      runContext: { authorizedMutationSession: true },
      bricksContext: { elements: [{ id: 'cards1', name: 'div', settings: {} }] },
    });

    expect(result?.operations[0].elements).toEqual([
      { id: 'card04', name: 'div', parent: 'cards1', children: ['copy04'], settings: {} },
      { id: 'copy04', name: 'text-basic', parent: 'card04', children: [], settings: { text: '04' } },
    ]);
  });
});
