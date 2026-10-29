// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ClaudeSignIn } from '../../src/components/ClaudeSignIn';
import { I18nProvider } from '../../src/i18n';
import { claudeSignInRequest } from '../../src/providers/daemon';
vi.mock('../../src/providers/daemon', () => ({ claudeSignInRequest: vi.fn() }));
const request = vi.mocked(claudeSignInRequest);
beforeEach(() => { vi.useFakeTimers(); request.mockReset(); request.mockResolvedValue({ state: 'idle', source: null }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function mount() {
  const connected = vi.fn();
  await act(async () => { render(<I18nProvider initial="en"><ClaudeSignIn onConnected={connected} /></I18nProvider>); });
  return connected;
}
test('opens official sign-in and refreshes once only after verified completion', async () => {
  const connected = await mount();
  request.mockResolvedValueOnce({ state: 'waiting', source: 'desktop' });
  await act(async () => { fireEvent.click(screen.getByText('Sign in with Claude')); });
  expect(screen.getByText('Waiting for sign-in…')).toBeTruthy();
  expect(connected).not.toHaveBeenCalled();
  request.mockResolvedValue({ state: 'connected', source: 'desktop' });
  await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
  expect(connected).toHaveBeenCalledTimes(1); expect(screen.getByText('Signed in')).toBeTruthy();
});
test('restores pending sign-in after settings reopen and allows cancellation', async () => {
  request.mockResolvedValue({ state: 'waiting', source: 'cli' }); await mount();
  request.mockResolvedValue({ state: 'cancelled', source: 'cli' });
  await act(async () => { fireEvent.click(screen.getByText('Cancel')); });
  expect(request).toHaveBeenCalledWith('cancel'); expect(screen.getByText('Sign in with Claude')).toBeTruthy();
});
test('connection failure remains retryable without changing settings', async () => {
  await mount(); request.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { fireEvent.click(screen.getByText('Sign in with Claude')); });
  expect(screen.getByRole('alert').textContent).toContain('Check Bridge');
  request.mockResolvedValue({ state: 'waiting', source: 'desktop' });
  await act(async () => { fireEvent.click(screen.getByText('Sign in with Claude')); });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('Waiting for sign-in…')).toBeTruthy();
});
