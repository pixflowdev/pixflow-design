import { describe, expect, it } from 'vitest';

import {
  hasDurableRunnerArtifactCompletion,
  shouldRejectRunnerFailureAfterArtifact,
} from '../stage-runner-completion.mjs';

describe('Stage runner artifact completion', () => {
  it('keeps a completed artifact authoritative when watchdog shutdown emits a failure event', () => {
    const state = { completedViaFile: true, completionFileExists: true };

    expect(hasDurableRunnerArtifactCompletion(state)).toBe(true);
    expect(shouldRejectRunnerFailureAfterArtifact(state)).toBe(false);
  });

  it('keeps changed completion artifacts authoritative when the runner exits before the quiet watchdog', () => {
    const state = {
      completedViaFile: false,
      completionFileExists: true,
      completionArtifactsUpdated: true,
    };

    expect(hasDurableRunnerArtifactCompletion(state)).toBe(true);
    expect(shouldRejectRunnerFailureAfterArtifact(state)).toBe(false);
  });

  it.each([
    { completedViaFile: false, completionFileExists: true, completionArtifactsUpdated: false },
    { completedViaFile: true, completionFileExists: false },
    { completedViaFile: false, completionFileExists: false },
  ])('still rejects genuine runner failures without durable completion: %o', (state) => {
    expect(hasDurableRunnerArtifactCompletion(state)).toBe(false);
    expect(shouldRejectRunnerFailureAfterArtifact(state)).toBe(true);
  });
});
