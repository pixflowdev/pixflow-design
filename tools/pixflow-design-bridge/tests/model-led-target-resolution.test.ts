import { execFileSync } from 'node:child_process';
import { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  extractQuickTextEditModelResult,
  genericTargetSelectionRejection,
  mergeGenericTargetSelectionRepairResult,
  normalizeQuickTextEditResult,
  preserveAmbiguousDesignTargetAnswer,
  renderQuickTextEditRunnerPrompt,
  targetDecisionForResult,
} from '../bricks-handoff-cli.mjs';
import {
  hydrateModelTargetDecisionFromTypedIntent,
  validateAgentProposedWorkingMemoryFact,
} from '../bricks-agent/mutation-planner.mjs';

const changedSelectionDesignTargetAnswer = preserveAmbiguousDesignTargetAnswer;
const hydrateExistingMediaLibraryDecision = preserveAmbiguousDesignTargetAnswer;
const inferNaturalPrototypeBricksGenerationScope = preserveAmbiguousDesignTargetAnswer;
const promoteNaturalPrototypeBricksRoute = preserveAmbiguousDesignTargetAnswer;
const strictSelectedReferenceDesignAnswer = preserveAmbiguousDesignTargetAnswer;
const buildProposedTextReplacementFact = validateAgentProposedWorkingMemoryFact;
const hydrateModelTargetDecisionFromRecentChat = validateAgentProposedWorkingMemoryFact;

const optionTargets = [
  { elementId: 'hero01', fieldKey: '_conditions', targetKind: 'conditions', targetLabel: 'Editorial hero', valuePreview: '[]' },
  {
    elementId: 'title1',
    fieldKey: 'text',
    targetKind: 'text',
    targetLabel: 'Article heading',
    currentText: 'Old title',
    currentVisibleText: 'Old title',
    valuePreview: 'Old title',
  },
  { elementId: 'link01', fieldKey: 'link', targetKind: 'link', targetLabel: 'Primary link', valuePreview: '{"url":"#old"}' },
  { elementId: 'image1', fieldKey: 'image', targetKind: 'media', targetLabel: 'Feature image', valuePreview: '{}' },
  { elementId: 'loop01', fieldKey: 'query', targetKind: 'query_loop', targetLabel: 'Post card loop', valuePreview: '{}' },
  { elementId: 'loop01', fieldKey: 'hasLoop', targetKind: 'query_loop', targetLabel: 'Post card loop', valuePreview: 'false' },
  { elementId: 'form01', fieldKey: 'submitButtonStyle', targetKind: 'option', targetLabel: 'Contact form', valuePreview: 'primary' },
  { elementId: 'code01', fieldKey: 'javascriptCode', targetKind: 'code_javascript', targetLabel: 'Interaction code', valuePreview: '' },
  { elementId: 'block1', fieldKey: '_rowGap', targetKind: 'layout', targetLabel: 'Stats block', valuePreview: '' },
];

const request = {
  mode: 'design',
  prompt: 'Update the named element and apply it now.',
  bricksContext: {
    selectedId: 'unrelated',
    elements: optionTargets.map((target) => ({ id: target.elementId })),
    targetResolution: {
      activeSelectionId: 'unrelated',
      source: 'semantic-element-role',
    },
  },
  targets: optionTargets.filter((target) => target.targetKind === 'text'),
  editableOptionTargets: optionTargets.filter((target) => target.targetKind !== 'text'),
};

describe('model-led Design target resolution', () => {
  it('rejects a mutation subject that conflicts with the semantic intent contract', () => {
    const semanticRequest = {
      ...request,
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      intentContract: {
        schema: 'pixflow.bricks.intent.v1',
        intent: 'selected_element',
        targetElementIds: ['title1'],
        placement: { mode: 'after', targetId: 'image1', preserveExisting: true },
      },
    };

    expect(genericTargetSelectionRejection({
      action: 'reorder',
      targetId: 'hero01',
      referenceId: 'image1',
      position: 'after',
    }, semanticRequest)).toMatchObject({
      code: 'intent_contract_target_mismatch',
      requestedTargetId: 'hero01',
      semanticTargetElementIds: ['title1'],
    });

    expect(genericTargetSelectionRejection({
      action: 'reorder',
      targetId: 'title1',
      referenceId: 'image1',
      position: 'after',
    }, semanticRequest)).toBeNull();

    expect(genericTargetSelectionRejection({
      action: 'reorder',
      orderedIds: ['title1'],
      parentId: 'hero01',
      position: { mode: 'after', targetId: 'image1' },
    }, semanticRequest)).toBeNull();

    expect(genericTargetSelectionRejection({
      action: 'insert',
      elements: [{ id: 'new-paragraph', name: 'text-basic', settings: { text: 'Old title' } }],
      position: { mode: 'after', targetId: 'image1' },
    }, semanticRequest)).toMatchObject({
      code: 'intent_contract_subject_missing',
      semanticTargetElementIds: ['title1'],
    });

    expect(genericTargetSelectionRejection({
      action: 'insert',
      elements: [{ id: 'new-icon', name: 'icon', settings: {} }],
      position: { mode: 'append_to', targetId: 'title1' },
    }, semanticRequest)).toBeNull();

    expect(genericTargetSelectionRejection({
      action: 'compound_mutation',
      operations: [{
        opId: 'wrong-copy',
        action: 'insert',
        elements: [{ id: 'new-paragraph', name: 'text-basic', settings: { text: 'Old title' } }],
        position: { mode: 'after', targetId: 'image1' },
      }],
    }, semanticRequest)).toMatchObject({
      code: 'intent_contract_subject_missing',
      semanticTargetElementIds: ['title1'],
      operationId: 'wrong-copy',
    });

    const multiTargetSemanticRequest = {
      ...semanticRequest,
      intentContract: {
        ...semanticRequest.intentContract,
        targetElementIds: ['button1', 'image1', 'hero01'],
      },
      bricksContext: {
        ...semanticRequest.bricksContext,
        elements: [
          { id: 'button1', name: 'button', settings: { text: 'Start a conversation' } },
          { id: 'image1', name: 'image', settings: {} },
          { id: 'hero01', name: 'div', settings: {} },
        ],
      },
    };
    expect(genericTargetSelectionRejection({
      action: 'insert',
      elements: [{ id: 'button-copy', name: 'button', settings: { text: 'Start a conversation' } }],
      position: { mode: 'after', targetId: 'image1' },
    }, multiTargetSemanticRequest)).toMatchObject({
      code: 'intent_contract_existing_subject_inserted',
      requestedTargetId: 'button1',
    });
  });

  it('fails closed when the one bounded repair still replaces the requested live subject with an insertion', () => {
    const root = mkdtempSync(join(tmpdir(), 'pixflow-target-repair-fail-closed-'));
    const workspace = join(root, 'workspace');
    const requestFile = join(root, 'request.json');
    const fixture = join(root, 'runner.cjs');
    const binDir = join(root, 'bin');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(requestFile, JSON.stringify({
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      prompt: 'Move it below the image.',
      intentContract: {
        schema: 'pixflow.bricks.intent.v1',
        intent: 'selected_element',
        targetElementIds: ['title1'],
        placement: { mode: 'after', targetId: 'image1', preserveExisting: true },
      },
      bricksContext: {
        selectedId: 'title1',
        elements: [{ id: 'title1' }, { id: 'image1' }],
        targetResolution: { status: 'resolved', resolvedElementId: 'title1' },
      },
      targets: [{
        elementId: 'title1',
        fieldKey: 'text',
        targetKind: 'text',
        targetLabel: 'Article heading',
        currentVisibleText: 'Old title',
      }],
    }));
    writeFileSync(fixture, [
      "process.stdin.setEncoding('utf8');",
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  const payload = { action: 'insert', elements: [{ id: 'copy1', name: 'text-basic', settings: { text: 'Old title' } }], position: { mode: 'after', targetId: 'image1' }, answer: 'Moved it.' };",
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
      expect(result.answer).toContain('could not safely resolve');
      expect(result.elements ?? []).toEqual([]);
      expect(result.patches ?? []).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skip('legacy phrase-based selected-element routing is no longer supported', () => {
    const selectedButtonRequest = {
      ...request,
      prompt: 'Replace the selected image with the existing media item.',
      bricksContext: {
        ...request.bricksContext,
        selectedId: 'link01',
        targetResolution: {
          activeSelectionId: 'link01',
          source: 'active-selection',
        },
      },
    };
    const imageMutation = {
      action: 'patch',
      patches: [{ elementId: 'image1', fieldKey: 'image', value: { id: 42 } }],
      mutationType: 'media_update',
    };

    expect(strictSelectedReferenceDesignAnswer(imageMutation, selectedButtonRequest)).toMatchObject({
      action: 'answer',
      answer: expect.stringContaining('currently selected element is link01'),
    });
    expect(strictSelectedReferenceDesignAnswer(imageMutation, {
      ...selectedButtonRequest,
      bricksContext: {
        ...selectedButtonRequest.bricksContext,
        selectedId: '',
        targetResolution: {},
      },
    })).toMatchObject({
      action: 'answer',
      answer: expect.stringContaining('no element currently selected'),
    });
    expect(strictSelectedReferenceDesignAnswer(imageMutation, {
      ...selectedButtonRequest,
      bricksContext: {
        ...selectedButtonRequest.bricksContext,
        selectedId: 'image1',
        targetResolution: { activeSelectionId: 'image1', source: 'active-selection' },
      },
    })).toBeNull();
    expect(strictSelectedReferenceDesignAnswer(imageMutation, {
      ...selectedButtonRequest,
      prompt: 'Replace the only image on the page with the existing media item.',
    })).toBeNull();
    expect(renderQuickTextEditRunnerPrompt(selectedButtonRequest)).toContain(
      'The words “selected” and “current element” are strict live UI references.',
    );
  });

  it.skip('legacy prompt-title Media Library hydration is no longer supported', () => {
    const hydrated = hydrateExistingMediaLibraryDecision({
      action: 'patch',
      mutationType: 'media_update',
      patches: [
        { elementId: 'image1', fieldKey: 'image', value: { title: 'Charcoal product image', size: 'full' } },
        { elementId: 'image1', fieldKey: 'altText', value: 'Accessible product image' },
      ],
    }, {
      ...request,
      prompt: 'Replace the selected image with the existing Media Library item titled “Charcoal product image”.',
      mediaLibraryCatalog: [{
        attachmentId: 2713,
        title: 'Charcoal product image',
        url: 'http://example.test/uploads/charcoal.jpg',
        type: 'image',
      }],
    });

    expect(hydrated.patches).toEqual([
      {
        elementId: 'image1',
        fieldKey: 'image',
        value: {
          id: 2713,
          url: 'http://example.test/uploads/charcoal.jpg',
          size: 'full',
          title: 'Charcoal product image',
        },
      },
      { elementId: 'image1', fieldKey: 'altText', value: 'Accessible product image' },
    ]);
  });

  it.skip('legacy phrase-based Prototype Bricks promotion is no longer supported', () => {
    expect(inferNaturalPrototypeBricksGenerationScope(
      'Could you add a clean blog section near the end of this page and keep the current sections as they are?',
    )).toBe('section');
    expect(promoteNaturalPrototypeBricksRoute({
      action: 'patch',
      patches: [{ id: 'existing-blog', settings: { text: 'Latest posts' } }],
    }, {
      mode: 'design',
      prompt: 'Could you add a clean blog section near the end of this page and keep the current sections as they are?',
    })).toMatchObject({
      action: 'route',
      route: 'prototype_bricks',
      generationScope: 'section',
    });
  });

  it.skip('legacy phrase-based Prototype Bricks promotion is no longer supported', () => {
    expect(inferNaturalPrototypeBricksGenerationScope(
      'Can you add a query loop to the blog section cards?',
    )).toBe('');
    expect(inferNaturalPrototypeBricksGenerationScope(
      'Please add entrance animations to the heading inside the hero section.',
    )).toBe('');
  });

  it('retains the exact target chosen by the bounded repair for a scalar text replacement', () => {
    const normalized = normalizeQuickTextEditResult({
      action: 'replace',
      targetId: 'title1',
      fieldKey: 'text',
      replacementText: 'Latest release',
      answer: 'Updated the heading.',
      confidence: 'high',
      reason: 'The selected heading is the one exact compatible text target.',
    }, request, null);

    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'replace',
      replacements: [{
        elementId: 'title1',
        fieldKey: 'text',
        replacementText: 'Latest release',
      }],
    });
    expect(targetDecisionForResult(normalized, request, true)).toMatchObject({
      targetId: 'title1',
      fieldKey: 'text',
      capability: 'selected_element',
      repairAttempted: true,
    });
  });

  it('merges a decision-only repair into the original bounded operation without exposing repair JSON', () => {
    const original = {
      action: 'replace',
      replacementText: 'Latest release',
      answer: 'Updated the heading.',
      mutationTitle: 'Update heading',
      changeSummary: 'Changed Product update to Latest release.',
    };
    const merged = mergeGenericTargetSelectionRepairResult(original, {
      action: 'repair',
      targetId: 'title1',
      fieldKey: 'text',
      targetLabel: 'Article heading',
      selectionRationale: 'The active heading is the one compatible live target.',
      confidence: 'high',
    });

    expect(merged).toMatchObject({
      action: 'replace',
      targetId: 'title1',
      fieldKey: 'text',
      replacementText: 'Latest release',
      answer: 'Updated the heading.',
      confidence: 'high',
      reason: 'The active heading is the one compatible live target.',
    });
    expect(genericTargetSelectionRejection(merged, request)).toBeNull();
    expect(normalizeQuickTextEditResult(merged, request, null)).toMatchObject({
      status: 'completed',
      action: 'replace',
      replacements: [{ elementId: 'title1', fieldKey: 'text', replacementText: 'Latest release' }],
    });
  });

  it('extracts a decision-only repair event as structured data before merge and never as public JSON prose', () => {
    const eventText = `${JSON.stringify({
      type: 'text',
      part: {
        type: 'text',
        text: JSON.stringify({
          action: 'repair',
          targetId: 'title1',
          fieldKey: 'text',
          targetLabel: 'Article heading',
          selectionRationale: 'The active heading is the exact compatible live target.',
          confidence: 'high',
        }),
      },
    })}\n`;
    const repaired = extractQuickTextEditModelResult(eventText);
    expect(repaired).toMatchObject({
      action: 'repair',
      targetId: 'title1',
      fieldKey: 'text',
    });

    const merged = mergeGenericTargetSelectionRepairResult({
      action: 'replace',
      replacementText: 'Latest release',
      answer: 'Updated the heading.',
      mutationTitle: 'Update heading',
      changeSummary: 'Changed Product update to Latest release.',
    }, repaired);
    const normalized = normalizeQuickTextEditResult(merged, request, null);
    expect(normalized).toMatchObject({
      status: 'completed',
      action: 'replace',
      replacements: [{ elementId: 'title1', fieldKey: 'text', replacementText: 'Latest release' }],
    });
    expect(JSON.stringify(normalized)).not.toContain('\\"action\\":\\"repair\\"');
  });

  it('hydrates a model-chosen target decision from the exact typed text intent', () => {
    expect(hydrateModelTargetDecisionFromTypedIntent({
      action: 'repair',
      targetId: 'title1',
      fieldKey: 'text',
      selectionRationale: 'The selected heading matches the planned change.',
      confidence: 'high',
    }, {
      ...request,
      resolvedWorkingMemoryFact: {
        kind: 'text_replacement',
        capability: 'selected_element',
        target: { postId: 937, area: 'content', elementId: 'title1', fieldKey: 'text' },
        intent: { kind: 'text_replacement', value: 'Latest release', previousValue: 'Old title' },
      },
    })).toMatchObject({
      action: 'replace',
      targetId: 'title1',
      fieldKey: 'text',
      replacementText: 'Latest release',
      answer: expect.not.stringContaining('{"action"'),
      confidence: 'high',
    });
  });

  it.each([
    ['conditions', 'hero01', '_conditions', {
      kind: 'visibility_condition', key: 'weekday', operator: '==', value: '5',
    }, 'condition'],
    ['Dynamic Data', 'title1', 'text', {
      kind: 'dynamic_data_binding', expression: '{post_title}', placement: 'text',
    }, 'dynamic_data'],
    ['query loops', 'loop01', 'query', {
      kind: 'query_loop', objectType: 'post', postType: 'post', postsPerPage: 3, orderBy: 'date', order: 'DESC',
    }, 'query_loop'],
    ['Code', 'code01', 'javascriptCode', {
      kind: 'code_update', fieldKey: 'javascriptCode', source: 'window.pixflowReady = true;',
    }, 'code_update'],
    ['settings', 'block1', '_rowGap', {
      kind: 'settings_patch', values: [{ fieldKey: '_rowGap', value: '24px' }],
    }, 'patch'],
  ])('hydrates a decision-only %s target uniformly from typed evidence', (
    _label,
    targetId,
    fieldKey,
    intent,
    expectedAction,
  ) => {
    expect(hydrateModelTargetDecisionFromTypedIntent({
      action: 'repair',
      targetId,
      fieldKey,
      selectionRationale: 'One exact compatible live target.',
      confidence: 'high',
    }, {
      ...request,
      resolvedWorkingMemoryFact: {
        kind: intent.kind,
        capability: 'bricks_settings',
        target: { postId: 937, area: 'content', elementId: targetId, fieldKey },
        intent,
      },
    })).toMatchObject({
      action: expectedAction,
      targetId,
      fieldKey,
      confidence: 'high',
    });
  });

  it.skip('legacy recent-chat mutation hydration is no longer supported', () => {
    expect(hydrateModelTargetDecisionFromRecentChat({
      action: 'repair',
      targetId: 'title1',
      fieldKey: 'text',
      selectionRationale: 'The selected heading is the exact compatible live target.',
      confidence: 'high',
    }, {
      ...request,
      prompt: 'Go ahead and make that change.',
      recentChat: [
        {
          id: 'user-plan-title',
          role: 'user',
          content: 'Plan to change this heading to “Latest release”, but do not apply it yet.',
          createdAt: 100,
          sessionMode: 'plan',
          provenance: { source: 'live_v2', authority: 'conversation_only' },
        },
        {
          id: 'assistant-plan-title',
          role: 'assistant',
          content: 'Here is the plan.',
          createdAt: 101,
          sessionMode: 'plan',
          provenance: { source: 'live_v2', authority: 'conversation_only' },
        },
      ],
    })).toMatchObject({
      action: 'replace',
      targetId: 'title1',
      fieldKey: 'text',
      replacementText: 'Latest release',
      memoryInterpretation: {
        version: 1,
        chronology: 'oldest_to_newest',
        relation: 'continuation',
        sourceMessageId: 'user-plan-title',
        sourceUserSequence: 1,
      },
    });
  });

  it.skip('legacy recent-chat mutation hydration is no longer supported', () => {
    const decision = { action: 'repair', targetId: 'title1', fieldKey: 'text' };
    const planRow = {
      id: 'user-plan-title',
      role: 'user',
      content: 'Plan to change this heading to “Latest release”, but do not apply it yet.',
      createdAt: 100,
      sessionMode: 'plan',
      provenance: { source: 'live_v2', authority: 'conversation_only' },
    };
    expect(hydrateModelTargetDecisionFromRecentChat(decision, {
      ...request,
      prompt: 'Go ahead and make that change.',
      recentChat: [{ ...planRow, provenance: { source: 'session_restore_v2', authority: 'conversation_only' } }],
    })).toBeNull();
    expect(hydrateModelTargetDecisionFromRecentChat(decision, {
      ...request,
      prompt: 'Go ahead and make that change.',
      recentChat: [planRow, {
        ...planRow,
        id: 'user-plan-other',
        content: 'Plan to change this heading to “Release notes”, but do not apply it yet.',
        createdAt: 200,
      }],
    })).toBeNull();
  });

  it.skip('legacy prompt-derived text facts are no longer supported', () => {
    expect(buildProposedTextReplacementFact({
      mode: 'plan',
      prompt: 'Plan to change this heading to “Latest release”, but do not apply it yet.',
      bricksContext: { selectedId: 'title1', postId: 937, area: 'content' },
      targets: optionTargets.filter((target) => target.elementId === 'title1'),
      workingMemory: {
        currentTurn: {
          number: 4,
          messageId: 'user-plan-heading',
          target: { postId: 937, area: 'content', elementId: 'title1', fieldKey: 'text' },
          fingerprints: { page: 'page-fp', inventory: 'inventory-fp' },
        },
      },
    })).toMatchObject({
      id: 'fact:user-plan-heading:text_replacement',
      kind: 'text_replacement',
      capability: 'selected_element',
      target: { postId: 937, area: 'content', elementId: 'title1', fieldKey: 'text' },
      intent: { kind: 'text_replacement', value: 'Latest release', previousValue: 'Old title' },
      status: 'proposed',
      provenance: { sourceMessageMode: 'plan', extractedBy: 'bridge' },
    });
  });

  it.skip('legacy prompt-derived text facts are no longer supported', () => {
    expect(buildProposedTextReplacementFact({
      mode: 'chat',
      prompt: 'Could you suggest a clearer version of this heading?',
      bricksContext: { selectedId: 'title1', postId: 937, area: 'content' },
      targets: optionTargets.filter((target) => target.elementId === 'title1'),
    })).toBeNull();
  });

  it.each([
    ['conditions', 'hero01', '_conditions', 'conditions', 'element_condition_update'],
    ['text', 'title1', 'text', 'selected_element', 'selected_text_rewrite'],
    ['link', 'link01', 'link', 'bricks_settings', 'link_update'],
    ['image', 'image1', 'image', 'dynamic_data', 'dynamic_data_update'],
    ['query', 'loop01', 'query', 'query_loop', 'query_loop_update'],
    ['form', 'form01', 'submitButtonStyle', 'bricks_settings', 'form_settings_update'],
    ['code', 'code01', 'javascriptCode', 'code_element', 'code_update'],
    ['layout', 'block1', '_rowGap', 'bricks_settings', 'bricks_settings_patch'],
  ])('verifies one live %s target by ID/field/capability rather than active-selection identity', (
    _label,
    targetId,
    fieldKey,
    capability,
    mutationType,
  ) => {
    const result = {
      action: fieldKey === 'text' ? 'replace' : 'patch',
      mutationType,
      patches: fieldKey === 'text' ? [] : [{ elementId: targetId, fieldKey, value: 'bounded' }],
      replacements: fieldKey === 'text' ? [{ elementId: targetId, fieldKey, replacementText: 'New title' }] : [],
      confidence: 'high',
      reason: 'The live label and compatible field uniquely match the request.',
    };
    expect(genericTargetSelectionRejection(result, request)).toBeNull();
    expect(targetDecisionForResult(result, request, false)).toMatchObject({
      version: 1,
      targetId,
      fieldKey,
      capability,
      confidence: 'high',
      source: 'semantic-match',
      repairAttempted: false,
    });
  });

  it('returns a compact machine rejection for an invented target and never substitutes the active selection', () => {
    expect(genericTargetSelectionRejection({
      action: 'patch',
      patches: [{ elementId: 'invented', fieldKey: '_conditions', value: [] }],
    }, request)).toMatchObject({
      code: 'target_field_incompatible',
      requestedTargetId: 'invented',
      requestedFieldKey: '_conditions',
      candidates: [expect.objectContaining({ elementId: 'hero01', fieldKey: '_conditions' })],
    });
  });

  it.skip('legacy phrase-based selection rebinding is no longer supported', () => {
    const changedSelectionRequest = {
      ...request,
      prompt: 'Apply that condition now.',
      workingMemoryIntentCandidate: {
        kind: 'visibility_condition',
        capability: 'conditions',
        target: { postId: 937, area: 'content', elementId: 'hero01', fieldKey: '_conditions' },
        intent: { kind: 'visibility_condition', key: 'weekday', operator: '==', value: '5' },
      },
      editableOptionTargets: [
        { elementId: 'hero01', fieldKey: '_attributes', targetKind: 'attributes', targetLabel: 'section', valuePreview: '[]' },
        { elementId: 'unrelated', fieldKey: '_attributes', targetKind: 'attributes', targetLabel: 'section', valuePreview: '[]' },
        ...request.editableOptionTargets,
        { elementId: 'unrelated', fieldKey: '_conditions', targetKind: 'conditions', targetLabel: 'Current team section', valuePreview: '[]' },
      ],
      bricksContext: {
        ...request.bricksContext,
        selectedId: 'unrelated',
        elements: [
          { id: 'hero01', name: 'section', label: 'Editorial hero' },
          { id: 'unrelated', name: 'section', label: 'Current team section' },
        ],
        targetResolution: {
          status: 'resolved',
          activeSelectionId: 'unrelated',
          resolvedElementId: 'unrelated',
          source: 'active-selection',
        },
      },
    };
    expect(genericTargetSelectionRejection({
      action: 'condition',
      targetId: 'unrelated',
      condition: { key: 'weekday', operator: '==', value: '5' },
    }, changedSelectionRequest)).toMatchObject({
      code: 'selection_changed_unconfirmed',
      requestedTargetId: 'unrelated',
      candidates: expect.arrayContaining([
        expect.objectContaining({ elementId: 'hero01' }),
      ]),
    });

    expect(genericTargetSelectionRejection({
      action: 'condition',
      targetId: 'unrelated',
      condition: { key: 'weekday', operator: '==', value: '5' },
    }, {
      ...changedSelectionRequest,
      prompt: 'Apply that to the currently selected element.',
    })).toBeNull();

    expect(changedSelectionDesignTargetAnswer(changedSelectionRequest)).toMatchObject({
      action: 'answer',
      answer: expect.stringContaining('Editorial hero (section, Bricks ID hero01)'),
    });
    expect(changedSelectionDesignTargetAnswer(changedSelectionRequest).answer).toContain(
      'Current team section (section, Bricks ID unrelated)',
    );
    const genericLabelsAnswer = changedSelectionDesignTargetAnswer({
      ...changedSelectionRequest,
      bricksContext: {
        ...changedSelectionRequest.bricksContext,
        elements: [
          { id: 'hero01', name: 'section', label: 'section' },
          { id: 'unrelated', name: 'section', label: 'section' },
        ],
      },
    }).answer;
    expect(genericLabelsAnswer).toContain('visibility condition target (section, Bricks ID hero01) was grounded earlier');
    expect(genericLabelsAnswer).not.toContain('grounded visibility condition (section, Bricks ID hero01) was grounded');
  });

  it('recognizes the structured query-loop target choice and explains that current values do not remove capability', () => {
    expect(genericTargetSelectionRejection({
      action: 'query_loop',
      targetId: 'loop01',
      query: {
        objectType: 'post',
        post_type: ['post'],
        posts_per_page: 3,
        orderby: 'date',
        order: 'DESC',
      },
    }, request)).toBeNull();

    const prompt = renderQuickTextEditRunnerPrompt(request);
    expect(prompt).toContain('A listed live field remains eligible when its current value is false, empty, null, or absent');
    expect(prompt).toContain('"action":"query_loop"');
  });

  it('gives the model the exact bounded API and array Query Loop schemas', () => {
    const prompt = renderQuickTextEditRunnerPrompt(request);
    expect(prompt).toContain('"objectType":"api"');
    expect(prompt).toContain('"api_url":"https://example.test/items"');
    expect(prompt).toContain('"response_path":"items"');
    expect(prompt).toContain('"objectType":"array"');
    expect(prompt).toContain('"arrayEditor":"[{\\"name\\":\\"Alpha\\"}]"');
    expect(prompt).toContain('Do not return API settings as nested target fields');
  });

  it('labels bounded recent chat oldest-to-newest and requires a structured interpretation decision for historical follow-ups', () => {
    const prompt = renderQuickTextEditRunnerPrompt({
      ...request,
      prompt: 'Implement the second question I asked.',
      recentChat: [
        {
          id: 'user-second',
          role: 'user',
          content: 'Make it visible on Fridays.',
          createdAt: 300,
          sessionMode: 'chat',
          provenance: { source: 'live_v2', authority: 'conversation_only' },
        },
        {
          id: 'assistant-first',
          role: 'assistant',
          content: 'Here are the Monday steps.',
          createdAt: 200,
          sessionMode: 'chat',
          provenance: { source: 'live_v2', authority: 'conversation_only' },
        },
        {
          id: 'user-first',
          role: 'user',
          content: 'Make it visible on Mondays.',
          createdAt: 100,
          sessionMode: 'chat',
          provenance: { source: 'live_v2', authority: 'conversation_only' },
        },
      ],
    });
    expect(prompt).toContain('oldest-to-newest');
    expect(prompt.indexOf('Make it visible on Mondays.')).toBeLessThan(
      prompt.indexOf('Make it visible on Fridays.'),
    );
    expect(prompt).toContain('"sequence": 1');
    expect(prompt).toContain('"userSequence": 2');
    expect(prompt).toContain('"sourceMessageId":"exact live-v2 user message id"');
    expect(prompt).toContain('"chronology":"oldest_to_newest"');
    expect(prompt).toContain('Never use legacy-v1, display-only, restored transcript, an assistant row, an invented message id, or raw chat alone as edit authority.');
    expect(prompt).toContain('"currentStateAuthority": "none_assistant_narration_may_be_stale"');
    expect(prompt).toContain('Never treat an assistant conversation row as evidence of a current Bricks value');
    expect(renderQuickTextEditRunnerPrompt({
      ...request,
      mode: 'plan',
    })).toContain('If a related current value is absent from the live builder context and inventories, omit the claim');
  });

  it('preserves the newest verified mutation relationship when a long conversation is prompt-bounded', () => {
    const longOldDetail = 'Earlier unrelated design detail. '.repeat(180);
    const prompt = renderQuickTextEditRunnerPrompt({
      ...request,
      prompt: 'Start a conversation.',
      recentChat: [
        { id: 'user-old-1', role: 'user', content: longOldDetail, createdAt: 10, sessionMode: 'design', provenance: { source: 'live_v2' } },
        { id: 'assistant-old-1', role: 'assistant', content: longOldDetail, createdAt: 20, sessionMode: 'design', provenance: { source: 'live_v2' } },
        { id: 'user-old-2', role: 'user', content: longOldDetail, createdAt: 30, sessionMode: 'design', provenance: { source: 'live_v2' } },
        { id: 'assistant-old-2', role: 'assistant', content: longOldDetail, createdAt: 40, sessionMode: 'design', provenance: { source: 'live_v2' } },
        { id: 'user-move', role: 'user', content: 'move it below the image', createdAt: 50, sessionMode: 'design', provenance: { source: 'live_v2' } },
        {
          id: 'assistant-move',
          role: 'assistant',
          content: 'Moved the paragraph below the image.',
          createdAt: 60,
          sessionMode: 'design',
          provenance: { source: 'live_v2' },
          events: [{
            kind: 'verified_mutation',
            status: 'applied',
            operation: 'reorder',
            targets: [{
              elementId: 'paragraph-1',
              fieldKeys: ['__position__'],
              before: { parentId: 'copy-wrap', previousSiblingId: 'heading-1', nextSiblingId: 'actions-1' },
              after: { parentId: 'media-wrap', previousSiblingId: 'image-1', nextSiblingId: 'caption-1' },
            }],
          }],
        },
        { id: 'user-correction', role: 'user', content: 'undo that, I meant the button', createdAt: 70, sessionMode: 'design', provenance: { source: 'live_v2' } },
        { id: 'assistant-clarification', role: 'assistant', content: 'Which button?', createdAt: 80, sessionMode: 'design', provenance: { source: 'live_v2' } },
      ],
    });

    expect(prompt).toContain('"id": "assistant-move"');
    expect(prompt).toContain('"parentId": "copy-wrap"');
    expect(prompt).toContain('"id": "user-correction"');
    expect(prompt).not.toContain('"id": "user-old-1"');
    expect(prompt.indexOf('"id": "assistant-move"')).toBeLessThan(
      prompt.indexOf('"id": "user-correction"'),
    );
  });

  it('keeps richer live mutation events when a stale persisted transcript row has the same message id', () => {
    const verifiedEvent = {
      kind: 'verified_mutation',
      status: 'applied',
      operation: 'reorder',
      targets: [{
        elementId: 'paragraph-1',
        fieldKeys: ['__position__'],
        before: { parentId: 'copy-wrap', previousSiblingId: 'heading-1', nextSiblingId: 'actions-1' },
        after: { parentId: 'media-wrap', previousSiblingId: 'image-1', nextSiblingId: 'caption-1' },
      }],
    };
    const prompt = renderQuickTextEditRunnerPrompt({
      ...request,
      prompt: 'Start a conversation.',
      messages: [{
        id: 'assistant-move',
        role: 'assistant',
        content: 'Moved the paragraph below the image.',
        createdAt: 60,
        sessionMode: 'design',
        provenance: { source: 'live_v2' },
        events: [{ kind: 'activity', status: 'succeeded', label: 'Request understood' }, verifiedEvent],
      }],
      recentChat: [{
        id: 'assistant-move',
        role: 'assistant',
        content: 'Moved the paragraph below the image.',
        createdAt: 60,
        sessionMode: 'design',
        provenance: { source: 'live_v2' },
        events: [{ kind: 'activity', status: 'succeeded', label: 'Request understood' }],
      }],
    });

    expect(prompt).toContain('"kind": "verified_mutation"');
    expect(prompt).toContain('"parentId": "copy-wrap"');
    expect(prompt).toContain('"nextSiblingId": "actions-1"');
  });

  it('accepts one exact verified relationship restoration beside the semantic correction subject', () => {
    const correctionRequest = {
      ...request,
      sessionType: 'bricks_agent_model_edit',
      runContext: { authorizedMutationSession: true },
      intentContract: {
        schema: 'pixflow.bricks.intent.v1',
        intent: 'selected_element',
        targetElementIds: ['button-1'],
        placement: { mode: 'after', targetId: 'image-1', preserveExisting: true },
      },
      bricksContext: {
        ...request.bricksContext,
        elements: [
          { id: 'paragraph-1' },
          { id: 'heading-1' },
          { id: 'actions-1' },
          { id: 'copy-wrap' },
          { id: 'button-1' },
          { id: 'image-1' },
          { id: 'media-wrap' },
        ],
      },
      messages: [{
        id: 'assistant-move',
        role: 'assistant',
        events: [{
          kind: 'verified_mutation',
          status: 'applied',
          operation: 'reorder',
          targets: [{
            elementId: 'paragraph-1',
            fieldKeys: ['__position__'],
            before: { parentId: 'copy-wrap', previousSiblingId: 'heading-1', nextSiblingId: 'actions-1' },
            after: { parentId: 'media-wrap', previousSiblingId: 'image-1', nextSiblingId: '' },
          }],
        }],
      }],
    };
    const correctedCompound = {
      action: 'compound_mutation',
      operations: [
        {
          opId: 'restore-paragraph',
          action: 'reorder',
          orderedIds: ['paragraph-1'],
          position: { mode: 'before', targetId: 'actions-1', parentId: 'copy-wrap' },
        },
        {
          opId: 'move-button',
          action: 'reorder',
          orderedIds: ['button-1'],
          position: { mode: 'after', targetId: 'image-1', parentId: 'media-wrap' },
        },
      ],
    };

    expect(genericTargetSelectionRejection(correctedCompound, correctionRequest)).toBeNull();
    expect(genericTargetSelectionRejection({
      ...correctedCompound,
      operations: [
        {
          opId: 'restore-paragraph-wrongly',
          action: 'reorder',
          orderedIds: ['paragraph-1'],
          position: { mode: 'before', targetId: 'image-1', parentId: 'media-wrap' },
        },
        correctedCompound.operations[1],
      ],
    }, correctionRequest)).toMatchObject({
      code: 'intent_contract_subject_missing',
      operationId: 'restore-paragraph-wrongly',
    });
  });

  it('labels grounded Ask and Plan proposals separately from unrelated Design turns for ordinal follow-ups', () => {
    const prompt = renderQuickTextEditRunnerPrompt({
      ...request,
      prompt: 'Implement the second thing I asked for.',
      workingMemory: {
        facts: [
          {
            provenance: {
              sourceMessageId: 'user-copy-first',
              sourceMessageMode: 'chat',
              sourceMessageSource: 'live_v2',
            },
          },
          {
            provenance: {
              sourceMessageId: 'user-copy-second',
              sourceMessageMode: 'chat',
              sourceMessageSource: 'live_v2',
            },
          },
        ],
      },
      recentChat: [
        { id: 'user-unrelated', role: 'user', content: 'Bind the heading to the post title now.', createdAt: 10, sessionMode: 'design', provenance: { source: 'live_v2' } },
        { id: 'assistant-unrelated', role: 'assistant', content: 'Done.', createdAt: 20, sessionMode: 'design', provenance: { source: 'live_v2' } },
        { id: 'user-copy-first', role: 'user', content: 'Could the paragraph use the first option?', createdAt: 30, sessionMode: 'chat', provenance: { source: 'live_v2' } },
        { id: 'assistant-copy-first', role: 'assistant', content: 'Yes.', createdAt: 40, sessionMode: 'chat', provenance: { source: 'live_v2' } },
        { id: 'user-copy-second', role: 'user', content: 'Could it instead use the second option?', createdAt: 50, sessionMode: 'chat', provenance: { source: 'live_v2' } },
        { id: 'user-apply', role: 'user', content: 'Implement the second thing I asked for.', createdAt: 60, sessionMode: 'design', provenance: { source: 'live_v2' } },
      ],
    });

    expect(prompt).toContain('"id": "user-unrelated"');
    expect(prompt).toContain('"groundedRequestSequence": null');
    expect(prompt).toContain('"id": "user-copy-first"');
    expect(prompt).toContain('"groundedRequestSequence": 1');
    expect(prompt).toContain('"id": "user-copy-second"');
    expect(prompt).toContain('"groundedRequestSequence": 2');
    expect(prompt).toContain('unrelated prior Design actions do not change that ordinal');
    expect(prompt).toContain("Return sourceUserSequence as the selected row's absolute labelled userSequence");
  });

  it('uses the canonical query field in the target decision when hasLoop is the companion patch', () => {
    const result = {
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
      confidence: 'high',
      reason: 'The selected loop target exposes both required native fields.',
    };
    expect(targetDecisionForResult(result, request, false)).toMatchObject({
      targetId: 'loop01',
      fieldKey: 'query',
      capability: 'query_loop',
    });
  });

  it('extracts a structured Query Loop action instead of surfacing its JSON as prose', () => {
    const payload = {
      action: 'query_loop',
      targetId: 'loop01',
      query: {
        objectType: 'post',
        post_type: ['post'],
        posts_per_page: 3,
        orderby: 'date',
        order: 'DESC',
      },
      confidence: 'high',
      reason: 'The selected target exposes the native fields.',
    };
    const eventText = JSON.stringify({
      type: 'text',
      part: { type: 'text', text: JSON.stringify(payload) },
    });
    expect(extractQuickTextEditModelResult(eventText)).toEqual(payload);
  });

  it('verifies insert placement against live elements without requiring the selected ID', () => {
    const result = {
      action: 'insert',
      position: { mode: 'append_to', targetId: 'hero01' },
      elements: [{ name: 'code', settings: { javascriptCode: 'window.ready = true;' } }],
      confidence: 'high',
      reason: 'The hero is the uniquely requested insertion parent.',
    };
    expect(genericTargetSelectionRejection(result, request)).toBeNull();
    expect(targetDecisionForResult(result, request, false)).toMatchObject({
      targetId: 'hero01',
      fieldKey: '__position__',
      capability: 'element_insert',
    });
  });

  it('preserves a model-declared Design ambiguity as clarification instead of forcing a capability error', () => {
    const ambiguousRequest = {
      ...request,
      prompt: 'Make the update section visible only on Mondays. Apply it now.',
      bricksContext: {
        ...request.bricksContext,
        targetResolution: {
          status: 'ambiguous',
          activeSelectionId: 'unrelated',
          query: 'update',
          candidates: [
            { elementId: 'product1', elementType: 'section', label: 'Product update' },
            { elementId: 'team1', elementType: 'section', label: 'Team update' },
          ],
        },
      },
    };
    expect(preserveAmbiguousDesignTargetAnswer({
      action: 'answer',
      answer: 'More than one live target remains.',
      reason: 'ambiguous live candidates',
    }, ambiguousRequest)).toBe(true);
    expect(preserveAmbiguousDesignTargetAnswer({
      action: 'condition',
      targetId: 'product1',
    }, ambiguousRequest)).toBe(false);
    expect(preserveAmbiguousDesignTargetAnswer({
      action: 'answer',
      answer: 'More than one live target remains.',
    }, { ...ambiguousRequest, mode: 'plan' })).toBe(false);
  });
});
