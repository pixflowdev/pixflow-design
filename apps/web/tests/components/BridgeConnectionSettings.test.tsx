// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BridgeConnectionSettings, BridgeCliSettings } from '../../src/components/BridgeConnectionSettings';

afterEach(() => { cleanup(); delete (window as any).pixflowDesignBridgeStatus; });
it('reads a connection published between render and subscription', () => {
  (window as any).pixflowDesignBridgeStatus = { state: 'checking' };
  const add = window.addEventListener.bind(window);
  const spy = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'pixflow-design:bridge-status') (window as any).pixflowDesignBridgeStatus = { state: 'connected', running: true };
    add(type, listener, options);
  });
  try {
    render(<BridgeCliSettings embedded><button>Test CLI</button></BridgeCliSettings>);
    expect(screen.getByRole('button', { name: 'Test CLI' })).toBeTruthy();
  } finally { spy.mockRestore(); }
});
it('hides cached CLI actions until the host is connected, without changing the selection', () => {
  (window as any).pixflowDesignBridgeStatus = { checked: true, state: 'disconnected' };
  const config = { agentId: 'codex', model: 'saved-model' };
  render(<BridgeCliSettings embedded><button>Test {config.agentId}</button></BridgeCliSettings>);
  expect(screen.queryByRole('button', { name: 'Test codex' })).toBeNull();
  status({ checked: true, running: true, state: 'connected' });
  expect(screen.getByRole('button', { name: 'Test codex' })).toBeTruthy();
  for (const payload of [{ state: 'checking' }, { state: 'update', running: true }, { checked: true, running: true, siteMismatch: true }, { checked: true, running: false }]) {
    status(payload);
    expect(screen.queryByRole('button', { name: 'Test codex' })).toBeNull();
  }
  expect(config).toEqual({ agentId: 'codex', model: 'saved-model' });
});
it('does not require the WordPress Bridge for standalone runtime settings', () => {
  render(<BridgeCliSettings embedded={false}><button>Test CLI</button></BridgeCliSettings>);
  expect(screen.getByRole('button', { name: 'Test CLI' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Connect bridge' })).toBeNull();
});
function status(payload: object) {
  act(() => { window.dispatchEvent(new CustomEvent('pixflow-design:bridge-status', { detail: payload })); });
}
it('connects through the shared host event and follows checking, success and reconnect states', () => {
  (window as any).pixflowDesignBridgeStatus = { checked: true, state: 'missing' };
  const request = vi.fn();
  window.addEventListener('pixflow-design:bridge-reconnect-request', request);
  render(<BridgeConnectionSettings />);
  expect(screen.getByRole('link', { name: 'Download Pixflow Design Bridge' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Connect bridge' }));
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]?.[0].detail.source).toBe('execution-settings');
  status({ state: 'checking' });
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  status({ state: 'connected', running: true });
  expect(screen.getByText('Bridge connected')).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
  expect(request).toHaveBeenCalledTimes(2);
  status({ state: 'disconnected', error: 'Bridge pairing failed. Try again.' });
  expect(screen.getByRole('alert').textContent).toContain('Bridge pairing failed');
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  window.removeEventListener('pixflow-design:bridge-reconnect-request', request);
});
it('reports another site and offers recovery without requiring a Pro licence', () => {
  (window as any).pixflowDesignBridgeStatus = { checked: true, running: true, siteMismatch: true };
  render(<BridgeConnectionSettings />);
  expect(screen.getByText('Bridge connected to another site')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy();
});
it('shows only verified routes and updates when the transport changes', () => {
  (window as any).pixflowDesignBridgeStatus = { state: 'connected', connectionRoute: 'chrome-extension' };
  render(<BridgeConnectionSettings />);
  expect(screen.getByRole('status').textContent).toBe('Bridge connected via Chrome extension');
  status({ state: 'connected', connectionRoute: 'direct' });
  expect(screen.getByRole('status').textContent).toBe('Bridge connected directly');
  status({ state: 'connected' });
  expect(screen.getByRole('status').textContent).toBe('Bridge connected');
  status({ state: 'checking', connectionRoute: 'chrome-extension' });
  expect(screen.getByRole('status').textContent).not.toContain('via Chrome extension');
});
