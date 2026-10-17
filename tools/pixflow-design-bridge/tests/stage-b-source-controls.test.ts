import { describe, expect, it } from 'vitest';

import {
  collectStageBSourceControlRules,
  countStageBSourceFormNonLinkButtons,
} from '../stage-b-source-controls.mjs';

describe('Stage B source control detection', () => {
  it('does not mistake styled tabs or CTA buttons for missing Bricks form fields', () => {
    const rules = [
      { selector: '.workflow-tabs button', declarations: { display: 'flex', background: 'transparent' } },
      { selector: '.cta-button', declarations: { padding: '1rem', border: '1px solid' } },
      { selector: '.field-label', declarations: { display: 'block', color: 'var(--muted)' } },
    ];

    expect(collectStageBSourceControlRules(rules)).toEqual([]);
  });

  it('still detects real native value-entry controls', () => {
    const inputRule = { selector: '.contact-form input', declarations: { width: '100%', padding: '1rem' } };
    const textareaRule = { selector: '.contact-form textarea', declarations: { minHeight: '8rem', border: '1px solid' } };

    expect(collectStageBSourceControlRules([inputRule, textareaRule])).toEqual([inputRule, textareaRule]);
  });

  it('excludes form submit/reset buttons from source link-affordance parity', () => {
    const html = `
      <form>
        <button>Send</button>
        <button type="submit">Book call</button>
        <button type="reset">Clear</button>
        <button type="button">Open options</button>
      </form>
      <button type="button">Open dialog</button>
    `;

    expect(countStageBSourceFormNonLinkButtons(html)).toBe(3);
  });
});
