import { beforeEach, describe, expect, it, vi } from 'vitest';

import { writeProjectTextFiles } from '../../src/providers/registry';
import { writeBuildInBricksScratchProjectTextFiles } from '../../src/pixflow/build-in-bricks-scratch-project-files';
import { persistBricksHandoffArtifacts } from '../../src/pixflow/bricks-initial-insert';

vi.mock('../../src/providers/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/registry')>();
  return {
    ...actual,
    writeProjectTextFiles: vi.fn(),
  };
});

vi.mock('../../src/pixflow/build-in-bricks-scratch-project-files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/pixflow/build-in-bricks-scratch-project-files')>();
  return {
    ...actual,
    writeBuildInBricksScratchProjectTextFiles: vi.fn(),
  };
});

const genericWriteMock = vi.mocked(writeProjectTextFiles);
const scratchWriteMock = vi.mocked(writeBuildInBricksScratchProjectTextFiles);

const artifacts = {
  files: [],
  json: {},
  text: {},
};

const sourceFile = {
  name: 'index.html',
  path: 'build-source/compiled/index.html',
  kind: 'text',
  mime: 'text/html',
  artifactKind: 'build_source',
  size: 64,
  mtime: 1,
  title: 'Build source',
  identifier: 'build-source',
};

describe('Build in Bricks handoff artifact persistence', () => {
  beforeEach(() => {
    genericWriteMock.mockReset();
    scratchWriteMock.mockReset();
    genericWriteMock.mockResolvedValue({ ok: true, files: [] });
    scratchWriteMock.mockResolvedValue({ ok: true });
  });

  it('persists canonical Build handoff evidence into the daemon-owned scratch project', async () => {
    const result = await persistBricksHandoffArtifacts(
      'build-project',
      {
        diagnostics: {
          measuredSourceProjection: {
            measuredStyleOwnership: 'authored_source',
          },
        },
        content: [],
        global_classes: [],
      },
      artifacts,
      sourceFile,
      {},
      null,
      true,
    );

    expect(result.files).toContain(
      `pixflow/handoffs/bricks/${result.handoffId}/bricks-measured-style-ownership.json`,
    );
    expect(scratchWriteMock).toHaveBeenCalled();
    expect(genericWriteMock).not.toHaveBeenCalled();

    const written = scratchWriteMock.mock.calls.flatMap(([, files]) => files);
    const ownership = written.find((file) => file.name.endsWith('/bricks-measured-style-ownership.json'));
    expect(JSON.parse(ownership?.content || '{}')).toEqual({
      measuredStyleOwnership: 'authored_source',
    });
  });

  it('preserves the historical generic project transport for non-Build compatibility flows', async () => {
    await persistBricksHandoffArtifacts(
      'compat-project',
      { content: [], global_classes: [] },
      artifacts,
      sourceFile,
      {},
      null,
      false,
    );

    expect(genericWriteMock).toHaveBeenCalled();
    expect(scratchWriteMock).not.toHaveBeenCalled();
  });
});
