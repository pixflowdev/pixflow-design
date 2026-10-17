// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FLOATING_PANEL_MEMORY_COMMAND_EVENT,
  FLOATING_PANEL_MEMORY_SETTINGS_STORAGE_KEY,
  FloatingPanelMemorySettings,
  type FloatingPanelMemoryCommandDetail,
} from '../../src/components/FloatingPanelMemorySettings';

const originalFetch = globalThis.fetch;

describe('FloatingPanelMemorySettings', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('uses browser-only settings without calling the Personal Memory API', () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    const postMessage = vi.spyOn(window, 'postMessage');
    const commands: FloatingPanelMemoryCommandDetail[] = [];
    const onCommand = (event: Event) => {
      commands.push((event as CustomEvent<FloatingPanelMemoryCommandDetail>).detail);
    };
    window.addEventListener(FLOATING_PANEL_MEMORY_COMMAND_EVENT, onCommand);

    render(<FloatingPanelMemorySettings />);

    expect(
      (screen.getByRole('radio', { name: /Restore after reload/i }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Session only/i }));
    fireEvent.click(screen.getByRole('radio', { name: /Restore after reload/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear current context' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear browser context' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'pixflow-design',
        type: FLOATING_PANEL_MEMORY_COMMAND_EVENT,
      }),
      '*',
    );
    expect(
      commands.map((detail) => detail.command),
    ).toEqual([
      'settings_changed',
      'settings_changed',
      'clear_current_context',
      'clear_local_history',
    ]);
    expect(commands[1]?.settings.retention).toBe('restore_after_reload');
    expect(
      JSON.parse(
        window.localStorage.getItem(FLOATING_PANEL_MEMORY_SETTINGS_STORAGE_KEY) || '{}',
      ),
    ).toEqual({ version: 1, retention: 'restore_after_reload' });

    window.removeEventListener(FLOATING_PANEL_MEMORY_COMMAND_EVENT, onCommand);
  });

  it('restores the locally selected retention mode without changing hard caps', () => {
    window.localStorage.setItem(
      FLOATING_PANEL_MEMORY_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, retention: 'on_device' }),
    );

    render(<FloatingPanelMemorySettings />);

    expect(
      (screen.getByRole('radio', { name: /On this device/i }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.getByText(/Up to 24 recent messages and 32 grounded facts/i)).toBeTruthy();
    expect(screen.getByText(/Your complete chat history is saved separately/)).toBeTruthy();
  });
});
