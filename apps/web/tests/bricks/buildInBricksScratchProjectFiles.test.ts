// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

import { listBuildInBricksScratchProjectIds } from '../../src/pixflow/build-in-bricks-scratch-project-files';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Build in Bricks scratch project catalogue', () => {
  it('reads the complete Bridge catalogue and keeps only canonical Build projects', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      projects: [
        { id: 'full-page-owner', metadata: { kind: 'build-in-bricks' } },
        { id: 'source-contract-owner', metadata: { kind: 'other', sourceContract: 'build-in-bricks-html-first' } },
        { id: 'legacy-build-owner', metadata: { kind: 'other', pixflowBuildInBricksSource: true } },
        { id: 'prototype-project', metadata: { kind: 'prototype' } },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listBuildInBricksScratchProjectIds()).resolves.toEqual([
      'full-page-owner',
      'source-contract-owner',
      'legacy-build-owner',
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/api/projects', { cache: 'no-store' });
  });
});
