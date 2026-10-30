// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TooltipLayer } from '../../src/components/TooltipLayer';

afterEach(() => cleanup());

describe('TooltipLayer', () => {
  it('portals viewport-positioned tooltips into an isolated themed layer outside contained editors', () => {
    const editor = document.createElement('div');
    editor.className = 'workspace-shell pixflow-bricks-agent-shell';
    editor.style.contain = 'layout paint';
    editor.style.transform = 'translateY(20px)';
    editor.style.zIndex = '100090';
    editor.style.setProperty('--bg-elevated', 'rgb(30, 30, 30)');
    document.body.appendChild(editor);
    try {
      render(<><button className="od-tooltip" data-tooltip="Add context">Add context</button><TooltipLayer /></>, { container: editor });
      fireEvent.pointerOver(screen.getByRole('button', { name: 'Add context' }));
      const tooltip = screen.getByRole('tooltip');
      const layer = tooltip.parentElement!;
      expect(layer.parentElement).toBe(document.body);
      expect(layer.classList.contains('pixflow-design-portal-scope')).toBe(true);
      expect(layer.style.position).toBe('fixed');
      expect(layer.style.contain).toContain('paint');
      expect(Number(layer.style.zIndex)).toBeGreaterThan(100090);
      expect(layer.style.getPropertyValue('--bg-elevated')).toBe('rgb(30, 30, 30)');
    } finally { editor.remove(); }
  });

  it('dismisses a hovered icon tooltip when the icon is activated', () => {
    render(
      <>
        <button
          type="button"
          className="od-tooltip"
          data-tooltip="Settings"
          title="Settings"
        >
          Settings
        </button>
        <TooltipLayer />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Settings' });
    fireEvent.pointerOver(button);

    expect(screen.getByRole('tooltip').textContent).toBe('Settings');

    fireEvent.pointerDown(button);
    fireEvent.focusIn(button);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('dismisses a tooltip when the trigger expands under the pointer', async () => {
    function ExpandingTrigger() {
      const [open, setOpen] = useState(false);
      return (
        <button
          type="button"
          className="od-tooltip"
          data-tooltip="Design Agent mode"
          title="Design Agent mode"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          Design Agent
        </button>
      );
    }

    render(
      <>
        <ExpandingTrigger />
        <TooltipLayer />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Design Agent' });
    fireEvent.pointerOver(button);
    expect(screen.getByRole('tooltip').textContent).toBe('Design Agent mode');

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });
});
