// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PixflowGateModalBackdrop } from '../../src/components/PixflowGateModalBackdrop';

describe('PixflowGateModalBackdrop', () => {
  afterEach(cleanup);

  it('owns a portal theme scope and follows explicit theme changes', () => {
    const view = render(
      <PixflowGateModalBackdrop theme="dark">
        <div role="dialog">Resources</div>
      </PixflowGateModalBackdrop>,
    );

    const backdrop = screen.getByRole('presentation');
    expect(backdrop.classList.contains('pixflow-design-portal-scope')).toBe(true);
    expect(backdrop.getAttribute('data-theme')).toBe('dark');

    view.rerender(
      <PixflowGateModalBackdrop theme="light">
        <div role="dialog">Resources</div>
      </PixflowGateModalBackdrop>,
    );
    expect(backdrop.getAttribute('data-theme')).toBe('light');
  });
});

