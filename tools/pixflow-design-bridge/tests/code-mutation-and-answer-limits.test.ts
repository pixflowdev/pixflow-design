import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { delimiter, join } from 'node:path';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  buildResolvedCodePatchModelResult,
  buildStructuredCodePatchModelResult,
  normalizeBricksAgentMutationPlan,
  validateAgentProposedWorkingMemoryFact,
} from '../bricks-agent/mutation-planner.mjs';
import {
  extractQuickTextEditModelResult,
  genericTargetSelectionRejection,
  normalizeInsertedFormSettings,
  normalizeQuickTextEditResult,
  renderQuickTextEditRunnerPrompt,
  sanitizeQuickAnswer,
  targetDecisionForResult,
} from '../bricks-handoff-cli.mjs';

const buildProposedCodeUpdateFact = validateAgentProposedWorkingMemoryFact;
const selectProposedWorkingMemoryFact = (fact, _legacy, request) =>
  validateAgentProposedWorkingMemoryFact(fact, request);

const javascriptTarget = {
  elementId: 'dsrxax',
  fieldKey: 'javascriptCode',
  targetKind: 'code_javascript',
  targetLabel: 'Filter sort helper',
  valuePreview: 'const current = true;',
};
const viewDetailsAttributeTarget = {
  elementId: 'bwo92e',
  fieldKey: '_attributes',
  targetKind: 'attributes',
  targetLabel: 'View details attributes',
  valuePreview: '[]',
};
const codeRuntimeContext = {
  knowledge: {
    codeElementSchema: {
      capabilities: {
        canExecuteCode: true,
        canReadSensitiveCode: true,
        nativeSavePipeline: true,
      },
    },
  },
};

describe('floating-panel answer and Code element boundaries', () => {
  it('routes opted-in imagegen output through the existing guarded media project', () => {
    const request = { mode: 'design', prompt: 'Generate a garden image', mediaProjectId: 'media-qa' };
    const enabled = renderQuickTextEditRunnerPrompt({ ...request, codexImagegenOverride: true });
    expect(enabled).toContain('Image generation override:');
    expect(enabled).toContain('Copy the actual imagegen output file into OD_PROJECT_DIR');
    expect(enabled).toContain('human-readable title, accurate altText');
    expect(enabled).toContain('Videos continue through the configured video provider');
    expect(renderQuickTextEditRunnerPrompt(request)).not.toContain('Image generation override:');
  });
  it('preserves unset field state so Code guidance distinguishes saved values from Bricks placeholders', () => {
    const prompt = renderQuickTextEditRunnerPrompt({
      mode: 'ask',
      prompt: 'What does the JavaScript in this Code element do?',
      editableOptionTargets: [{
        ...javascriptTarget,
        valuePreview: '',
        valueState: 'unset',
        placeholderPreview: "console.log('Hello, World!');",
      }],
    });

    expect(prompt).toContain('"valueState": "unset"');
    expect(prompt).toContain('"placeholderPreview": "console.log(\'Hello, World!\');"');
    expect(prompt).toContain('describe it as a Bricks placeholder, not saved or active code');
    expect(prompt).toContain('the per-element Execute code checkbox governs the PHP & HTML, CSS, and JavaScript panes together');
    expect(prompt).toContain('Never describe this checkbox as PHP-only.');
  });

  it('accepts one compatible model-selected Code target even when another element is actively selected', () => {
    const request = {
      mode: 'design',
      prompt: 'Update the filter sort helper JavaScript.',
      bricksContext: { selectedId: 'other-selected' },
      editableOptionTargets: [javascriptTarget],
      mcpRuntimeContext: codeRuntimeContext,
    };
    const result = buildStructuredCodePatchModelResult({
      action: 'code_update',
      targetId: 'dsrxax',
      fieldKey: 'javascriptCode',
      source: 'window.filterSortReady = true;',
      confidence: 'high',
      reason: 'The label and JavaScript capability uniquely match the requested filter sort helper.',
    }, request);
    expect(result).toMatchObject({
      action: 'patch',
      patches: [{ elementId: 'dsrxax', settings: { javascriptCode: 'window.filterSortReady = true;', executeCode: true } }],
    });
    expect(genericTargetSelectionRejection({
      action: 'code_update',
      targetId: 'invented',
      fieldKey: 'javascriptCode',
      source: 'window.filterSortReady = true;',
    }, request)).toMatchObject({
      code: 'target_field_incompatible',
      requestedTargetId: 'invented',
      candidates: [expect.objectContaining({ elementId: 'dsrxax' })],
    });
    // Floating-panel Design dispatch carries explicit session authorization;
    // a standalone request without it must not gain a native settings bypass.
    expect(normalizeQuickTextEditResult(result, request, null).status).toBe('escalate');
    const authorizedRequest = { ...request, modelLed: true };
    expect(targetDecisionForResult(normalizeQuickTextEditResult(result, authorizedRequest, null), authorizedRequest, true)).toMatchObject({
      version: 1,
      targetId: 'dsrxax',
      fieldKey: 'javascriptCode',
      capability: 'code_element',
      source: 'repair-selection',
      repairAttempted: true,
    });
  });

  it('retains a direct Code update emitted inside an OpenCode text event', () => {
    const eventText = JSON.stringify({
      type: 'text',
      part: {
        type: 'text',
        text: JSON.stringify({
          action: 'code_update',
          targetId: 'code123',
          fieldKey: 'javascriptCode',
          source: "document.addEventListener('DOMContentLoaded', () => {});",
          answer: 'Added the requested JavaScript.',
        }),
      },
    });

    expect(extractQuickTextEditModelResult(eventText)).toMatchObject({
      action: 'code_update',
      targetId: 'code123',
      fieldKey: 'javascriptCode',
    });
  });

  it('repairs one missing Plan terminal answer without exposing a second assistant turn', () => {
    const root = mkdtempSync(join(tmpdir(), 'pixflow-plan-answer-repair-'));
    const workspace = join(root, 'workspace');
    const requestFile = join(root, 'request.json');
    const fixture = join(root, 'runner.cjs');
    const binDir = join(root, 'bin');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(requestFile, JSON.stringify({
      mode: 'plan',
      prompt: "Plan how you would add a small console log to this Code element's JavaScript pane and keep the existing PHP/HTML untouched. Don't apply it.",
      bricksContext: {
        postId: 937,
        area: 'content',
        selectedId: 'dsrxax',
      },
      editableOptionTargets: [
        javascriptTarget,
        {
          ...javascriptTarget,
          fieldKey: 'code',
          targetKind: 'code_html_php',
          valuePreview: "<h1 class='my-heading'>Just some HTML</h1>",
        },
      ],
      mcpRuntimeContext: codeRuntimeContext,
    }));
    writeFileSync(fixture, [
      "let prompt = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', chunk => { prompt += chunk; });",
      "process.stdin.on('end', () => {",
      "  if (!prompt.includes('bounded read-only answer repair')) {",
      "    console.log(JSON.stringify({ type: 'step_start', part: { type: 'step-start' } }));",
      "    console.log(JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', reason: 'stop' } }));",
      "    return;",
      "  }",
      "  const payload = { action: 'answer', answer: '# Plan\\n\\n## Goal\\nAdd one console log in JavaScript while preserving PHP & HTML.\\n\\n## Next Step\\nWhen you\\'re ready, switch to Design mode and tell me to proceed.', confidence: 'high', reason: 'Recovered one read-only plan from live Code inventory.' };",
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
        readOnlyAnswerRepair: {
          attempted: true,
          succeeded: true,
          maxAttempts: 1,
        },
      });
      expect(result.answer).toContain('# Plan');
      expect(result.answer).toContain("When you're ready, switch to Design mode and tell me to proceed.");
      expect(result.patches ?? []).toEqual([]);
      expect(readFileSync(join(workspace, 'quick-text-edit-read-only-answer-repair-prompt.txt'), 'utf8'))
        .toContain('bounded read-only answer repair');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('shows Ask and Plan the canonical internal fact shape instead of an answer-only schema', () => {
    const source = readFileSync(
      new URL('../bricks-handoff-cli.mjs', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      'Schema when `workingMemoryFact` is included: {"action":"answer","answer":"...","confidence":"high|medium|low","reason":"short reason","workingMemoryFact":',
    );
    expect(source).toContain(
      'For a Code proposal, use kind `code_update`, capability `code_element`,',
    );
    expect(source).toContain(
      'prefer stable custom data attributes over Bricks CSS IDs',
    );
  });

  it('exposes and normalizes the bounded native Form insertion contract', () => {
    const prompt = renderQuickTextEditRunnerPrompt({
      mode: 'design',
      prompt: 'Add a newsletter form after the selected button with name and email fields.',
      bricksContext: { selectedId: 'if68fp' },
      editableOptionTargets: [],
    });
    expect(prompt).toContain('"name":"form"');
    expect(prompt).toContain('"actions":[]');
    expect(prompt).toContain('Do not invent or enable email, webhook, redirect, integration, authentication, post, or submission actions');
    expect(prompt).toContain('`settings.actions` must be an array of native action id strings');
    expect(prompt).toContain('"emailTo":"custom"');
    expect(prompt).toContain('"webhooks":[{"id":"pxf001"');
    expect(normalizeInsertedFormSettings({
      fields: [
        { type: 'text', label: 'Name' },
        { type: 'email', label: 'Email', required: true },
        { type: 'select', label: 'Team size', options: ['Solo', '2–5', '6+'] },
        { type: 'radio', label: 'Preferred contact', options: ['Email', 'Phone'] },
      ],
      submitButtonText: 'Subscribe',
      actions: [],
    })).toEqual({
      fields: [
        { type: 'text', label: 'Name', id: 'pxf001' },
        { type: 'email', label: 'Email', required: true, id: 'pxf002' },
        { type: 'select', label: 'Team size', options: 'Solo\n2–5\n6+', id: 'pxf003' },
        { type: 'radio', label: 'Preferred contact', options: 'Email\nPhone', id: 'pxf004' },
      ],
      submitButtonText: 'Subscribe',
      actions: [],
    });
  });

  it('preserves a complete bounded long user-facing answer', () => {
    const answer = Array.from({ length: 160 }, (_, index) => (
      `${index + 1}. Open the relevant Bricks control and verify the setting.`
    )).join('\n');

    expect(answer.length).toBeGreaterThan(5_000);
    expect(sanitizeQuickAnswer(answer)).toBe(answer);
  });

  it('constructs one controlled selected Code element JavaScript patch', () => {
    const source = [
      'function updateSortButtonText() {',
      '  const button = document.querySelector(".js-sort-button");',
      '  if (button) button.textContent = "Sort";',
      '}',
      'document.addEventListener("bricks/ajax/query_result/displayed", updateSortButtonText);',
    ].join('\n');
    const result = buildStructuredCodePatchModelResult({
      action: 'code_update',
      targetId: 'dsrxax',
      fieldKey: 'javascriptCode',
      source,
      answer: 'I updated the selected filter sort helper.',
    }, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      modelLed: true,
      bricksContext: { selectedId: 'dsrxax' },
      editableOptionTargets: [javascriptTarget],
      mcpRuntimeContext: codeRuntimeContext,
    });

    expect(result).toMatchObject({
      action: 'patch',
      mutationType: 'code_update',
      patches: [{
        elementId: 'dsrxax',
        settings: { javascriptCode: source, executeCode: true },
      }],
    });
    expect(normalizeBricksAgentMutationPlan(result, {
      mode: 'design',
      sessionType: 'bricks_agent_model_edit',
      modelLed: true,
      bricksContext: { selectedId: 'dsrxax' },
      editableOptionTargets: [javascriptTarget],
      mcpRuntimeContext: codeRuntimeContext,
    }).patches).toEqual([expect.objectContaining({
      id: 'dsrxax',
      settings: { javascriptCode: source, executeCode: true },
    })]);
  });

  it('keeps Ask and Plan code guidance read-only', () => {
    const candidate = {
      action: 'code_update',
      targetId: 'dsrxax',
      fieldKey: 'javascriptCode',
      source: 'window.test = true;',
    };
    const request = {
      bricksContext: { selectedId: 'dsrxax' },
      editableOptionTargets: [javascriptTarget],
      mcpRuntimeContext: codeRuntimeContext,
    };

    expect(buildStructuredCodePatchModelResult(candidate, { ...request, mode: 'ask' })).toBeNull();
    expect(buildStructuredCodePatchModelResult(candidate, { ...request, mode: 'plan' })).toBeNull();
  });

  it.skip('legacy prompt-derived Code fact construction is no longer supported', () => {
    const source = [
      "document.addEventListener('DOMContentLoaded', () => {",
      "  const element = document.querySelector('#brxe-dsrxax');",
      "  if (element) element.dataset.pixflowCodeTest = 'ready';",
      '});',
    ].join('\n');
    const workingMemory = {
      currentTurn: {
        number: 2,
        messageId: 'user-code-plan',
        target: { postId: 937, area: 'content', elementId: 'dsrxax', fieldKey: 'javascriptCode' },
        fingerprints: { page: 'page:937', inventory: 'inventory:code-v1' },
      },
    };
    const request = {
      mode: 'plan',
      prompt: `Plan how to replace the selected JavaScript pane with this exact source:\n\n\`\`\`javascript\n${source}\n\`\`\``,
      bricksContext: { selectedId: 'dsrxax', postId: 937, area: 'content' },
      editableOptionTargets: [javascriptTarget],
      mcpRuntimeContext: codeRuntimeContext,
      workingMemory,
    };
    const proposed = buildProposedCodeUpdateFact(request);
    expect(proposed).toMatchObject({
      kind: 'code_update',
      capability: 'code_element',
      target: { postId: 937, area: 'content', elementId: 'dsrxax', fieldKey: 'javascriptCode' },
      intent: { kind: 'code_update', fieldKey: 'javascriptCode', source },
      status: 'proposed',
    });

    expect(buildResolvedCodePatchModelResult({
      ...request,
      mode: 'design',
      resolvedWorkingMemoryFact: proposed,
    })).toMatchObject({
      action: 'patch',
      mutationType: 'code_update',
      patches: [{ elementId: 'dsrxax', settings: { javascriptCode: source, executeCode: true } }],
    });
  });

  it.skip('legacy prompt-derived Code Plan facts are no longer supported', () => {
    const workingMemory = {
      currentTurn: {
        number: 3,
        messageId: 'user-code-attribute-plan',
        target: { postId: 937, area: 'content', elementId: 'dsrxax', fieldKey: 'javascriptCode' },
        fingerprints: { page: 'page:937', inventory: 'inventory:code-attribute-v1' },
      },
    };
    const request = {
      mode: 'plan',
      prompt: 'Plan this exact change: add data-track="product-click" to the View details link, then add JavaScript to the selected Code element that logs "Product update link clicked" when that link is clicked. Use the data attribute, not a Bricks ID. Keep the PHP/HTML and CSS untouched. Do not make changes yet.',
      targets: [{
        elementId: 'bwo92e',
        fieldKey: 'text',
        targetKind: 'text',
        targetLabel: 'View details',
        currentText: 'View details',
        currentVisibleText: 'View details',
      }],
      bricksContext: { selectedId: 'dsrxax', postId: 937, area: 'content' },
      editableOptionTargets: [javascriptTarget, viewDetailsAttributeTarget],
      mcpRuntimeContext: codeRuntimeContext,
      workingMemory,
    };
    const proposed = buildProposedCodeUpdateFact(request);
    expect(proposed).toMatchObject({
      kind: 'code_update',
      target: { elementId: 'dsrxax', fieldKey: 'javascriptCode' },
      intent: {
        kind: 'code_update',
        fieldKey: 'javascriptCode',
        source: expect.stringContaining('Product update link clicked'),
        attributeBinding: {
          elementId: 'bwo92e',
          name: 'data-track',
          value: 'product-click',
        },
      },
    });
    expect(proposed?.intent.source).toContain('[data-track=\\"product-click\\"]');

    expect(buildResolvedCodePatchModelResult({
      ...request,
      mode: 'design',
      resolvedWorkingMemoryFact: proposed,
    })).toMatchObject({
      action: 'patch',
      mutationType: 'code_update',
      attributeBinding: {
        elementId: 'bwo92e',
        name: 'data-track',
        value: 'product-click',
      },
      patches: [{
        elementId: 'dsrxax',
        fieldKey: 'javascriptCode',
        value: proposed?.intent.source,
      }],
    });
    expect(normalizeQuickTextEditResult(
      buildResolvedCodePatchModelResult({
        ...request,
        mode: 'design',
        resolvedWorkingMemoryFact: proposed,
      }),
      { ...request, mode: 'design' },
      null,
    )).toMatchObject({
      status: 'completed',
      action: 'patch',
      mutationType: 'code_update',
      attributeBinding: {
        elementId: 'bwo92e',
        name: 'data-track',
        value: 'product-click',
      },
    });

    expect(buildProposedCodeUpdateFact({
      ...request,
      targets: [
        ...request.targets,
        {
          ...request.targets[0],
          elementId: 'duplicate',
        },
      ],
      editableOptionTargets: [
        ...request.editableOptionTargets,
        { ...viewDetailsAttributeTarget, elementId: 'duplicate' },
      ],
    })).toBeNull();
  });

  it('canonicalizes a structured nested Code proposal without treating prose as authority', () => {
    const source = [
      "document.addEventListener('DOMContentLoaded', () => {",
      "  const element = document.querySelector('#brxe-dsrxax');",
      "  if (element) element.dataset.pixflowCodeTest = 'ready';",
      '});',
    ].join('\n');
    const request = {
      mode: 'plan',
      prompt: 'Plan the JavaScript change for the selected Code element.',
      bricksContext: { selectedId: 'dsrxax', postId: 937, area: 'content' },
      editableOptionTargets: [javascriptTarget],
      mcpRuntimeContext: codeRuntimeContext,
      workingMemory: {
        currentTurn: {
          number: 2,
          messageId: 'user-code-plan',
          target: { postId: 937, area: 'content', elementId: 'dsrxax', fieldKey: null },
          fingerprints: { page: 'page:937', inventory: 'inventory:code-v1' },
        },
      },
    };
    const modelFact = {
      schema: 'pixflow.bricks.working-memory.v2',
      currentTurn: {
        target: { postId: 937, area: 'content', elementId: 'dsrxax', fieldKey: 'javascriptCode' },
        intent: {
          kind: 'code_javascript',
          elementId: 'dsrxax',
          fieldKey: 'javascriptCode',
          value: source,
          sourceMessageMode: 'plan',
          status: 'proposed',
        },
      },
    };

    expect(selectProposedWorkingMemoryFact(modelFact, null, request)).toMatchObject({
      id: 'fact:user-code-plan:code_update',
      kind: 'code_update',
      capability: 'code_element',
      target: {
        postId: 937,
        area: 'content',
        elementId: 'dsrxax',
        fieldKey: 'javascriptCode',
      },
      intent: { kind: 'code_update', fieldKey: 'javascriptCode', source },
      status: 'proposed',
      fingerprints: { page: 'page:937', inventory: 'inventory:code-v1' },
      provenance: { sourceMessageMode: 'plan', extractedBy: 'bridge' },
    });
    expect(selectProposedWorkingMemoryFact({
      ...modelFact,
      currentTurn: {
        ...modelFact.currentTurn,
        target: { ...modelFact.currentTurn.target, elementId: 'different' },
      },
    }, null, request)).toBeNull();
  });

  it('fails closed for wrappers, PHP, invented hooks, and non-code targets without making selection identity a universal gate', () => {
    const request = {
      mode: 'design',
      bricksContext: { selectedId: 'dsrxax' },
      editableOptionTargets: [javascriptTarget],
      mcpRuntimeContext: codeRuntimeContext,
    };
    const candidate = {
      action: 'code_update',
      targetId: 'dsrxax',
      fieldKey: 'javascriptCode',
      source: 'window.test = true;',
    };

    expect(buildStructuredCodePatchModelResult({ ...candidate, source: '<script>window.test = true;</script>' }, request)).toBeNull();
    expect(buildStructuredCodePatchModelResult({ ...candidate, source: '<?php echo "unsafe"; ?>' }, request)).toBeNull();
    expect(buildStructuredCodePatchModelResult(candidate, {
      ...request,
      bricksContext: { selectedId: 'different' },
    })).toMatchObject({
      action: 'patch',
      patches: [{ elementId: 'dsrxax', settings: { javascriptCode: candidate.source, executeCode: true } }],
    });
    expect(buildStructuredCodePatchModelResult({
      ...candidate,
      attributeBinding: { elementId: 'missing', name: 'data-test', value: 'one' },
    }, request)).toBeNull();
    expect(buildStructuredCodePatchModelResult({
      ...candidate,
      fieldKey: 'cssCode',
      source: '[data-test="one"] { color: inherit; }',
      attributeBinding: { elementId: 'dsrxax', name: 'data-test', value: 'one' },
    }, {
      ...request,
      editableOptionTargets: [
        { ...javascriptTarget, fieldKey: 'cssCode', targetKind: 'code_css' },
        { ...viewDetailsAttributeTarget, elementId: 'dsrxax' },
      ],
    })).toMatchObject({
      action: 'patch',
      patches: expect.arrayContaining([
        expect.objectContaining({ elementId: 'dsrxax', settings: { cssCode: '[data-test="one"] { color: inherit; }', executeCode: true } }),
        expect.objectContaining({ elementId: 'dsrxax', fieldKey: '_attributes', value: expect.arrayContaining([expect.objectContaining({ name: 'data-test', value: 'one' })]) }),
      ]),
    });
    expect(buildStructuredCodePatchModelResult(candidate, {
      ...request,
      editableOptionTargets: [{ ...javascriptTarget, targetKind: 'text' }],
    })).toBeNull();
    expect(buildStructuredCodePatchModelResult(candidate, {
      ...request,
      mcpRuntimeContext: { knowledge: { codeElementSchema: { capabilities: { canExecuteCode: false } } } },
    })).toBeNull();
  });

  it('accepts PHP & HTML only with the native execute-code and save-pipeline gates', () => {
    const source = '<div class="notice"><?php echo esc_html( wp_date( "Y" ) ); ?></div>';
    expect(buildStructuredCodePatchModelResult({
      action: 'code_update',
      targetId: 'dsrxax',
      fieldKey: 'code',
      source,
    }, {
      mode: 'design',
      bricksContext: { selectedId: 'dsrxax' },
      editableOptionTargets: [{ ...javascriptTarget, fieldKey: 'code', targetKind: 'code_html_php' }],
      mcpRuntimeContext: codeRuntimeContext,
    })).toMatchObject({
      action: 'patch',
      mutationType: 'code_update',
      patches: [{ elementId: 'dsrxax', settings: { code: source, executeCode: true } }],
    });
  });

  it('normalizes one newly created Code element with one bounded JavaScript pane', () => {
    const source = "document.addEventListener('DOMContentLoaded', () => console.log('ready'));";
    const request = {
      mode: 'design',
      bricksContext: { selectedId: 'section-1' },
      mcpRuntimeContext: codeRuntimeContext,
    };
    expect(normalizeQuickTextEditResult({
      action: 'insert',
      elements: [{ name: 'code', settings: { javascriptCode: source } }],
      position: { mode: 'append_to', targetId: 'section-1' },
      attributeBinding: {
        elementId: 'section-1',
        name: 'data-pixflow-ready-target',
        value: 'primary',
      },
      answer: 'I added a new Code element.',
    }, request, null)).toMatchObject({
      status: 'completed',
      action: 'insert',
      elements: [{ name: 'code', settings: { javascriptCode: source, executeCode: true } }],
      position: { mode: 'append_to', targetId: 'section-1' },
      attributeBinding: {
        elementId: 'section-1',
        name: 'data-pixflow-ready-target',
        value: 'primary',
      },
    });
    expect(normalizeQuickTextEditResult({
      action: 'insert',
      elements: [{ name: 'code', settings: { javascriptCode: source, executeCode: true } }],
      position: { mode: 'append_to', targetId: 'section-1' },
    }, request, null)).toMatchObject({
      status: 'completed',
      elements: [{ name: 'code', settings: { javascriptCode: source, executeCode: true } }],
    });
    expect(normalizeQuickTextEditResult({
      action: 'insert',
      elements: [
        {
          name: 'button',
          settings: {
            text: 'Toggle',
            _attributes: [{ name: 'data-pixflow-toggle', value: 'details' }],
          },
        },
        {
          name: 'code',
          settings: {
            javascriptCode: "document.querySelector('[data-pixflow-toggle=\"details\"]')?.addEventListener('click', () => {});",
          },
        },
      ],
      position: { mode: 'append_to', targetId: 'section-1' },
    }, request, null)).toMatchObject({
      status: 'completed',
      elements: [
        {
          name: 'button',
          settings: {
            _attributes: [{
              id: 'pxf001',
              name: 'data-pixflow-toggle',
              value: 'details',
            }],
          },
        },
        { name: 'code', settings: expect.objectContaining({ executeCode: true }) },
      ],
    });
    expect(normalizeQuickTextEditResult({
      action: 'insert',
      elements: [{ name: 'code', settings: { javascriptCode: `<script>${source}</script>` } }],
      position: { mode: 'append_to', targetId: 'section-1' },
    }, request, null)).toMatchObject({
      status: 'failed',
      action: 'insert',
      elements: [],
    });
  });
});
