// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { en } from '../../src/i18n/locales/en';
vi.mock('../../src/providers/daemon', () => ({ codexUsageRequest: vi.fn() }));
vi.mock('../../src/i18n', () => ({ useI18n: () => ({ locale: 'en', t: (key: keyof typeof en, vars: Record<string, string> = {}) => Object.entries(vars).reduce((text, [key, value]) => text.replace(`{${key}}`, value), en[key]) }) }));
import { codexUsageRequest } from '../../src/providers/daemon';
import { CodexUsageIndicator } from '../../src/components/CodexUsageIndicator';

const usage = (remainingPercent: number) => ({ status: 'available' as const, source: 'desktop' as const, checkedAt: new Date().toISOString(), windows: [{ bucket: 'codex', durationMinutes: 10080, remainingPercent }] });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); });
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

test.each(['codex', 'claude'] as const)('%s ring and hover update every 60 seconds without clicking', async provider => {
  vi.useFakeTimers();
  vi.mocked(codexUsageRequest).mockResolvedValueOnce(usage(80)).mockResolvedValue(usage(65));
  render(<CodexUsageIndicator provider={provider} model="selected-model" />);
  await tick(0);
  const button = screen.getByRole('button', { name: /80% remaining/ });
  fireEvent.mouseEnter(button);
  await tick(59999);
  expect(codexUsageRequest).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(codexUsageRequest).toHaveBeenCalledTimes(2);
  expect(vi.mocked(codexUsageRequest).mock.calls[1]!.slice(1)).toEqual([provider, 'selected-model']);
  expect(screen.getByRole('tooltip').textContent).toContain('65% remaining');
  expect(button.querySelector('[stroke-dashoffset]')?.getAttribute('stroke-dashoffset')).toBe('35');
  await tick(60000);
  expect(codexUsageRequest).toHaveBeenCalledTimes(3);
});

test('background refresh retains the reading and does not overlap an unfinished request', async () => {
  vi.useFakeTimers();
  let finish: (value: ReturnType<typeof usage>) => void = () => {};
  vi.mocked(codexUsageRequest).mockResolvedValueOnce(usage(80)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<CodexUsageIndicator />);
  await tick(0);
  const button = screen.getByRole('button', { name: /80% remaining/ });
  fireEvent.mouseEnter(button);
  await tick(60000);
  expect(button.getAttribute('aria-label')).toContain('80% remaining');
  expect(screen.getByRole('tooltip').textContent).toContain('80% remaining');
  await tick(60000);
  expect(codexUsageRequest).toHaveBeenCalledTimes(2);
  expect(vi.mocked(codexUsageRequest).mock.calls[1]![0]?.aborted).toBe(false);
  await act(async () => finish(usage(60)));
  expect(button.getAttribute('aria-label')).toContain('60% remaining');
});

test('failed automatic reads clear stale values and recover on the next minute', async () => {
  vi.useFakeTimers();
  vi.mocked(codexUsageRequest).mockResolvedValueOnce(usage(80)).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(usage(55));
  render(<CodexUsageIndicator />);
  await tick(0);
  await tick(60000);
  expect(screen.getByRole('button', { name: /Unavailable/ }).querySelector('[stroke-dashoffset]')).toBeNull();
  await tick(60000);
  expect(screen.getByRole('button', { name: /55% remaining/ })).toBeTruthy();
});

test('hidden tabs pause polling, resume overdue reads and clean up on unmount', async () => {
  vi.useFakeTimers();
  vi.mocked(codexUsageRequest).mockResolvedValue(usage(80));
  let visibility: DocumentVisibilityState = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const view = render(<CodexUsageIndicator />);
  await tick(0);
  visibility = 'hidden'; fireEvent(document, new Event('visibilitychange'));
  await tick(180000);
  expect(codexUsageRequest).toHaveBeenCalledTimes(1);
  visibility = 'visible'; fireEvent(document, new Event('visibilitychange'));
  await tick(0);
  expect(codexUsageRequest).toHaveBeenCalledTimes(2);
  fireEvent(document, new Event('visibilitychange'));
  await tick(0);
  expect(codexUsageRequest).toHaveBeenCalledTimes(2);
  view.unmount();
  await tick(120000);
  fireEvent(document, new Event('visibilitychange'));
  expect(codexUsageRequest).toHaveBeenCalledTimes(2);
});

test('model changes cancel old work and poll only the newly selected model', async () => {
  vi.useFakeTimers();
  vi.mocked(codexUsageRequest).mockResolvedValue(usage(80));
  const view = render(<CodexUsageIndicator provider="claude" model="opus" />);
  await tick(0);
  await tick(30000);
  view.rerender(<CodexUsageIndicator provider="claude" model="sonnet" />);
  await tick(0);
  expect(vi.mocked(codexUsageRequest).mock.calls[0]![0]?.aborted).toBe(true);
  await tick(30000);
  expect(codexUsageRequest).toHaveBeenCalledTimes(2);
  await tick(30000);
  expect(codexUsageRequest).toHaveBeenCalledTimes(3);
  expect(vi.mocked(codexUsageRequest).mock.calls[2]!.slice(1)).toEqual(['claude', 'sonnet']);
});
