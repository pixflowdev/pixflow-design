import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../../src/prompts/system.js';

describe('Build in Bricks source pipeline ownership', () => {
  it('uses a Build-owned entry charter without the Prototype-for-Bricks charter', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'bricks',
        intent: 'pixflow_build_in_bricks_stage_a',
        pixflowBuildInBricksStageA: true,
        skipDiscoveryBrief: true,
      } as any,
      skillName: 'build-in-bricks-html-first',
      skillBody: 'Build skill body',
    });

    expect(prompt).toContain('# Build in Bricks HTML-first source generation');
    expect(prompt).toContain('# Pixflow Build in Bricks source-generation core');
    expect(prompt).not.toContain('# Pixflow Design charter');
    expect(prompt).not.toContain('# Prototype HTML pipeline for Build in Bricks');
    expect(prompt).not.toContain('v0.16.1 slim Prototype HTML charter above is the creative workflow');
  });

  it('does not inherit direction, craft, plugin, stage-atom, or critique authorities', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        intent: 'pixflow_build_in_bricks_stage_a',
        pixflowBuildInBricksStageA: true,
        skipDiscoveryBrief: true,
        platform: 'responsive',
      } as any,
      skillName: 'build-in-bricks-html-first',
      skillBody: 'Build skill body',
      craftBody: '# Anti-AI slop craft that must not be implicitly staged',
      pluginBlock: '# Pixflow Design plugin block that must not be staged',
      activeStageBlocks: ['# Prototype stage atom that must not be staged'],
      critique: { enabled: true } as any,
      critiqueBrand: { name: 'Test', design_md: 'palette' },
      critiqueSkill: { id: 'example-web-prototype' },
    });

    expect(prompt).not.toContain('Anti-AI slop craft that must not be implicitly staged');
    expect(prompt).not.toContain('Pixflow Design plugin block that must not be staged');
    expect(prompt).not.toContain('Prototype stage atom that must not be staged');
    expect(prompt).not.toContain('CRITIQUE_RUN');
    expect(prompt).not.toContain('920px');
  });

  it('does not inject cross-project personal memory into ordinary Build', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'build-in-bricks',
        intent: 'pixflow_build_in_bricks_source',
        pixflowBuildInBricksSource: true,
        skipDiscoveryBrief: true,
      } as any,
      skillName: 'build-in-bricks-html-first',
      skillBody: 'Build skill body',
      memoryBody: 'Prototype Stage A must avoid CSS Grid and build Northline instead.',
    });

    expect(prompt).not.toContain('## Personal memory (auto-extracted from past chats)');
    expect(prompt).not.toContain('build Northline instead');
  });

  it('does not apply Prototype metadata design rules to the Build marker', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        intent: 'pixflow_build_in_bricks_stage_a',
        pixflowBuildInBricksStageA: true,
        skipDiscoveryBrief: true,
      } as any,
    });
    expect(prompt).toContain('translation owner');
    expect(prompt).not.toContain('screen-file-first rule');
    expect(prompt).not.toContain('product-realism rule');
    expect(prompt).not.toContain('visual-system rule');
  });

  it('keeps the historical marker on the compatibility path', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        intent: 'pixflow_prototype_bricks_stage_a',
        pixflowPrototypeBricksStageA: true,
        skipDiscoveryBrief: true,
      } as any,
    });

    expect(prompt).toContain('# Prototype HTML pipeline for Build in Bricks');
  });
});
