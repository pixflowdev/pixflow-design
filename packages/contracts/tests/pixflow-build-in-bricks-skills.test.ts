import { describe, expect, it } from 'vitest';

import {
  PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
  resolvePixflowBuildInBricksSkillManifest,
  validatePixflowBuildInBricksSkillManifest,
  type PixflowBuildInBricksSkillManifest,
} from '../src/api/pixflow-build-in-bricks-skills.js';

describe('Build in Bricks skill manifest', () => {
  it('is a deterministic closed Build-owned catalogue', () => {
    const resolution = resolvePixflowBuildInBricksSkillManifest([
      'website-clone',
      'prototype-poison-hero-design',
      'html-to-bricks',
      'bricks-operation-html-to-bricks-stage-a',
    ]);

    expect(resolution.manifest).toEqual(PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST);
    expect(resolution.approvedSkillIds).toEqual(['build-in-bricks-html-first']);
    expect(resolution.rejectedSkillIds).toEqual([
      'website-clone',
      'prototype-poison-hero-design',
      'html-to-bricks',
      'bricks-operation-html-to-bricks-stage-a',
    ]);
    expect(resolution.manifest.skills.map((skill) => [skill.order, skill.id])).toEqual([
      [1, 'build-in-bricks-html-first'],
    ]);
  });

  it('allows representation-neutral shared knowledge only when explicitly audited', () => {
    const manifest: PixflowBuildInBricksSkillManifest = {
      ...PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
      skills: [
        ...PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST.skills,
        {
          id: 'shared-web-accessibility',
          owner: 'shared-web',
          classification: 'audited-representation-neutral',
          order: 2,
          sourcePath: 'wordpress/resources/mcp-skills/shared-web-accessibility.md',
          revision: '1.0.0',
          contentFingerprint: `sha256:${'a'.repeat(64)}`,
        },
      ],
    };

    expect(validatePixflowBuildInBricksSkillManifest(manifest)).toBe(manifest);
    expect(() => validatePixflowBuildInBricksSkillManifest({
      ...manifest,
      skills: manifest.skills.map((skill) => skill.id === 'shared-web-accessibility'
        ? { ...skill, owner: 'build-in-bricks', classification: 'audited-representation-neutral' }
        : skill),
    })).toThrow(/inconsistent ownership/i);
  });

  it('rejects duplicate, unordered, and non-fingerprinted manifests', () => {
    const entry = PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST.skills[0]!;
    expect(() => validatePixflowBuildInBricksSkillManifest({
      ...PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
      skills: [entry, { ...entry }],
    })).toThrow(/duplicate/i);
    expect(() => validatePixflowBuildInBricksSkillManifest({
      ...PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
      skills: [{ ...entry, contentFingerprint: 'caller-supplied' }],
    })).toThrow(/fingerprint/i);
    expect(() => validatePixflowBuildInBricksSkillManifest({
      ...PIXFLOW_BUILD_IN_BRICKS_SKILL_MANIFEST,
      skills: [{ ...entry, order: 0 }],
    })).toThrow(/order/i);
  });
});
