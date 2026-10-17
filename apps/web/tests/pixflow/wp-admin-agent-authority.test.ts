import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  normalizeWpAdminPreflightDecision,
  type WpAdminSemanticPreflightInput,
} from '../../src/pixflow/wp-admin-semantic-preflight';

const semanticSource = readFileSync(new URL('../../src/pixflow/wp-admin-semantic-preflight.ts', import.meta.url), 'utf8');
const groundingSource = readFileSync(new URL('../../src/pixflow/wp-admin-gutenberg-grounding.ts', import.meta.url), 'utf8');
const frameSource = readFileSync(new URL('../../src/pixflow/WpAdminAgentFrameApp.tsx', import.meta.url), 'utf8');

function input(prompt: string): WpAdminSemanticPreflightInput {
  return {
    prompt,
    mode: 'design',
    context: { resource: { kind: 'post', id: 54, postType: 'post' } },
    families: [{
      id: 'wordpress-core',
      label: 'WordPress Core',
      description: 'Typed core operations.',
      integrationId: 'wordpress',
      available: true,
      capabilityCount: 1,
      linkedSkillIds: [],
      capabilities: [{
        id: 'pixflow/wp-admin/update-post',
        label: 'Update post metadata',
        risk: 'reversible_write',
        allowedModes: ['design'],
      }],
    }],
    mentions: [],
    skills: [],
    agentId: 'codex',
    conversationId: 'authority-test',
    signal: new AbortController().signal,
    research: { available: true, providers: ['duckduckgo'], groundingRound: 0 },
  } as WpAdminSemanticPreflightInput;
}

const typedDecision = {
  state: 'ready',
  intent: 'update_post_metadata',
  mode: 'design',
  target: { kind: 'post', id: 54, postType: 'post', taxonomy: null },
  integrationIds: ['wordpress'],
  skillIds: [],
  capabilityIds: ['pixflow/wp-admin/update-post'],
  proposedActions: [{
    capabilityId: 'pixflow/wp-admin/update-post',
    arguments: { postId: 54, fields: { title: 'Summer Offers' } },
  }],
  proposedResearch: [{ query: 'official WordPress route guidance', domains: ['developer.wordpress.org'] }],
  riskCeiling: 'reversible_write',
  readOnly: false,
  answerOnly: false,
  clarification: null,
  confidence: 0.98,
  rationale: 'The selected action is explicit and target-bound.',
  unresolvedChoices: [],
  contentMutationIntent: 'preserve',
};

describe('WP Admin agent semantic authority', () => {
  it('does not retain production prompt-word routers or prompt-derived mutation validators', () => {
    const forbiddenSymbols = [
      'CONTENT_AWARE_WORDING',
      'isExplicitWpAdminReadOnlyRequest',
      'wpAdminCodeStatusIntegrationSlug',
      'wpAdminCodeMutationSafetyNotice',
      'wpAdminRequestedContentMutationIntent',
      'wpAdminContradictoryRequestIssue',
      'wpAdminExplicitGutenbergMutationRequested',
      'rerouteWpAdminPreserveContentMetadataDecision',
      'wpAdminComplexAcfBatchIssue',
      'wpAdminSourceInformedCodeIssue',
      'wpAdminContentAwareRequest',
      'wpAdminDuplicateSectionClarification',
      'wpCodeBox2UnavailableNotice',
      'sourceEvidenceRequired',
      'explicitPattern',
    ];
    for (const symbol of forbiddenSymbols) {
      expect(`${semanticSource}\n${groundingSource}\n${frameSource}`).not.toContain(symbol);
    }
    expect(semanticSource).not.toMatch(/prompt\.match\s*\(/);
    expect(semanticSource).not.toMatch(/\.test\s*\(\s*prompt\s*\)/);
    expect(groundingSource).not.toMatch(/\.test\s*\(\s*(?:prompt|cleanPrompt)\s*\)/);
  });

  it('preserves explicit cross-object provenance only when the agent supplied the typed field', () => {
    const explicit = normalizeWpAdminPreflightDecision({
      ...typedDecision,
      target: { kind: 'post', id: 42, postType: 'post', taxonomy: null },
      targetProvenance: 'explicit_user_target',
      proposedActions: [{
        capabilityId: 'pixflow/wp-admin/update-post',
        arguments: { postId: 42, fields: { title: 'Explicit target' } },
      }],
    }, input('Whatever the user happened to type.'));
    expect(explicit.targetProvenance).toBe('explicit_user_target');

    const implicit = normalizeWpAdminPreflightDecision(typedDecision, input('Post ID 42'));
    expect(implicit.targetProvenance).toBe('active_context_target');
  });

  it('normalizes identical agent decisions identically regardless of user vocabulary', () => {
    const first = normalizeWpAdminPreflightDecision(typedDecision, input('Make this live and check the latest docs.'));
    const second = normalizeWpAdminPreflightDecision(typedDecision, input("Don't publish anything and don't search online."));
    expect(first).toEqual(second);
    expect(first.proposedActions?.map((action) => action.capabilityId)).toEqual(['pixflow/wp-admin/update-post']);
    expect(first.proposedResearch?.map((research) => research.query)).toEqual(['official WordPress route guidance']);
  });

  it('does not add research when the agent decision did not select it, even when the prompt names research nouns', () => {
    const withoutResearch = { ...typedDecision, proposedResearch: [] };
    const decision = normalizeWpAdminPreflightDecision(
      withoutResearch,
      input('Research the latest plugin documentation for this blog article.'),
    );
    expect(decision.proposedResearch).toEqual([]);
  });
});
