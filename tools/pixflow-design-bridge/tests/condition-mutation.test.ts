import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  validateAgentProposedWorkingMemoryFact as buildDirectLoggedInConditionModelResult,
  validateAgentProposedWorkingMemoryFact as buildDirectLinkPatchModelResult,
  validateAgentProposedWorkingMemoryFact as buildDirectQueryLoopModelResult,
  validateAgentProposedWorkingMemoryFact as buildProposedQueryLoopFact,
  validateAgentProposedWorkingMemoryFact as buildProposedVisibilityConditionFact,
  validateAgentProposedWorkingMemoryFact as selectProposedWorkingMemoryFact,
  buildStructuredCompoundPatchModelResult,
  buildStructuredConditionPatchModelResult,
  buildStructuredQueryLoopPatchModelResult,
  hasStructuredQueryLoopIntentPayload,
  normalizeBricksAgentMutationPlan,
} from '../bricks-agent/mutation-planner.mjs';
import {
  normalizeBricksAgentEscalationResult,
  normalizeBricksAgentRouteResult,
} from '../bricks-agent/result-normalizer.mjs';

const conditionTarget = {
  elementId: '6z8zty',
  fieldKey: '_conditions',
  targetKind: 'conditions',
  targetLabel: 'Hero',
};

function resolvedConditionFact(elementId = 'yc481g') {
  return {
    id: 'fact-plan-condition',
    kind: 'visibility_condition',
    capability: 'conditions',
    target: { postId: 42, area: 'content', elementId, fieldKey: '_conditions' },
    intent: {
      kind: 'visibility_condition',
      key: 'dynamic_data',
      operator: '==',
      value: 'members',
      dynamicDataTag: '{url_parameter:audience}',
    },
  };
}
function resolvedQueryFact(elementId = 'loop01') {
  return {
    id: `fact-query-${elementId}`,
    kind: 'query_loop',
    capability: 'query_loop',
    target: { postId: 42, area: 'content', elementId, fieldKey: 'query' },
    intent: { kind: 'query_loop', objectType: 'post', postType: 'page', postsPerPage: 6, orderBy: 'title', order: 'ASC' },
  };
}

function authorityForFact(fact: { id: string }) {
  return { factId: fact.id, resolution: 'exactly_one' };
}
describe('Bricks Agent condition mutations', () => {
  it('keeps Ask and Plan condition guidance human-readable while schemas stay internal', () => {
    const source = readFileSync(new URL('../bricks-handoff-cli.mjs', import.meta.url), 'utf8');
    expect(source).toContain('select the element row in Structure, open Conditions in the element settings, choose Add condition');
    expect(source).toContain('The Ask answer must never include raw JSON');
    expect(source).toContain('The Plan answer must never include raw JSON');
    expect(source).toContain('The structured `workingMemoryFact` remains a separate internal response field');
  });

  it('constructs the native Bricks patch from one valid bounded structured condition', () => {
    expect(buildStructuredConditionPatchModelResult({
      action: 'condition',
      targetId: '6z8zty',
      condition: {
        key: 'dynamic_data',
        operator: '==',
        value: 'members',
        dynamicDataTag: '{url_parameter:audience}',
      },
      answer: 'I limited the Hero to members.',
      mutationTitle: 'Limit Hero visibility',
      changeSummary: 'Show Hero when the audience URL parameter equals members.',
    }, {
      mode: 'design',
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[]' }],
    })).toMatchObject({
      action: 'patch',
      mutationType: 'element_condition_update',
      answer: 'I limited the Hero to members.',
      patches: [{
        elementId: '6z8zty',
        fieldKey: '_conditions',
        value: [[{
          key: 'dynamic_data',
          dynamic_data: '{url_parameter:audience}',
          compare: '==',
          value: 'members',
        }]],
      }],
    });
  });

  it('preserves every requested row in one native AND condition group', () => {
    expect(buildStructuredConditionPatchModelResult({
      action: 'condition',
      targetId: '6z8zty',
      conditionGroups: [[
        { key: 'weekday', operator: '==', value: '2' },
        { key: 'operating_system', operator: '==', value: 'windows' },
        { key: 'browser', operator: '==', value: 'chrome' },
      ]],
      replaceExisting: true,
      answer: 'I limited the Hero to Windows visitors using Chrome on Tuesdays.',
    }, {
      mode: 'design',
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[]' }],
    })).toMatchObject({
      action: 'patch',
      mutationType: 'element_condition_update',
      patches: [{
        elementId: '6z8zty',
        fieldKey: '_conditions',
        value: [[
          { key: 'weekday', compare: '==', value: '2' },
          { key: 'operating_system', compare: '==', value: 'windows' },
          { key: 'browser', compare: '==', value: 'chrome' },
        ]],
      }],
    });
  });

  it('normalizes a scalar user role into the native Bricks multi-select value', () => {
    expect(buildStructuredConditionPatchModelResult({
      action: 'condition',
      targetId: '6z8zty',
      conditionGroups: [[
        { key: 'user_logged_in', operator: '==', value: '1' },
        { key: 'user_role', operator: '==', value: 'subscriber' },
      ]],
      replaceExisting: true,
      answer: 'I limited the Hero to logged-in Subscribers.',
    }, {
      mode: 'design',
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[]' }],
    })).toMatchObject({
      action: 'patch',
      patches: [{
        value: [[
          { key: 'user_logged_in', compare: '==', value: '1' },
          { key: 'user_role', compare: '==', value: ['subscriber'] },
        ]],
      }],
    });
  });

  it('normalizes a scalar user role inside a model-led raw settings patch', () => {
    expect(normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{
        id: '6z8zty',
        settings: {
          _conditions: [[
            { id: 'login1', key: 'user_logged_in', compare: '==', value: '1' },
            { id: 'role01', key: 'user_role', compare: '==', value: 'subscriber' },
          ]],
        },
      }],
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[]' }],
    })).toMatchObject({
      patches: [{
        id: '6z8zty',
        settings: {
          _conditions: [[
            { id: 'login1', key: 'user_logged_in', compare: '==', value: '1' },
            { id: 'role01', key: 'user_role', compare: '==', value: ['subscriber'] },
          ]],
        },
      }],
    });
  });

  it('preserves an OR of bounded native AND groups and requires explicit replacement of existing conditions', () => {
    const groupedResult = {
      action: 'condition',
      targetId: '6z8zty',
      conditionGroups: [
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
      answer: 'I applied the two requested Tuesday visibility alternatives.',
    };
    const requestWithExistingCondition = {
      mode: 'design',
      editableOptionTargets: [{
        ...conditionTarget,
        valuePreview: '[[{"key":"weekday","compare":"==","value":"2"}]]',
      }],
    };

    expect(buildStructuredConditionPatchModelResult(groupedResult, requestWithExistingCondition)).toBeNull();
    expect(buildStructuredConditionPatchModelResult({
      ...groupedResult,
      replaceExisting: true,
    }, requestWithExistingCondition)).toMatchObject({
      action: 'patch',
      patches: [{
        value: [
          [
            { key: 'weekday', compare: '==', value: '2' },
            { key: 'operating_system', compare: '==', value: 'windows' },
            { key: 'browser', compare: '==', value: 'chrome' },
          ],
          [
            { key: 'weekday', compare: '==', value: '2' },
            { key: 'operating_system', compare: '==', value: 'android' },
            { key: 'browser', compare: '==', value: 'chrome' },
          ],
        ],
      }],
    });
  });

  it('rejects incomplete, ambiguous, active-target, and read-only structured conditions', () => {
    const valid = {
      action: 'condition',
      targetId: '6z8zty',
      condition: { key: 'weekday', operator: '==', value: '1' },
    };
    const request = {
      mode: 'design',
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[]' }],
    };
    expect(buildStructuredConditionPatchModelResult({ ...valid, condition: { key: 'weekday', value: '1' } }, request)).toBeNull();
    expect(buildStructuredConditionPatchModelResult({ ...valid, targetId: '' }, request)).toBeNull();
    expect(buildStructuredConditionPatchModelResult({ ...valid, condition: { key: 'invented_key', operator: '==', value: '1' } }, request)).toBeNull();
    expect(buildStructuredConditionPatchModelResult({ ...valid, condition: { key: 'dynamic_data', operator: '==', value: 'members', dynamicDataTag: '{invented_tag}' } }, request)).toBeNull();
    expect(buildStructuredConditionPatchModelResult(valid, { ...request, mode: 'plan' })).toBeNull();
    expect(buildStructuredConditionPatchModelResult(valid, {
      ...request,
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[[{"key":"weekday"}]]' }],
    })).toBeNull();
    expect(buildStructuredConditionPatchModelResult(valid, {
      ...request,
      editableOptionTargets: [
        { ...conditionTarget, valuePreview: '[]' },
        { ...conditionTarget, targetLabel: 'Duplicate', valuePreview: '[]' },
      ],
    })).toBeNull();
  });

  it('keeps structured repair bounded, single-pass, and token-conscious', () => {
    const source = readFileSync(new URL('../bricks-handoff-cli.mjs', import.meta.url), 'utf8');
    expect(source).toContain('quick-text-edit-condition-repair-prompt.txt');
    expect(source).toContain("runLocalInvocation(repairInvocation, workspaceDir, 'Quick text edit condition repair')");
    expect(source.match(/Quick text edit condition repair/g)).toHaveLength(1);
    expect(source).toContain('.slice(0, 800)');
    expect(source).toContain('Resolved typed fact:');
    expect(source).toContain("'This is a bounded schema repair, not a new design pass.");
    expect(source).toContain('conditionStructuredFailureResult');
    expect(source).toContain('`conditionGroups` is an outer OR list; every row inside one group is AND-linked');
    expect(source).toContain('Include every visibility clause from the latest request exactly once in each applicable group');
  });

  it('runs at most one repair and converts its structured intent into a native patch', () => {
    const root = mkdtempSync(join(tmpdir(), 'pixflow-condition-repair-'));
    const workspace = join(root, 'workspace');
    const requestFile = join(root, 'request.json');
    const fixture = join(root, 'runner.cjs');
    mkdirSync(workspace, { recursive: true });
    writeFileSync(requestFile, JSON.stringify({
      mode: 'design',
      prompt: 'Apply that plan to the product update section.',
      resolvedWorkingMemoryFact: resolvedConditionFact(),
      editableOptionTargets: [{
        elementId: 'yc481g',
        fieldKey: '_conditions',
        targetKind: 'conditions',
        targetLabel: 'Product update section',
        valuePreview: '[]',
      }],
    }));
    const binDir = join(root, 'bin');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(fixture, [
      "let prompt = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', chunk => { prompt += chunk; });",
      "process.stdin.on('end', () => {",
      "  const repair = prompt.includes('bounded schema repair');",
      "  const payload = repair ? { action: 'condition', targetId: 'yc481g', condition: { key: 'dynamic_data', operator: '==', value: 'members', dynamicDataTag: '{url_parameter:audience}' }, answer: 'Applied the audience condition.', mutationTitle: 'Limit product update visibility', changeSummary: 'Show only when audience equals members.' } : { action: 'answer', answer: 'Inventory confirmed.' };",
      "  console.log(JSON.stringify({ type: 'text', part: { type: 'text', text: JSON.stringify(payload) } }));",
      "});",
    ].join('\n'));
    writeFileSync(join(binDir, 'opencode-cli.cmd'), `@echo off\r\nnode "${fixture}" %*\r\n`);
    try {
      const bridgeCli = fileURLToPath(new URL('../bricks-handoff-cli.mjs', import.meta.url));
      execFileSync(process.execPath, [
        bridgeCli,
        'quick-text-edit',
        '--input', requestFile,
        '--workspace', workspace,
        '--runner', 'opencode',
        '--json',
      ], {
        env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}` },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const result = JSON.parse(readFileSync(join(workspace, 'quick-text-edit-result.json'), 'utf8'));
      expect(result).toMatchObject({
        status: 'completed',
        action: 'patch',
        conditionStructuredOutput: {
          primary: false,
          repairAttempted: true,
          repairSucceeded: true,
          fallbackUsed: false,
        },
        patches: [{
          id: 'yc481g',
          fieldKey: '_conditions',
          settings: {
            _conditions: [[{
              key: 'dynamic_data',
              dynamic_data: '{url_parameter:audience}',
              compare: '==',
              value: 'members',
            }]],
          },
        }],
      });
      expect(readFileSync(join(workspace, 'quick-text-edit-condition-repair-prompt.txt'), 'utf8').length).toBeLessThan(5000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns a friendly non-mutating answer when the one bounded target repair still leaves semantic targets ambiguous', () => {
    const root = mkdtempSync(join(tmpdir(), 'pixflow-condition-ambiguity-'));
    const workspace = join(root, 'workspace');
    const requestFile = join(root, 'request.json');
    const fixture = join(root, 'runner.cjs');
    mkdirSync(workspace, { recursive: true });
    writeFileSync(requestFile, JSON.stringify({
      mode: 'design',
      prompt: 'Make the update section visible only on Mondays. Apply it now.',
      bricksContext: {
        selectedId: 'bteokh',
        targetResolution: {
          status: 'ambiguous',
          activeSelectionId: 'bteokh',
          query: 'update',
          candidates: [
            { elementId: 'yc481g', elementType: 'section', label: 'Product update' },
            { elementId: 'mrr6i9', elementType: 'section', label: 'Team update' },
          ],
        },
      },
      editableOptionTargets: [
        { elementId: 'yc481g', fieldKey: '_conditions', targetKind: 'conditions', targetLabel: 'Product update', valuePreview: '[]' },
        { elementId: 'mrr6i9', fieldKey: '_conditions', targetKind: 'conditions', targetLabel: 'Team update', valuePreview: '[]' },
        { elementId: 'bteokh', fieldKey: 'javascriptCode', targetKind: 'code_javascript', targetLabel: 'Code', valuePreview: '' },
      ],
    }));
    const binDir = join(root, 'bin');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(fixture, [
      "process.stdin.setEncoding('utf8');",
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  const payload = { action: 'condition', targetId: 'bteokh', condition: { key: 'weekday', operator: '==', value: '1' }, reason: 'More than one compatible live target remains.' };",
      "  console.log(JSON.stringify({ type: 'text', part: { type: 'text', text: JSON.stringify(payload) } }));",
      "});",
    ].join('\n'));
    writeFileSync(join(binDir, 'opencode-cli.cmd'), `@echo off\r\nnode "${fixture}" %*\r\n`);
    try {
      const bridgeCli = fileURLToPath(new URL('../bricks-handoff-cli.mjs', import.meta.url));
      execFileSync(process.execPath, [
        bridgeCli,
        'quick-text-edit',
        '--input', requestFile,
        '--workspace', workspace,
        '--runner', 'opencode',
        '--json',
      ], {
        env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}` },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const result = JSON.parse(readFileSync(join(workspace, 'quick-text-edit-result.json'), 'utf8'));
      expect(result).toMatchObject({
        status: 'answered',
        action: 'answer',
        targetSelectionRepair: {
          attempted: true,
          succeeded: false,
          maxAttempts: 1,
        },
      });
      expect(result.answer).toContain('more than one matching element');
      expect(result.patches ?? []).toEqual([]);
      expect(readFileSync(join(workspace, 'quick-text-edit-target-selection-repair-prompt.txt'), 'utf8'))
        .toContain('Repair exactly one target selection');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skip('legacy prompt-derived logged-in condition recovery is no longer supported', () => {
    expect(buildDirectLoggedInConditionModelResult({
      mode: 'design',
      prompt: 'Make the selected section visible only to logged-in users.',
      bricksContext: { selectedId: '6z8zty' },
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[]' }],
    })).toMatchObject({
      action: 'patch',
      mutationType: 'element_condition_update',
      patches: [{
        elementId: '6z8zty',
        fieldKey: '_conditions',
        value: [[{
          key: 'user_logged_in',
          compare: '==',
          value: '1',
        }]],
      }],
    });
  });

  it.skip.each([
    ['Show this section only to logged-out visitors.', { key: 'user_logged_in', compare: '==', value: '0' }],
    ['Show this section when the current URL contains campaign=summer.', { key: 'current_url', compare: 'contains', value: 'campaign=summer' }],
    ['Show this section only on Mondays.', { key: 'weekday', compare: '==', value: '1' }],
    ['Show this section on or after 1 August 2026.', { key: 'date', compare: '>=', value: '2026-08-01' }],
    ['Show this section when the current post title contains “Scoped”.', { key: 'dynamic_data', dynamic_data: '{post_title}', compare: 'contains', value: 'Scoped' }],
    ['Show this section when the audience URL parameter equals members.', { key: 'dynamic_data', dynamic_data: '{url_parameter:audience}', compare: '==', value: 'members' }],
  ])('recovers a safe selected condition when the model returns prose: %s', (prompt, condition) => {
    expect(buildDirectLoggedInConditionModelResult({
      mode: 'design',
      prompt,
      bricksContext: { selectedId: '6z8zty' },
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[]' }],
    })).toMatchObject({
      action: 'patch',
      mutationType: 'element_condition_update',
      patches: [{ elementId: '6z8zty', fieldKey: '_conditions', value: [[condition]] }],
    });
  });
  it.skip('legacy prompt-derived condition recovery is no longer supported', () => {
    const fact = {
      id: 'fact-ask-logged-in',
      kind: 'visibility_condition',
      capability: 'conditions',
      target: { postId: 937, area: 'content', elementId: '6z8zty', fieldKey: '_conditions' },
      intent: { kind: 'visibility_condition', key: 'user_logged_in', operator: '==', value: '1' },
    };
    expect(buildDirectLoggedInConditionModelResult({
      mode: 'design',
      prompt: 'Apply that condition now.',
      resolvedWorkingMemoryFact: fact,
      workingMemoryAuthority: authorityForFact(fact),
      bricksContext: { selectedId: '6z8zty' },
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[[]]' }],
    })).toMatchObject({
      action: 'patch',
      patches: [{
        elementId: '6z8zty',
        fieldKey: '_conditions',
        value: [[{ key: 'user_logged_in', compare: '==', value: '1' }]],
      }],
    });
  });
  it.skip.each(['chat', 'plan'])('legacy prompt-derived proposed condition facts are no longer supported in %s', (mode) => {
    expect(buildProposedVisibilityConditionFact({
      mode,
      prompt: 'Would showing the selected hero only when the visitor is logged in be valid?',
      workingMemory: {
        currentTurn: {
          number: 3,
          messageId: `message-${mode}`,
          target: { postId: 937, area: 'content', elementId: '6z8zty', fieldKey: null },
          fingerprints: { page: 'page-fingerprint', inventory: 'inventory-fingerprint' },
        },
      },
      bricksContext: { postId: 937, area: 'content', selectedId: '6z8zty' },
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[[]]' }],
    })).toMatchObject({
      kind: 'visibility_condition',
      capability: 'conditions',
      target: { postId: 937, area: 'content', elementId: '6z8zty', fieldKey: '_conditions' },
      intent: { kind: 'visibility_condition', key: 'user_logged_in', operator: '==', value: '1' },
      status: 'proposed',
      createdTurn: 3,
      fingerprints: { page: 'page-fingerprint', inventory: 'inventory-fingerprint' },
      provenance: { sourceMessageId: `message-${mode}`, sourceMessageMode: mode },
    });
  });
  it.skip.each([
    ['Monday', '1'],
    ['Tuesday', '2'],
    ['Wednesday', '3'],
    ['Thursday', '4'],
    ['Friday', '5'],
    ['Saturday', '6'],
    ['Sunday', '7'],
  ])('constructs a bounded proposed weekday fact for %s', (weekday, value) => {
    expect(buildProposedVisibilityConditionFact({
      mode: 'chat',
      prompt: `How can I make the selected element visible only on ${weekday}s?`,
      workingMemory: {
        currentTurn: {
          number: 4,
          messageId: `message-${weekday.toLowerCase()}`,
          target: { postId: 937, area: 'content', elementId: '6z8zty', fieldKey: null },
          fingerprints: { page: 'page-fingerprint', inventory: 'inventory-fingerprint' },
        },
      },
      bricksContext: { postId: 937, area: 'content', selectedId: '6z8zty' },
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[]' }],
    })).toMatchObject({
      kind: 'visibility_condition',
      capability: 'conditions',
      target: { postId: 937, area: 'content', elementId: '6z8zty', fieldKey: '_conditions' },
      intent: { kind: 'visibility_condition', key: 'weekday', operator: '==', value },
      status: 'proposed',
    });
  });
  it.skip('deterministic proposed intents no longer override agent-authored facts', () => {
    const deterministic = buildProposedVisibilityConditionFact({
      mode: 'plan',
      prompt: 'Plan how to make the selected element visible only to logged-out visitors.',
      workingMemory: {
        currentTurn: {
          number: 5,
          messageId: 'message-plan-logged-out',
          target: { postId: 937, area: 'content', elementId: '6z8zty', fieldKey: null },
          fingerprints: { page: 'page-fingerprint', inventory: 'inventory-fingerprint' },
        },
      },
      bricksContext: { postId: 937, area: 'content', selectedId: '6z8zty' },
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[]' }],
    });
    expect(selectProposedWorkingMemoryFact({
      kind: 'visibility_condition',
      target: { postId: 937, area: 'content', elementId: 'wrong-id', fieldKey: '_conditions' },
      intent: { kind: 'visibility_condition', key: 'user_logged_in', operator: '==', value: '1' },
    }, deterministic)).toMatchObject({
      target: { postId: 937, area: 'content', elementId: '6z8zty', fieldKey: '_conditions' },
      intent: { kind: 'visibility_condition', key: 'user_logged_in', operator: '==', value: '0' },
      provenance: { sourceMessageId: 'message-plan-logged-out', extractedBy: 'bridge' },
    });
  });
  it.skip('legacy prompt-derived dynamic condition recovery is no longer supported', () => {
    expect(buildDirectLoggedInConditionModelResult({
      mode: 'design',
      prompt: 'Apply that plan to the product update section.',
      resolvedWorkingMemoryFact: resolvedConditionFact(),
      bricksContext: { selectedId: '6z8zty' },
      editableOptionTargets: [
        { ...conditionTarget, valuePreview: '[]' },
        {
          ...conditionTarget,
          elementId: 'yc481g',
          targetLabel: 'Product update section',
          valuePreview: '[]',
        },
      ],
    })).toMatchObject({
      action: 'patch',
      mutationType: 'element_condition_update',
      patches: [{
        elementId: 'yc481g',
        fieldKey: '_conditions',
        value: [[{
          key: 'dynamic_data',
          dynamic_data: '{url_parameter:audience}',
          compare: '==',
          value: 'members',
        }]],
      }],
    });
  });
  it.skip('legacy Markdown phrase parsing is no longer supported', () => {
    expect(buildDirectLoggedInConditionModelResult({
      mode: 'design',
      prompt: 'Apply that plan to the product update section.',
      resolvedWorkingMemoryFact: resolvedConditionFact(),
      editableOptionTargets: [{
        ...conditionTarget,
        elementId: 'yc481g',
        targetLabel: 'Product update section',
        valuePreview: '[]',
      }],
    })).toMatchObject({
      action: 'patch',
      patches: [{
        elementId: 'yc481g',
        value: [[{
          key: 'dynamic_data',
          dynamic_data: '{url_parameter:audience}',
          compare: '==',
          value: 'members',
        }]],
      }],
    });
  });
  it.skip('legacy prompt-derived condition recovery is no longer supported', () => {
    const base = {
      prompt: 'Make the selected section visible only to authenticated users.',
      bricksContext: { selectedId: '6z8zty' },
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[]' }],
    };

    expect(buildDirectLoggedInConditionModelResult({ ...base, mode: 'plan' })).toBeNull();
    expect(buildDirectLoggedInConditionModelResult({
      ...base,
      mode: 'design',
      bricksContext: { selectedId: '' },
    })).toBeNull();
    expect(buildDirectLoggedInConditionModelResult({
      ...base,
      mode: 'design',
      editableOptionTargets: [{ ...conditionTarget, valuePreview: '[[{\"key\":\"current_url\"}]]' }],
    })).toBeNull();
    expect(buildDirectLoggedInConditionModelResult({
      ...base,
      mode: 'design',
      prompt: 'Make one of the notice sections visible only to logged-in users.',
    })).toBeNull();
    expect(buildDirectLoggedInConditionModelResult({
      ...base,
      mode: 'design',
      prompt: [
        'Recent conversation: Make the selected section visible only to logged-in users.',
        'Latest user message: Change the selected link target to #update-log.',
      ].join('\n'),
      userPrompt: 'Change the selected link target to #update-log while preserving its accessible label.',
    })).toBeNull();
  });

  it('normalizes a selected logged-in condition into the native Bricks shape', () => {
    const plan = normalizeBricksAgentMutationPlan({
      action: 'patch',
      mutationType: 'element_condition_update',
      patches: [{
        elementId: '6z8zty',
        fieldKey: '_conditions',
        value: [[{
          key: 'user_logged_in',
          compare: '==',
          value: '1',
        }]],
      }],
    }, {
      editableOptionTargets: [conditionTarget],
    });

    expect(plan).toMatchObject({
      mutationType: 'element_condition_update',
      patches: [{
        id: '6z8zty',
        fieldKey: '_conditions',
        targetKind: 'conditions',
        settings: {
          _conditions: [[{
            key: 'user_logged_in',
            compare: '==',
            value: '1',
          }]],
        },
      }],
    });
    expect(plan.patches[0].settings._conditions[0][0].id).toMatch(/^[a-z0-9]{6}$/);
  });

  it.each([
    ['logged-out user', { key: 'user_logged_in', compare: '==', value: '0' }],
    ['current URL', { key: 'current_url', compare: 'contains', value: 'campaign=summer' }],
    ['weekday', { key: 'weekday', compare: '==', value: '1' }],
    ['date', { key: 'date', compare: '>=', value: '2026-08-01' }],
  ])('normalizes the native %s condition contract', (_label, condition) => {
    const plan = normalizeBricksAgentMutationPlan({
      action: 'patch',
      mutationType: 'element_condition_update',
      patches: [{
        elementId: '6z8zty',
        fieldKey: '_conditions',
        value: [[condition]],
      }],
    }, {
      editableOptionTargets: [conditionTarget],
    });

    expect(plan.patches[0]?.settings._conditions[0][0]).toMatchObject(condition);
    expect(plan.patches[0]?.settings._conditions[0][0].id).toMatch(/^[a-z0-9]{6}$/);
  });

  it.each([
    [
      'post title',
      { key: 'dynamic_data', dynamic_data: '{post_title}', compare: 'contains', value: 'Scoped' },
    ],
    [
      'URL parameter',
      { key: 'dynamic_data', dynamic_data: '{url_parameter:audience}', compare: '==', value: 'members' },
    ],
  ])('normalizes a native dynamic-data condition using %s', (_label, condition) => {
    const plan = normalizeBricksAgentMutationPlan({
      action: 'patch',
      mutationType: 'element_condition_update',
      patches: [{
        elementId: '6z8zty',
        fieldKey: '_conditions',
        value: [[condition]],
      }],
    }, {
      editableOptionTargets: [conditionTarget],
    });

    expect(plan.patches[0]?.settings._conditions[0][0]).toMatchObject(condition);
  });
  const nativeConditionExamples = [
    ['post_id', '==', '42'],
    ['post_title', 'contains', 'Launch'],
    ['post_parent', '==', '10'],
    ['post_status', '==', ['publish']],
    ['post_author', '==', '7'],
    ['post_date', '>=', '2026-08-01'],
    ['featured_image', '==', '1'],
    ['user_logged_in', '==', '1'],
    ['user_id', '==', '12'],
    ['user_registered', '<', '2026-01-01'],
    ['user_role', '==', ['subscriber']],
    ['weekday', '==', '1'],
    ['date', '>=', '2026-08-01'],
    ['time', '<', '17:00'],
    ['datetime', '>=', '2026-08-01 09:30'],
    ['woo_product_type', '==', 'simple'],
    ['woo_product_sale', '==', '1'],
    ['woo_product_new', '==', '1'],
    ['woo_product_stock_status', '==', 'instock'],
    ['woo_product_stock_quantity', '>=', '3'],
    ['woo_product_stock_management', '==', '1'],
    ['woo_product_sold_individually', '==', '1'],
    ['woo_product_purchased_by_user', '==', '1'],
    ['woo_product_featured', '==', '1'],
    ['woo_product_rating', '>=', '4'],
    ['woo_product_category', '==', ['14']],
    ['woo_product_tag', '==', ['22']],
    ['woo_checkout_needs_shipping_address', '==', '1'],
    ['woo_order_has_status', '==', ['wc-processing']],
    ['woo_order_needs_shipping_address', '==', '1'],
    ['woo_order_has_downloads', '==', '1'],
    ['browser', '==', 'chrome'],
    ['operating_system', '==', 'windows'],
    ['current_url', 'contains', 'campaign=summer'],
    ['referer', 'contains', 'example.com'],
  ] as const;

  it.each(nativeConditionExamples)('normalizes the complete native Bricks condition catalogue: %s', (key, compare, value) => {
    const plan = normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{ elementId: '6z8zty', fieldKey: '_conditions', value: [[{ key, compare, value }]] }],
    }, { editableOptionTargets: [conditionTarget] });

    expect(plan.patches[0]?.settings._conditions[0][0]).toMatchObject({ key, compare, value });
  });

  it('accepts a runtime-discovered custom condition key and rejects a guessed one', () => {
    const normalize = (key: string, runtimeKnowledge?: Record<string, unknown>) => normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{ elementId: '6z8zty', fieldKey: '_conditions', value: [[{ key, compare: '==', value: 'gold' }]] }],
    }, { editableOptionTargets: [conditionTarget], runtimeKnowledge });

    const runtimeKnowledge = {
      knowledge: {
        conditionSchema: {
          conditions: [{ key: 'membership_level', operators: ['==', '!='], value: { type: 'text' } }],
        },
      },
    };
    expect(normalize('membership_level', runtimeKnowledge).patches).toHaveLength(1);
    expect(normalize('membership_level').patches).toEqual([]);
  });

  it('enforces native row fields, dynamic-data ownership, and per-condition operators', () => {
    const normalize = (condition: Record<string, unknown>, runtimeKnowledge?: Record<string, unknown>) => normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{ elementId: '6z8zty', fieldKey: '_conditions', value: [[condition]] }],
    }, { editableOptionTargets: [conditionTarget], runtimeKnowledge });

    expect(normalize({ key: 'post_status', compare: 'contains', value: 'publish' }).patches).toEqual([]);
    expect(normalize({ key: 'dynamic_data', compare: '==', value: 'gold' }).patches).toEqual([]);
    expect(normalize({ key: 'post_title', compare: '==', value: 'Launch', dynamic_data: '{post_title}' }).patches).toEqual([]);
    expect(normalize({ key: 'post_title', compare: '==', value: 'Launch', arbitrary: 'unsafe' }).patches).toEqual([]);
    expect(normalize({ key: 'dynamic_data', compare: 'empty', dynamic_data: '{acf_membership}' }).patches).toEqual([]);
    expect(normalize(
      { key: 'dynamic_data', compare: 'empty', dynamic_data: '{acf_membership}' },
      { knowledge: { dynamicTags: [{ tag: '{acf_membership}', provider: 'acf' }] } },
    ).patches).toHaveLength(1);
    expect(normalize({ key: 'dynamic_data', compare: '==', value: 'members', dynamic_data: '{url_parameter:audience}' }).patches).toHaveLength(1);
    expect(normalize({ key: 'dynamic_data', compare: '==', value: 'Launch', dynamic_data: "{post_title @fallback:'Untitled'}" }).patches).toHaveLength(1);
    expect(normalize({ key: 'dynamic_data', compare: '==', value: 'Launch', dynamic_data: '{post_title @unsafe:true}' }).patches).toEqual([]);
  });
  it('rejects condition patches outside the selected target or supported contract', () => {
    const request = { editableOptionTargets: [conditionTarget] };
    const normalize = (elementId: string, condition: Record<string, unknown>) =>
      normalizeBricksAgentMutationPlan({
        action: 'patch',
        patches: [{
          elementId,
          fieldKey: '_conditions',
          value: [[condition]],
        }],
      }, request);

    expect(normalize('other', {
      key: 'user_logged_in',
      compare: '==',
      value: '1',
    }).patches).toEqual([]);
    expect(normalize('6z8zty', {
      key: 'user_logged_in',
      compare: 'contains',
      value: '1',
    }).patches).toEqual([]);
    expect(normalize('6z8zty', {
      key: 'arbitrary_php',
      compare: '==',
      value: '1',
    }).patches).toEqual([]);
  });

  it('parses a structured Bricks link value without losing its accessible label', () => {
    const plan = normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{
        elementId: 'link01',
        fieldKey: 'link',
        value: '{"type":"external","url":"#update-log","ariaLabel":"View product update details"}',
      }],
    }, {
      editableOptionTargets: [{
        elementId: 'link01',
        fieldKey: 'link',
        targetKind: 'link',
        targetLabel: 'Product update link',
      }],
    });

    expect(plan.patches[0].settings.link).toEqual({
      type: 'external',
      url: '#update-log',
      ariaLabel: 'View product update details',
    });
  });

  it.skip('legacy prompt-derived link recovery is no longer supported', () => {
    expect(buildDirectLinkPatchModelResult({
      mode: 'design',
      userPrompt: 'Change the selected link target to #update-log while preserving its text and accessible label.',
      prompt: 'Recent conversation claimed #update-log was already applied.',
      bricksContext: { selectedId: 'link01' },
      editableOptionTargets: [{
        elementId: 'link01',
        fieldKey: 'link',
        targetKind: 'link',
        targetLabel: 'Product update link',
        valuePreview: '{"type":"external","url":"#product-update-details","ariaLabel":"View product update details"}',
      }],
    })).toMatchObject({
      action: 'patch',
      mutationType: 'link_update',
      patches: [{
        elementId: 'link01',
        fieldKey: 'link',
        value: {
          type: 'external',
          url: '#update-log',
          ariaLabel: 'View product update details',
        },
      }],
    });
  });

  it('preserves a structured escalation reason instead of converting it to an empty answer', () => {
    expect(normalizeBricksAgentEscalationResult({
      action: 'escalate',
      confidence: 'low',
      reason: 'The selected element does not expose a supported condition target.',
    }, 'Hero', {
      kind: 'codex',
    })).toMatchObject({
      status: 'escalate',
      action: 'escalate',
      answer: '',
      targetLabel: 'Hero',
      reason: 'The selected element does not expose a supported condition target.',
      message: 'The selected element does not expose a supported condition target.',
    });
  });

  it('normalizes a model-selected Prototype Bricks route without treating it as a mutation', () => {
    expect(normalizeBricksAgentRouteResult({
      action: 'route',
      route: 'prototype_bricks',
      generationScope: 'section',
      reason: 'The user requested a new section rather than an existing-element patch.',
    }, {
      prompt: 'Build a compact editorial announcement section.',
    }, {
      kind: 'codex',
      eventSummary: { eventCount: 4 },
    })).toMatchObject({
      status: 'routed',
      action: 'route',
      route: 'prototype_bricks',
      generationScope: 'section',
      prompt: 'Build a compact editorial announcement section.',
      patches: [],
    });
  });

  it('preserves a model-selected component scope', () => {
    expect(normalizeBricksAgentRouteResult({
      action: 'route',
      route: 'prototype_bricks',
      generationScope: 'component',
      reason: 'The user requested one testimonial card component.',
    }, {
      prompt: 'お客様の声カードを作成してください。',
    }, {
      kind: 'codex',
    })).toMatchObject({
      status: 'routed',
      route: 'prototype_bricks',
      generationScope: 'component',
      prompt: 'お客様の声カードを作成してください。',
    });
  });
});
describe('Bricks Agent query-loop mutations', () => {
  it('recognizes the model-owned multi-target query-loop payload as complete', () => {
    expect(hasStructuredQueryLoopIntentPayload({
      action: 'query_loop',
      targets: [{
        targetId: 'loop01',
        query: {
          objectType: 'post',
          post_type: ['post'],
          posts_per_page: 4,
          orderby: 'date',
          order: 'DESC',
        },
      }],
    })).toBe(true);
  });

  const queryTargets = [
    { elementId: 'loop01', fieldKey: 'hasLoop', targetKind: 'query_loop', targetLabel: 'Selected section', valuePreview: 'false' },
    { elementId: 'loop01', fieldKey: 'query', targetKind: 'query_loop', targetLabel: 'Selected section', valuePreview: '{}' },
  ];

  it('applies a query loop and logged-in subscriber conditions as one atomic same-element patch', () => {
    const request = {
      mode: 'design',
      editableOptionTargets: [
        ...queryTargets,
        { elementId: 'loop01', fieldKey: '_conditions', targetKind: 'conditions', targetLabel: 'Selected section', valuePreview: '[]' },
      ],
    };
    const modelResult = {
      action: 'compound_patch',
      operations: [
        {
          action: 'query_loop',
          targetId: 'loop01',
          query: { objectType: 'post', post_type: ['post'], posts_per_page: 8, orderby: 'date', order: 'DESC' },
        },
        {
          action: 'condition',
          targetId: 'loop01',
          conditionGroups: [[
            { key: 'user_logged_in', operator: '==', value: '1' },
            { key: 'user_role', operator: '==', value: ['subscriber'] },
          ]],
        },
      ],
      answer: 'I configured the loop and limited it to logged-in subscribers.',
      mutationTitle: 'Configure subscriber posts loop',
      changeSummary: 'Show 8 newest posts only to logged-in subscribers.',
    };

    expect(buildStructuredCompoundPatchModelResult(modelResult, request)).toMatchObject({
      action: 'patch',
      mutationType: 'compound_settings_update',
      patches: [
        { elementId: 'loop01', fieldKey: 'hasLoop', value: true },
        { elementId: 'loop01', fieldKey: 'query', value: { posts_per_page: 8, orderby: 'date', order: 'DESC' } },
        {
          elementId: 'loop01',
          fieldKey: '_conditions',
          value: [[
            { key: 'user_logged_in', compare: '==', value: '1' },
            { key: 'user_role', compare: '==', value: ['subscriber'] },
          ]],
        },
      ],
    });

    expect(buildStructuredCompoundPatchModelResult({
      ...modelResult,
      operations: [modelResult.operations[0], {
        ...modelResult.operations[1],
        conditionGroups: [[{ key: 'user_role', operator: 'contains', value: ['subscriber'] }]],
      }],
    }, request)).toBeNull();
  });

  it('does not invent a deferred condition when the agent returns only a query mutation', () => {
    const root = mkdtempSync(join(tmpdir(), 'pixflow-compound-query-condition-'));
    const workspace = join(root, 'workspace');
    const requestFile = join(root, 'request.json');
    const fixture = join(root, 'runner.cjs');
    const binDir = join(root, 'bin');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(requestFile, JSON.stringify({
      mode: 'design',
      prompt: 'Can you set a query loop on the selected element, post type post, 8 per page, ordered by published date, newest first. Then also set a condition on it that shows it only to logged in users, and the user role is subscriber',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: [
        ...queryTargets,
        { elementId: 'loop01', fieldKey: '_conditions', targetKind: 'conditions', targetLabel: 'Selected section', valuePreview: '[]' },
      ],
    }));
    writeFileSync(fixture, [
      "let prompt = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', chunk => { prompt += chunk; });",
      "process.stdin.on('end', () => {",
      "  const repair = prompt.includes('atomic compound Bricks Design mutation');",
      "  const query = { action: 'query_loop', targetId: 'loop01', query: { objectType: 'post', post_type: ['post'], posts_per_page: 8, orderby: 'date', order: 'DESC' } };",
      "  const payload = repair ? { action: 'compound_patch', operations: [query, { action: 'condition', targetId: 'loop01', conditionGroups: [[{ key: 'user_logged_in', operator: '==', value: '1' }, { key: 'user_role', operator: '==', value: ['subscriber'] }]] }], answer: 'Configured the loop and subscriber visibility.', mutationTitle: 'Configure subscriber loop', changeSummary: 'Eight newest posts for logged-in subscribers.' } : { ...query, answer: 'Configured the query. The condition can be applied next.' };",
      "  console.log(JSON.stringify({ type: 'text', part: { type: 'text', text: JSON.stringify(payload) } }));",
      "});",
    ].join('\n'));
    writeFileSync(join(binDir, 'opencode-cli.cmd'), `@echo off\r\nnode "${fixture}" %*\r\n`);
    try {
      const bridgeCli = fileURLToPath(new URL('../bricks-handoff-cli.mjs', import.meta.url));
      execFileSync(process.execPath, [
        bridgeCli,
        'quick-text-edit',
        '--input', requestFile,
        '--workspace', workspace,
        '--runner', 'opencode',
        '--json',
      ], {
        env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}` },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const result = JSON.parse(readFileSync(join(workspace, 'quick-text-edit-result.json'), 'utf8'));
      expect(result).toMatchObject({
        status: 'completed',
        action: 'patch',
        mutationType: 'query_loop_update',
        patches: [
          { id: 'loop01', fieldKey: 'hasLoop', settings: { hasLoop: true } },
          { id: 'loop01', fieldKey: 'query', settings: { query: { posts_per_page: 8, orderby: 'date', order: 'DESC' } } },
        ],
      });
      expect(result.patches).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ fieldKey: '_conditions' }),
      ]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats an inactive listed query-loop field as writable capability evidence', () => {
    expect(buildStructuredQueryLoopPatchModelResult({
      action: 'query_loop',
      targetId: 'loop01',
      query: {
        objectType: 'post',
        post_type: ['post'],
        posts_per_page: 3,
        orderby: 'date',
        order: 'DESC',
      },
      answer: 'I configured this element to show the three newest posts.',
      mutationTitle: 'Configure post query loop',
      changeSummary: 'Show three posts ordered by date, newest first.',
      confidence: 'high',
      reason: 'The active selection exposes both native query-loop fields.',
    }, {
      mode: 'design',
      editableOptionTargets: queryTargets,
    })).toMatchObject({
      action: 'patch',
      mutationType: 'query_loop_update',
      patches: [
        { elementId: 'loop01', fieldKey: 'hasLoop', value: true },
        {
          elementId: 'loop01',
          fieldKey: 'query',
          value: {
            objectType: 'post',
            post_type: ['post'],
            posts_per_page: 3,
            orderby: 'date',
            order: 'DESC',
          },
        },
      ],
    });
  });

  it.skip.each(['chat', 'plan'])('legacy prompt-derived query facts are no longer supported in %s', (mode) => {
    expect(buildProposedQueryLoopFact({
      mode,
      prompt: 'How would I turn the selected element into a post query loop showing 3 posts per page, ordered by date descending, without changing it yet?',
      workingMemory: {
        currentTurn: {
          number: 6,
          messageId: `query-${mode}`,
          target: { postId: 937, area: 'content', elementId: 'loop01', fieldKey: null },
          fingerprints: { page: 'page-fingerprint', inventory: 'inventory-fingerprint' },
        },
      },
      bricksContext: { postId: 937, area: 'content', selectedId: 'loop01' },
      editableOptionTargets: queryTargets.map((target) => ({ ...target, targetLabel: 'Posts grid' })),
    })).toMatchObject({
      kind: 'query_loop',
      capability: 'query_loop',
      target: { postId: 937, area: 'content', elementId: 'loop01', fieldKey: 'query' },
      intent: {
        kind: 'query_loop',
        objectType: 'post',
        postType: 'post',
        postsPerPage: 3,
        orderBy: 'date',
        order: 'DESC',
      },
      status: 'proposed',
      createdTurn: 6,
      fingerprints: { page: 'page-fingerprint', inventory: 'inventory-fingerprint' },
      provenance: { sourceMessageId: `query-${mode}`, sourceMessageMode: mode },
    });
  });

  it.skip.each(['chat', 'plan'])('legacy natural-language query parsing is no longer supported in %s', (mode) => {
    expect(buildProposedQueryLoopFact({
      mode,
      prompt: 'Could this same block use a native post query loop that shows 2 posts per page?',
      workingMemory: {
        currentTurn: {
          number: 2,
          messageId: `natural-query-${mode}`,
          target: { postId: 937, area: 'content', elementId: 'loop01', fieldKey: null },
          fingerprints: { page: 'page-fingerprint', inventory: 'inventory-fingerprint' },
        },
      },
      bricksContext: { postId: 937, area: 'content', selectedId: 'loop01' },
      editableOptionTargets: queryTargets.map((target) => ({ ...target, targetLabel: 'Posts grid' })),
    })).toMatchObject({
      kind: 'query_loop',
      target: { elementId: 'loop01', fieldKey: 'query' },
      intent: {
        kind: 'query_loop',
        objectType: 'post',
        postType: 'post',
        postsPerPage: 2,
        orderBy: 'date',
        order: 'DESC',
      },
    });
  });

  it.skip('legacy prompt-derived query recovery is no longer supported', () => {
    const result = buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Turn the selected section into a post query loop. Query posts, order by publication date descending, show 12 per page with an offset of 2, exclude the current post, and use infinite scroll.',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    });
    expect(result).toMatchObject({
      action: 'patch',
      mutationType: 'query_loop_update',
      patches: [
        { elementId: 'loop01', fieldKey: 'hasLoop', value: true },
        {
          elementId: 'loop01',
          fieldKey: 'query',
          value: {
            objectType: 'post',
            post_type: ['post'],
            posts_per_page: 12,
            orderby: 'date',
            order: 'DESC',
            offset: 2,
            exclude_current_post: true,
            infinite_scroll: true,
          },
        },
      ],
    });
    expect(normalizeBricksAgentMutationPlan(result, { editableOptionTargets: queryTargets }).patches).toHaveLength(2);
  });

  it.skip('legacy natural-language query routing is no longer supported', () => {
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Set the selected section to query posts, ordered by date posted descending, showing 12 per page with an offset of 2, excluding the current post, and using infinite scroll.',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toMatchObject({
      action: 'patch',
      mutationType: 'query_loop_update',
      patches: [
        { fieldKey: 'hasLoop', value: true },
        { fieldKey: 'query', value: { objectType: 'post', posts_per_page: 12, order: 'DESC' } },
      ],
    });
  });
  it.skip('legacy natural-language query routing is no longer supported', () => {
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Turn the currently selected block into a native Bricks post query loop showing 3 published posts ordered newest first. Apply it now.',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toMatchObject({
      action: 'patch',
      mutationType: 'query_loop_update',
      patches: [
        { elementId: 'loop01', fieldKey: 'hasLoop', value: true },
        {
          elementId: 'loop01',
          fieldKey: 'query',
          value: {
            objectType: 'post',
            post_type: ['post'],
            posts_per_page: 3,
            orderby: 'date',
            order: 'DESC',
          },
        },
      ],
    });
  });
  it.skip('legacy natural-language query routing is no longer supported', () => {
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: '/query-loops On the currently selected Block loop01, enable a native Bricks post query loop with post_type post, posts_per_page 3, orderby date, and order DESC. Apply it now.',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toMatchObject({
      action: 'patch',
      mutationType: 'query_loop_update',
      patches: [
        { elementId: 'loop01', fieldKey: 'hasLoop', value: true },
        {
          elementId: 'loop01',
          fieldKey: 'query',
          value: {
            objectType: 'post',
            post_type: ['post'],
            posts_per_page: 3,
            orderby: 'date',
            order: 'DESC',
          },
        },
      ],
    });
  });
  it.skip('legacy natural-language query routing is no longer supported', () => {
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Apply a query loop on the current element that uses the post type post, 3 posts per page, ordered by date newest first.',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toMatchObject({
      action: 'patch',
      mutationType: 'query_loop_update',
      patches: [
        { elementId: 'loop01', fieldKey: 'hasLoop', value: true },
        {
          elementId: 'loop01',
          fieldKey: 'query',
          value: {
            objectType: 'post',
            post_type: ['post'],
            posts_per_page: 3,
            orderby: 'date',
            order: 'DESC',
          },
        },
      ],
    });
  });
  it.skip('legacy prompt-derived term query recovery is no longer supported', () => {
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: "Turn the selected section into a term query loop for post categories. Show 8 per page, order by name, use the current post's terms, and include empty categories.",
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toMatchObject({
      action: 'patch',
      mutationType: 'query_loop_update',
      patches: [
        { fieldKey: 'hasLoop', value: true },
        {
          fieldKey: 'query',
          value: {
            objectType: 'term',
            taxonomy: ['category'],
            number: 8,
            orderby: 'name',
            order: 'ASC',
            current_post_term: true,
            show_empty: true,
          },
        },
      ],
    });
  });

  it.skip('legacy natural-language term-query routing is no longer supported', () => {
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Set the selected section to query post categories, showing 8 per page, ordered by name, using the current post terms, and including empty categories.',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toMatchObject({
      action: 'patch',
      patches: [
        { fieldKey: 'hasLoop', value: true },
        { fieldKey: 'query', value: { objectType: 'term', number: 8, orderby: 'name', current_post_term: true, show_empty: true } },
      ],
    });
  });
  it.skip('legacy prompt-derived typed query recovery is no longer supported', () => {
    const fact = resolvedQueryFact();
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Apply that plan to the selected section.',
      resolvedWorkingMemoryFact: fact,
      workingMemoryAuthority: authorityForFact(fact),
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toMatchObject({
      action: 'patch',
      patches: [
        { fieldKey: 'hasLoop', value: true },
        { fieldKey: 'query', value: { objectType: 'post', post_type: ['page'], posts_per_page: 6, orderby: 'title', order: 'ASC' } },
      ],
    });
  });
  it.skip('legacy prompt-derived typed query recovery is no longer supported', () => {
    const fact = resolvedQueryFact('hero01');
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Apply that plan to the selected section.',
      resolvedWorkingMemoryFact: fact,
      workingMemoryAuthority: authorityForFact(fact),
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toBeNull();
  });
  it.skip('legacy prompt-derived native query recovery is no longer supported', () => {
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Set the selected section to query posts, show 5 per page, order by modified date descending, and ignore sticky posts.',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toMatchObject({ patches: [{ fieldKey: 'hasLoop' }, { value: { objectType: 'post', post_type: ['post'], posts_per_page: 5, orderby: 'modified', order: 'DESC', ignore_sticky_posts: true } }] });

    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Set the selected section to query post tags, show 7 terms per page, order by count descending, and hide empty terms.',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toMatchObject({ patches: [{ fieldKey: 'hasLoop' }, { value: { objectType: 'term', taxonomy: ['post_tag'], number: 7, orderby: 'count', order: 'DESC', show_empty: false } }] });

    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Set the selected section to query subscribers, show 4 users per page, ordered by registered date descending.',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toMatchObject({ patches: [{ fieldKey: 'hasLoop' }, { value: { objectType: 'user', role__in: ['subscriber'], number: 4, orderby: 'registered', order: 'DESC' } }] });
  });

  it('allowlists every native core query type and exact runtime provider types', () => {
    const normalizeQuery = (value: Record<string, unknown>, request: Record<string, unknown> = {}) => normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{ elementId: 'loop01', fieldKey: 'query', value }],
    }, { editableOptionTargets: queryTargets, ...request }).patches;

    expect(normalizeQuery({ objectType: 'api', api_url: 'https://example.test/items', api_method: 'GET', response_path: 'items', cache_time: 300, items_per_page: 10 })).toHaveLength(1);
    expect(normalizeQuery({ objectType: 'array', arrayEditor: '[{"name":"Alpha"}]', items_per_page: 1 })).toHaveLength(1);
    expect(normalizeQuery({ objectType: 'acf_relationship_field', items_per_page: 8 }, {
      mcpRuntimeContext: { knowledge: { queryTypes: { items: [{ objectType: 'acf_relationship_field' }] } } },
    })).toHaveLength(1);
    expect(normalizeQuery({ objectType: 'wooCart' }, {
      runtimeKnowledge: { queryTypes: { items: [{ objectType: 'wooCart' }] } },
    })).toHaveLength(1);
    expect(normalizeQuery({ objectType: 'acf_guessed_field', items_per_page: 8 })).toEqual([]);
    expect(normalizeQuery({ objectType: 'post', post_type: ['post'], posts_per_page: 3, orderby: 'date', order: 'DESC', useQueryEditor: true, queryEditor: 'return [];', signature: 'fake' })).toEqual([]);
  });
  it.skip('legacy prompt-derived active-query continuation is no longer supported', () => {
    const activeTargets = [
      { ...queryTargets[0], valuePreview: 'true' },
      { ...queryTargets[1], valuePreview: '{"objectType":"post","posts_per_page":3}' },
    ];
    const originalPrompt = 'Turn the selected section into a post query loop. Query posts, order by publication date descending, show 12 per page with an offset of 2, exclude the current post, and use infinite scroll.';
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: originalPrompt,
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: activeTargets,
    })).toMatchObject({
      action: 'answer',
      answer: expect.stringContaining('already has an active post query loop'),
    });
    const fact = resolvedQueryFact();
    expect(buildDirectQueryLoopModelResult({
      mode: 'design',
      prompt: 'Yes, replace it.',
      resolvedWorkingMemoryFact: fact,
      workingMemoryAuthority: authorityForFact(fact),
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: activeTargets,
    })).toMatchObject({ action: 'patch', mutationType: 'query_loop_update' });
  });
  it.skip('legacy prompt-derived query-loop recovery is no longer supported', () => {
    expect(buildDirectQueryLoopModelResult({
      mode: 'plan',
      prompt: 'Turn the selected section into a post query loop. Query posts, order by publication date descending, show 12 per page with an offset of 2, exclude the current post, and use infinite scroll.',
      bricksContext: { selectedId: 'loop01' },
      editableOptionTargets: queryTargets,
    })).toBeNull();
    expect(normalizeBricksAgentMutationPlan({
      action: 'patch',
      patches: [{
        elementId: 'loop01',
        fieldKey: 'query',
        value: {
          objectType: 'post',
          post_type: ['post'],
          posts_per_page: 12,
          orderby: 'date',
          order: 'DESC',
          exclude_current_post: true,
          infinite_scroll: true,
          arbitrary_php: 'unsafe',
        },
      }],
    }, { editableOptionTargets: queryTargets }).patches).toEqual([]);
  });
});
