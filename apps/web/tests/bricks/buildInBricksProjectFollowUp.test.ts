import { describe, expect, it, vi } from 'vitest';
import {
  dispatchBuildInBricksRetainedFollowUp,
  isCanonicalBuildInBricksSourceProject,
} from '../../src/pixflow/build-in-bricks-project-follow-up';

const buildProject = {
  id: 'b23157c6-6301-4dbb-a7e7-21d0a086c92e',
  metadata: {
    kind: 'build-in-bricks',
    intent: 'pixflow_build_in_bricks_source',
    pixflowBuildInBricksSource: true,
    pixflowPipeline: 'build-in-bricks',
    sourceContract: 'build-in-bricks-html-first',
  },
};

describe('canonical Build project follow-up routing', () => {
  it('recognizes only canonical Build source ownership', () => {
    expect(isCanonicalBuildInBricksSourceProject(buildProject)).toBe(true);
    expect(isCanonicalBuildInBricksSourceProject({
      id: 'prototype-project',
      metadata: { intent: 'pixflow_bricks_native_prototype', pixflowBricksNativePrototype: true },
    })).toBe(false);
    expect(isCanonicalBuildInBricksSourceProject({
      id: 'clone-project',
      metadata: { intent: 'website_clone', pixflowPipeline: 'website-clone' },
    })).toBe(false);
  });

  it('routes a retained follow-up back through the canonical builder pipeline', async () => {
    const postMessage = vi.fn();
    const result = await dispatchBuildInBricksRetainedFollowUp({
      project: buildProject,
      prompt: 'Change only the closing CTA button label.',
      targetPostId: 3805,
      readSourceIndex: async () => JSON.stringify({
        schema: 'pixflow.build_in_bricks.source_index.v1',
        entries: [{
          projectId: buildProject.id,
          targetPostId: 3805,
          scope: 'full_page',
          status: 'active',
          updatedAt: '2026-08-21T22:35:27.465Z',
        }],
      }),
      postMessage,
      createRequestId: () => 'retained-follow-up-1',
    });

    expect(result).toEqual({ handled: true, dispatched: true, scope: 'full_page' });
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      source: 'pixflow-design',
      type: 'pixflow-design:send-bricks-agent-prompt',
      reason: 'build-in-bricks-retained-source-edit',
      prompt: 'Change only the closing CTA button label.',
      patch: expect.objectContaining({
        projectId: buildProject.id,
        generationScope: 'full_page',
        promptSkillIds: ['build-in-bricks-html-first'],
        semanticPreflightResolved: true,
        externalRequestId: 'retained-follow-up-1',
        continuation: expect.objectContaining({
          retryLifecycle: 'retained_source_edit',
        }),
        intentContract: expect.objectContaining({
          intent: 'build_in_bricks',
          scope: 'full_page',
        }),
      }),
    }));
  });

  it('blocks an unsafe fallback when the retained source index is absent or belongs to another page', async () => {
    const postMessage = vi.fn();
    const missing = await dispatchBuildInBricksRetainedFollowUp({
      project: buildProject,
      prompt: 'Change the CTA.',
      targetPostId: 3805,
      readSourceIndex: async () => JSON.stringify({
        schema: 'pixflow.build_in_bricks.source_index.v1',
        entries: [{
          projectId: buildProject.id,
          targetPostId: 999,
          scope: 'section',
          status: 'active',
        }],
      }),
      postMessage,
    });

    expect(missing.handled).toBe(true);
    expect(missing).toEqual(expect.objectContaining({ dispatched: false }));
    if (!missing.handled || missing.dispatched) throw new Error('Expected retained Build reconciliation to block.');
    expect(missing.error).toContain('current Bricks page');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('does not intercept non-Build projects', async () => {
    const postMessage = vi.fn();
    const result = await dispatchBuildInBricksRetainedFollowUp({
      project: { id: 'regular-project', metadata: { kind: 'prototype' } },
      prompt: 'Continue.',
      targetPostId: 3805,
      readSourceIndex: async () => '',
      postMessage,
    });

    expect(result).toEqual({ handled: false });
    expect(postMessage).not.toHaveBeenCalled();
  });
});
