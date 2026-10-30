// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { en } from '../../src/i18n/locales/en';
vi.mock('../../src/providers/daemon', () => ({ codexUsageRequest: vi.fn() }));
vi.mock('../../src/i18n', () => ({ useI18n: () => ({ locale: 'en', t: (key: keyof typeof en, vars: Record<string, string> = {}) => Object.entries(vars).reduce((text, [key, value]) => text.replace(`{${key}}`, value), en[key]) }) }));
import { codexUsageRequest } from '../../src/providers/daemon';
import { CodexUsage } from '../../src/components/CodexUsage';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const data = { status: 'available' as const, source: 'desktop' as const, checkedAt: '2026-10-30T00:00:00Z', windows: [{ bucket: 'codex', durationMinutes: 10080, remainingPercent: 19, resetsAt: 1793784989 }] };
test('weekly-only account shows one real window and an account-wide timestamp', async () => {
  vi.mocked(codexUsageRequest).mockResolvedValue(data); render(<CodexUsage />);
  expect(await screen.findByText('19% remaining')).toBeTruthy();
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  expect(screen.getByText('7 days')).toBeTruthy();
  expect(screen.queryByText('5 hours')).toBeNull();
  expect(screen.getByText(/Shared across Codex/)).toBeTruthy();
});
test('multiple limits render independently', async () => {
  vi.mocked(codexUsageRequest).mockResolvedValue({ ...data, windows: [{ ...data.windows[0]!, durationMinutes: 300, remainingPercent: 50 }, ...data.windows] }); render(<CodexUsage />);
  await screen.findByText('50% remaining'); expect(screen.getAllByRole('progressbar')).toHaveLength(2);
});
test('failed lookup offers recovery without showing zero or stale usage', async () => {
  vi.mocked(codexUsageRequest).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(data);
  render(<CodexUsage />); await screen.findByText('Unavailable');
  expect(screen.queryByRole('progressbar')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText('19% remaining');
  expect(codexUsageRequest).toHaveBeenCalledTimes(2);
});
test('unmount cancels pending read and does not persist account data', async () => {
  vi.mocked(codexUsageRequest).mockImplementation(() => new Promise(() => {}));
  const view = render(<CodexUsage />);
  await waitFor(() => expect(codexUsageRequest).toHaveBeenCalledOnce());
  const signal = vi.mocked(codexUsageRequest).mock.calls[0]![0]!;
  view.unmount(); expect(signal.aborted).toBe(true);
});
