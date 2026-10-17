// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceBridgeStatus } from '../../src/components/WorkspaceBridgeStatus';

vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => key }));
const host = window as Window & { pixflowDesignBridgeStatus?: unknown; PixflowDesignFloatingPanel?: unknown };
afterEach(() => { cleanup(); delete host.pixflowDesignBridgeStatus; delete host.PixflowDesignFloatingPanel; });

it('only offers recovery while disconnected and reacts immediately to connection changes', () => {
  host.pixflowDesignBridgeStatus = { checked: true, running: true };
  render(<WorkspaceBridgeStatus />);
  expect(screen.queryByRole('button')).toBeNull();
  act(() => { window.dispatchEvent(new CustomEvent('pixflow-design:bridge-status', { detail: { checked: true, running: false } })); });
  const reconnect = screen.getByRole('button', { name: 'ui.xaiOAuthControl.reconnect' });
  const request = vi.fn();
  window.addEventListener('pixflow-design:bridge-reconnect-request', request);
  fireEvent.click(reconnect);
  expect(request).toHaveBeenCalledOnce();
  act(() => { window.dispatchEvent(new CustomEvent('pixflow-design:bridge-status', { detail: { checked: true, running: true } })); });
  expect(screen.queryByRole('button')).toBeNull();
  window.removeEventListener('pixflow-design:bridge-reconnect-request', request);
});

it('uses the floating panel connection-driven action visibility instead of forcing Reconnect', () => {
  const destroy = vi.fn();
  const factory = vi.fn((options: { showReconnect?: boolean }) => {
    const control = Object.assign(document.createElement('div'), { destroy });
    if (options.showReconnect) { const action = document.createElement('button'); action.textContent = 'Reconnect'; control.append(action); }
    return control;
  });
  host.PixflowDesignFloatingPanel = { createBridgeStatusControl: factory };
  const view = render(<WorkspaceBridgeStatus />);
  expect(factory).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
  view.unmount(); expect(destroy).toHaveBeenCalledOnce();
});
