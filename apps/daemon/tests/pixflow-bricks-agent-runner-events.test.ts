import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  looksLikePixflowControlledJsonStream,
  normalizePixflowInsertedCodeSettings,
  normalizePixflowInsertedFormSettings,
  normalizePixflowGenerationRequirements,
  normalizePixflowBricksControlledAnswerEnvelope,
  normalizePixflowBricksExplicitClearResult,
  normalizePixflowRunnerPublicTextDelta,
  pixflowDesignMutationPresentation,
  pixflowRunnerFinalTextDelta,
  pixflowRunnerReconciledTextDelta,
  pixflowSelectedMediaRecoveryTargetIds,
  pixflowUnsupportedInsertClarification,
  shouldStreamPixflowBricksRunnerText,
  shouldVerifyPixflowExistingTargetDecision,
} from '../src/server.js';

describe('Pixflow Bricks Agent runner event visibility', () => {
  it('keeps generated nested-capability requirements bounded and allowlisted', () => {
    expect(normalizePixflowGenerationRequirements([
      { kind: 'query_loop', minimumMatches: 2, source: 'prompt' },
      { kind: 'conditions', minimumMatches: 99, source: 'model' },
      { kind: 'query_loop', minimumMatches: 1, source: 'skill' },
      { kind: 'unsafe_patch', minimumMatches: 1, source: 'prompt' },
    ])).toEqual([
      { kind: 'query_loop', minimumMatches: 2, source: 'prompt' },
      { kind: 'conditions', minimumMatches: 4, source: 'skill' },
    ]);

    const serverSource = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
    expect(serverSource).toContain('generationResultRequiresPrototypeRoute');
    expect(serverSource).toContain('shouldRoutePrototypeGeneration');
    expect(serverSource).toContain('generationRequirements: normalizePixflowGenerationRequirements');
  });

  it('does not require a pre-existing element target for new page generation', () => {
    expect(shouldVerifyPixflowExistingTargetDecision({
      mode: 'design',
      status: 'completed',
      action: 'insert',
      isGenerationRequest: true,
    })).toBe(false);
    expect(shouldVerifyPixflowExistingTargetDecision({
      mode: 'design',
      status: 'completed',
      action: 'patch',
      isGenerationRequest: false,
    })).toBe(true);
  });

  it('recovers generated media for a selected native Image or Video element', () => {
    const liveElements = [
      { id: 'hero-image', name: 'image' },
      { id: 'hero-video', name: 'video' },
      { id: 'hero-heading', name: 'heading' },
    ];

    expect(pixflowSelectedMediaRecoveryTargetIds({
      targetCandidates: [],
      surface: 'image',
      selectedId: 'hero-image',
      liveElements,
    })).toEqual(['hero-image']);
    expect(pixflowSelectedMediaRecoveryTargetIds({
      targetCandidates: [],
      surface: 'video',
      selectedId: 'hero-video',
      liveElements,
    })).toEqual(['hero-video']);
    expect(pixflowSelectedMediaRecoveryTargetIds({
      targetCandidates: [],
      surface: 'image',
      selectedId: 'hero-heading',
      liveElements,
    })).toEqual([]);
    expect(pixflowSelectedMediaRecoveryTargetIds({
      targetCandidates: ['explicit-target'],
      surface: 'image',
      selectedId: 'hero-image',
      liveElements,
    })).toEqual(['explicit-target']);
  });

  it('buffers Ask and Plan runner prose until the sanitized final answer', () => {
    expect(shouldStreamPixflowBricksRunnerText('chat')).toBe(false);
    expect(shouldStreamPixflowBricksRunnerText('plan')).toBe(false);
    expect(shouldStreamPixflowBricksRunnerText('design')).toBe(false);
  });

  it('unwraps answer JSON for live Ask and Plan prose without exposing the envelope', () => {
    const completedAnswer = JSON.stringify({
      action: 'answer',
      answer: '# Plan\n\n1. Configure the Query Loop.',
      confidence: 'high',
    });
    expect(normalizePixflowRunnerPublicTextDelta(completedAnswer))
      .toBe('# Plan\n\n1. Configure the Query Loop.');
    expect(pixflowRunnerReconciledTextDelta('', completedAnswer))
      .toBe('# Plan\n\n1. Configure the Query Loop.');
  });

  it('suppresses controlled edit payloads from the public prose stream', () => {
    expect(normalizePixflowRunnerPublicTextDelta(JSON.stringify({
      action: 'patch',
      patches: [{ elementId: 'hero', fieldKey: 'text', value: 'Changed' }],
      changeSummary: 'Update the hero.',
    }))).toBe('');
    expect(normalizePixflowRunnerPublicTextDelta(JSON.stringify({
      action: 'clear',
      clear: true,
      answer: 'Clearing all page content.',
    }))).toBe('');
  });

  it('unwraps a provider answer that contains a controlled clear contract instead of exposing JSON', () => {
    const nestedClear = JSON.stringify({
      action: 'clear',
      clear: true,
      answer: 'Clearing all content from this page.',
      mutationTitle: 'Clear page content',
      changeSummary: 'Remove all current page content and leave the page empty.',
    });

    expect(normalizePixflowBricksControlledAnswerEnvelope({
      status: 'answered',
      action: 'answer',
      answer: nestedClear,
    })).toMatchObject({
      status: 'completed',
      action: 'clear',
      clear: true,
      answer: 'Clearing all content from this page.',
    });
    expect(normalizePixflowRunnerPublicTextDelta(JSON.stringify({
      action: 'answer',
      answer: nestedClear,
    }))).toBe('');
  });

  it('routes only an explicitly confirmed clear through the compound mutation boundary', () => {
    expect(normalizePixflowBricksExplicitClearResult({
      status: 'completed',
      action: 'clear',
      clear: true,
      answer: 'Clearing all page content.',
    })).toMatchObject({
      status: 'completed',
      action: 'compound_mutation',
      mutationType: 'bricks_content_clear',
      operations: [{
        opId: 'clear-page-content',
        operation: 'clear',
        clear: true,
      }],
    });

    expect(normalizePixflowBricksExplicitClearResult({
      status: 'completed',
      action: 'clear',
      clear: false,
    })).toMatchObject({
      status: 'failed',
      action: 'escalate',
      code: 'EXPLICIT_CLEAR_REQUIRED',
    });
  });

  it('keeps newly inserted Code elements executable across the daemon handoff', () => {
    const capabilities = {
      canExecuteCode: true,
      canReadSensitiveCode: true,
      nativeSavePipeline: true,
    };
    expect(normalizePixflowInsertedCodeSettings({
      javascriptCode: "document.addEventListener('click', () => {});",
    }, capabilities)).toEqual({
      javascriptCode: "document.addEventListener('click', () => {});",
      executeCode: true,
    });
    expect(normalizePixflowInsertedCodeSettings({
      javascriptCode: "document.addEventListener('click', () => {});",
      executeCode: true,
    }, capabilities)).toEqual({
      javascriptCode: "document.addEventListener('click', () => {});",
      executeCode: true,
    });
    expect(normalizePixflowInsertedCodeSettings({
      javascriptCode: 'window.test = true;',
      executeCode: false,
    }, capabilities)).toBeNull();
  });

  it('normalizes one bounded native Form insert without inventing a submit action', () => {
    expect(normalizePixflowInsertedFormSettings({
      fields: [
        { type: 'text', label: 'Name', placeholder: 'Your name' },
        { type: 'email', label: 'Email', placeholder: 'Your email', required: true },
        { type: 'select', label: 'Team size', options: ['Solo', '2–5', '6+'] },
        { type: 'radio', label: 'Preferred contact', options: ['Email', 'Phone'] },
      ],
      submitButtonText: 'Subscribe',
      actions: [],
    })).toEqual({
      fields: [
        { type: 'text', label: 'Name', placeholder: 'Your name', id: 'pxf001' },
        { type: 'email', label: 'Email', placeholder: 'Your email', required: true, id: 'pxf002' },
        { type: 'select', label: 'Team size', options: 'Solo\n2–5\n6+', id: 'pxf003' },
        { type: 'radio', label: 'Preferred contact', options: 'Email\nPhone', id: 'pxf004' },
      ],
      submitButtonText: 'Subscribe',
      actions: [],
    });

    expect(normalizePixflowInsertedFormSettings({
      fields: [{ type: 'email', label: 'Email', id: 'email' }],
      actions: ['email'],
      emailToCustom: 'invented@example.test',
    })).toBeNull();
    expect(normalizePixflowInsertedFormSettings({
      fields: [{ type: 'email', label: '', id: 'email' }],
      actions: [],
    })).toBeNull();
  });

  it('turns unsupported native element insertion into an actionable clarification', () => {
    expect(pixflowUnsupportedInsertClarification([
      { name: 'image' },
      { name: 'slider-nested' },
    ])).toContain('Image and Slider Nested elements');
  });

  it('does not misreport an invalid insert payload as a target-selection mismatch', () => {
    const serverSource = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
    expect(serverSource).toContain('if (shouldVerifyPixflowExistingTargetDecision({');
    expect(shouldVerifyPixflowExistingTargetDecision({
      mode: 'design',
      status: 'failed',
      action: 'insert',
      isGenerationRequest: false,
    })).toBe(false);
  });

  it('separates the Design overview from the mutation timeline title and detail', () => {
    expect(pixflowDesignMutationPresentation(
      {
        answer: 'I updated the hero so it is visible only to logged-in users.',
        mutationTitle: 'Restrict hero visibility',
        changeSummary: 'Added the logged-in user condition to Hero section.',
      },
      {
        overview: 'I updated the selected element.',
        title: 'Update Hero section',
        detail: 'Update Hero section',
      },
    )).toEqual({
      overview: 'I updated the hero so it is visible only to logged-in users.',
      title: 'Restrict hero visibility',
      detail: 'Added the logged-in user condition to Hero section.',
    });
  });

  it('uses a distinct fallback overview when the model repeats its mutation detail', () => {
    expect(pixflowDesignMutationPresentation(
      {
        answer: 'Added the logged-in user condition to Hero section.',
        mutationTitle: 'Restrict hero visibility',
        changeSummary: 'Added the logged-in user condition to Hero section.',
      },
      {
        overview: 'I updated the hero visibility as requested.',
        title: 'Update Hero section',
        detail: 'Update Hero section',
      },
    )).toEqual({
      overview: 'I updated the hero visibility as requested.',
      title: 'Restrict hero visibility',
      detail: 'Added the logged-in user condition to Hero section.',
    });
  });
  it('identifies partial structured output so JSON fragments are not shown as prose', () => {
    expect(looksLikePixflowControlledJsonStream('{"action":"ans')).toBe(true);
    expect(looksLikePixflowControlledJsonStream('```json\n{"action":"answer"')).toBe(true);
    expect(looksLikePixflowControlledJsonStream('Checking the current page.')).toBe(false);
  });

  it('retains natural prose blocks and avoids duplicating the terminal answer', () => {
    expect(normalizePixflowRunnerPublicTextDelta('\n\nChecking the current page.'))
      .toBe('\n\nChecking the current page.');
    expect(pixflowRunnerFinalTextDelta('The answer.', 'The answer.')).toBe('');
    expect(pixflowRunnerFinalTextDelta('Checked the page.', 'The final answer.'))
      .toBe('\n\nThe final answer.');
  });

  it('suppresses a replayed or truncated copy once the complete answer is present', () => {
    const answer = [
      '# Plan',
      '',
      '## Goal',
      'Improve the hierarchy and readability while preserving the current page.',
      '',
      '## Acceptance checks',
      'Keep one H1 and make every later section easier to scan.',
    ].join('\n');

    expect(pixflowRunnerFinalTextDelta(`${answer}\n\n${answer.slice(0, 90)}`, answer)).toBe('');
    expect(pixflowRunnerFinalTextDelta(`Checked the page.\n\n${answer}`, answer)).toBe('');
  });

  it('emits only the missing suffix for cumulative final-answer snapshots', () => {
    expect(pixflowRunnerFinalTextDelta('The final answer starts', 'The final answer starts here.'))
      .toBe(' here.');
    expect(pixflowRunnerFinalTextDelta('The status is ready.', 'The status'))
      .toBe('\n\nThe status');
  });

  it.each(['Ask', 'Plan', 'Design'])('keeps one %s assistant answer when the terminal Markdown only changes whitespace', (mode) => {
    const streamed = [
      `Yes, this ${mode} response is grounded to section 6z8zty.`,
      '',
      'Manual steps:',
      '',
      '1. Open Conditions.',
      '2. Add the native condition.',
      '3. Save and verify.',
    ].join('\n');
    const terminal = [
      `Yes, this ${mode} response is grounded to section 6z8zty.`,
      'Manual steps:',
      '1. Open Conditions.',
      '2. Add the native condition.',
      '3. Save and verify.',
    ].join('\n');

    const terminalDelta = pixflowRunnerFinalTextDelta(streamed, terminal);
    const rendered = `${streamed}${terminalDelta}`;
    expect(terminalDelta).toBe('');
    expect(rendered.match(/grounded to section 6z8zty/g)).toHaveLength(1);
    expect(rendered.match(/Open Conditions/g)).toHaveLength(1);
  });

});
