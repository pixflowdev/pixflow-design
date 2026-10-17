import { describe, expect, it } from 'vitest';

import { safeBricksHandoffErrorMessage } from '../../src/pixflow/bricks-handoff-error';

describe('safeBricksHandoffErrorMessage', () => {
  it('replaces the generic WordPress critical-error document with an actionable plain-text message', () => {
    const raw = '<p>There has been a critical error on this website.</p><p><a href="https://wordpress.org/documentation/article/faq-troubleshooting/">Learn more about troubleshooting WordPress.</a></p>';

    expect(safeBricksHandoffErrorMessage(new Error(raw))).toBe(
      'WordPress encountered an internal error while applying the Bricks handoff. Check the site debug log and retry.',
    );
  });

  it('strips markup and decodes entities from useful server messages', () => {
    expect(safeBricksHandoffErrorMessage('<strong>Apply failed:</strong> class &quot;hero&quot; changed.')).toBe(
      'Apply failed: class "hero" changed.',
    );
  });

  it('returns a stable fallback for empty or non-text failures', () => {
    expect(safeBricksHandoffErrorMessage({ reason: 'unknown' })).toBe(
      'The Bricks handoff could not be applied.',
    );
  });
});
