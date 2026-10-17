import { describe, expect, it } from 'vitest';

import {
  renderStageAAnsweredFormOverride,
  renderStageABricksSlimCharter,
} from '../stage-a-charter.mjs';

describe('floating-panel Stage A creative charter', () => {
  it('keeps Prototype HTML creative freedom and delegates Bricks translation to the converter', () => {
    const prompt = renderStageABricksSlimCharter();

    expect(prompt).toContain('HTML is the compiler source, not the creative ceiling');
    expect(prompt).toContain('When the user asks for a page, build the complete page, not one section');
    expect(prompt).toContain('Do not create a site header or footer unless the user explicitly requests one');
    expect(prompt).toContain("Preserve the Prototype HTML preset's class vocabulary");
    expect(prompt).not.toContain('Use semantic BEM classes');
    expect(prompt).toContain('The converter owns framework-variable mapping');
    expect(prompt).not.toContain('Use Flexbox and nested Flexbox for layout');
    expect(prompt).toContain('normal standards-based HTML, CSS, and optional JavaScript');
    expect(prompt).not.toContain('Do not use CSS Grid');
    expect(prompt).toContain('Do not inspect an active framework route');
    expect(prompt).not.toContain('composition-dna.md');
    expect(prompt).toContain('one bounded self-check at the end');
    expect(prompt).toContain('Keep the returned remote stock image URL in the HTML');
    expect(prompt).toContain('do not download it into the Stage A workspace');
    expect(prompt).not.toContain('od-v010');
    expect(prompt).toContain('Do not run repeated screenshot, critique, or repair loops');
  });

  it('continues directly to filesystem artifacts after form answers', () => {
    const prompt = renderStageAAnsweredFormOverride('discovery');

    expect(prompt).toContain('Form already answered — build now');
    expect(prompt).toContain('complete `index.html`');
    expect(prompt).not.toContain('composition-dna.md');
    expect(prompt).not.toContain('<artifact>');
    expect(prompt).not.toContain('RULE 3');
  });
});
