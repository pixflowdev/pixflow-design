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
async function mount(authenticated = false) {
  const connected = vi.fn();
  await act(async () => { render(<I18nProvider initial="en"><ClaudeSignIn authenticated={authenticated} onConnected={connected} /></I18nProvider>); });
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
  expect(connected).toHaveBeenCalledTimes(1); expect(screen.getByText('Sign in again')).toBeTruthy();
});

test('keeps a reauthentication action available when discovery reports authenticated', async () => {
  await mount(true);
  expect(screen.getByRole('button',{name:'Sign in again'})).toBeTruthy();
});

test('a completed earlier login does not remove the option to sign in again', async () => {
  request.mockResolvedValue({state:'connected',source:'desktop'});
  await mount();
  const button=screen.getByRole('button',{name:'Sign in again'}) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  request.mockResolvedValueOnce({state:'waiting',source:'desktop',attemptId:'new'});
  await act(async()=>{fireEvent.click(button);});
  expect(request).toHaveBeenCalledWith('start');
});

test('a delayed initial status cannot replace a newly started attempt', async () => {
  let finish!: (value: {state:'connected';source:'desktop'}) => void;
  request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const connected=await mount();
  request.mockResolvedValueOnce({state:'waiting',source:'desktop',attemptId:'new'});
  await act(async()=>{fireEvent.click(screen.getByText('Sign in with Claude'));});
  await act(async()=>{finish({state:'connected',source:'desktop'});});
  expect(screen.getByText('Waiting for sign-in…')).toBeTruthy();
  expect(connected).not.toHaveBeenCalled();
});

test('permission refusal ends status recovery without retrying or changing settings', async () => {
  request.mockResolvedValue({state:'waiting',source:'desktop',attemptId:'owned'});
  await mount();
  request.mockRejectedValue(Object.assign(new Error('Forbidden'),{status:403}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(1001);});
  expect(screen.getByRole('alert')).toBeTruthy();
  const count=request.mock.calls.length;
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
  expect(request.mock.calls).toHaveLength(count);
});

test('recovers a waiting attempt after a transient polling failure without starting another login', async () => {
  const connected=await mount();
  request.mockResolvedValueOnce({state:'waiting',source:'desktop',attemptId:'owned'});
  await act(async()=>{fireEvent.click(screen.getByText('Sign in with Claude'));});
  request.mockRejectedValueOnce(new Error('Native transport is busy'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(1001);});
  expect(screen.getByText('Waiting for sign-in…')).toBeTruthy();
  request.mockResolvedValue({state:'connected',source:'desktop'});
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(connected).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.filter(([action])=>action==='start')).toHaveLength(1);
});

test('submits a code only to the active attempt and clears the password field', async () => {
  request.mockResolvedValue({state:'waiting',source:'desktop',attemptId:'owned',acceptsCode:true,canOpenBrowser:true});
  await mount();
  const input=screen.getByLabelText('Authorization code') as HTMLInputElement;
  expect(input.type).toBe('password');
  fireEvent.change(input,{target:{value:'synthetic-code#state'}});
  request.mockResolvedValueOnce({state:'waiting',source:'desktop',attemptId:'owned',acceptsCode:false});
  await act(async()=>{fireEvent.click(screen.getByText('Complete sign-in'));});
  expect(request).toHaveBeenCalledWith('code',undefined,{attemptId:'owned',code:'synthetic-code#state'});
  expect(screen.queryByDisplayValue('synthetic-code#state')).toBeNull();
});
test('restores pending sign-in after settings reopen and allows cancellation', async () => {
  request.mockResolvedValue({ state: 'waiting', source: 'cli' }); await mount();
  request.mockResolvedValue({ state: 'cancelled', source: 'cli' });
  await act(async () => { fireEvent.click(screen.getByText('Cancel')); });
  expect(request).toHaveBeenCalledWith('cancel'); expect(screen.getByText('Sign in with Claude')).toBeTruthy();
});
test('lost start response reconciles status without replaying the start mutation', async () => {
  await mount(); request.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { fireEvent.click(screen.getByText('Sign in with Claude')); });
  expect(screen.getByRole('status').textContent).toContain('Connection interrupted');
  request.mockResolvedValue({ state: 'waiting', source: 'desktop' });
  await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
  expect(screen.getByRole('status').textContent).toContain('Finish signing in');
  expect(request.mock.calls.filter(([action]) => action === 'start')).toHaveLength(1);
});
