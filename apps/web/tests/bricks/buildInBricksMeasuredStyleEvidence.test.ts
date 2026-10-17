import { describe, expect, it } from 'vitest';

import {
  BRICKS_MEASURED_STYLE_OWNERSHIP_EVIDENCE_FILE,
  extractBricksMeasuredStyleOwnershipEvidence,
} from '../../src/pixflow/bricks-initial-insert';

describe('Build in Bricks measured-style ownership evidence', () => {
  it('projects the converter-owned diagnostic into the canonical handoff evidence path', () => {
    const projection = {
      measuredStyleOwnership: 'authored_source',
      policy: 'ordinary Build projects only source-authored properties',
      projectedElementCount: 12,
      provenance: [{ bricksElementId: 'h1', skippedEnvironmentOwnedProperties: ['font-family', 'font-size'] }],
    };

    expect(BRICKS_MEASURED_STYLE_OWNERSHIP_EVIDENCE_FILE).toBe('bricks-measured-style-ownership.json');
    expect(extractBricksMeasuredStyleOwnershipEvidence({
      diagnostics: { measuredSourceProjection: projection },
    })).toBe(projection);
  });

  it('does not invent ownership evidence when the converter did not emit it', () => {
    expect(extractBricksMeasuredStyleOwnershipEvidence({ diagnostics: {} })).toEqual({});
    expect(extractBricksMeasuredStyleOwnershipEvidence({})).toEqual({});
  });
});
