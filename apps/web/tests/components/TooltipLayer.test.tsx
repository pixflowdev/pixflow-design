// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TooltipLayer } from '../../src/components/TooltipLayer';

afterEach(() => cleanup());

describe('TooltipLayer', () => {
  it('uses the shared shadcn tooltip outside contained floating editors', async () => {
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
      const tooltip = await screen.findByRole('tooltip');
      const layer = tooltip.closest('.pixflow-bricks-agent-portal-root')!;
      expect(layer.parentElement).toBe(document.body);
      expect(editor.contains(tooltip)).toBe(false);
      expect(tooltip.getAttribute('data-slot')).toBe('tooltip-content');
      expect((layer as HTMLElement).style.getPropertyValue('--bg-elevated')).toBe('rgb(30, 30, 30)');
      expect(screen.getByRole('button', { name: 'Add context' }).getAttribute('aria-describedby')).toContain(tooltip.id);
    } finally { editor.remove(); }
  });

  it.each(['Design styling', 'Start Codex voice', 'Dictation', 'Annotate page', 'Set panel size SM'])('uses one tooltip for native floating control %s and restores its title', async label => {
    render(<div className="pixflow-bricks-agent-shell"><button title={label}>{label}</button><TooltipLayer /></div>);
    const button = screen.getByRole('button', { name: label });
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.focusIn(button);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.getAttribute('data-slot')).toBe('tooltip-content');
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(button.hasAttribute('title')).toBe(false);
    fireEvent.keyDown(button, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(button.getAttribute('title')).toBe(label);
    expect(button.hasAttribute('aria-describedby')).toBe(false);
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
