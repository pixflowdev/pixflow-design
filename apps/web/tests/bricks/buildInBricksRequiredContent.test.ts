import { describe, expect, it } from 'vitest';
import {
  critiqueBuildInBricksSource,
  evaluateBuildInBricksSourceQualityGate,
} from '../../src/pixflow/build-in-bricks-source-contract';

const validSource = [
  '<main><section><h1>Northstar Atelier</h1>',
  '<p>Spaces shaped for considered living.</p>',
  '<a href="#contact">Discuss a project</a></section></main>',
].join('');

describe('Build in Bricks agent-owned content requirements', () => {
  it('does not derive a blocking content requirement from prompt vocabulary', () => {
    const critique = critiqueBuildInBricksSource(validSource, {
      prompt: 'Create a landing page for a contemporary interior architecture studio.',
      targetTitle: 'Northstar Atelier',
      generationScope: 'full_page',
    });

    expect(critique.findings).not.toContainEqual(expect.objectContaining({
      code: 'missing_required_content',
    }));
  });

  it('does not convert structural nouns into host-selected HTML requirements', () => {
    const qualityGate = evaluateBuildInBricksSourceQualityGate(validSource, {
      prompt: 'Create a page with navigation, pricing, an FAQ and a final CTA.',
      targetTitle: 'Northstar Atelier',
      generationScope: 'full_page',
    });

    expect(qualityGate.evidence.requiredContent).toEqual([]);
    expect(qualityGate.evidence.missingRequiredContent).toEqual([]);
    expect(qualityGate.findings).not.toContainEqual(expect.objectContaining({
      code: 'missing_required_content',
    }));
  });

  it('continues to enforce prompt-independent source safety', () => {
    const critique = critiqueBuildInBricksSource(
      '<main><section><h1>Studio</h1><img src="" alt=""><a>Contact</a></section></main>',
      { prompt: 'anything', targetTitle: 'Studio', generationScope: 'full_page' },
    );

    expect(critique.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_image', severity: 'blocking' }),
      expect.objectContaining({ code: 'invalid_link_target', severity: 'blocking' }),
    ]));
  });
});
