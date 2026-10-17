import { expect, it, vi } from 'vitest';
import { applyPixflowCaptureActions } from '../../src/pixflow/capture-actions.js';

it('opens requested interaction states in order before capturing', async () => {
  const calls: string[] = [];
  const page = { locator: (selector: string) => ({
    click: async () => { calls.push(`click:${selector}`); },
    hover: async () => { calls.push(`hover:${selector}`); },
    fill: vi.fn(), selectOption: vi.fn(), setChecked: vi.fn(), waitFor: vi.fn(),
  }) };
  await applyPixflowCaptureActions(page, [
    { type: 'click', selector: '[aria-label="Open mobile menu"]' },
    { type: 'hover', selector: '.mobile-menu .collection' },
  ]);
  expect(calls).toEqual(['click:[aria-label="Open mobile menu"]', 'hover:.mobile-menu .collection']);
});

it('does nothing when no actions were requested', async () => {
  const page = { locator: vi.fn() };
  await applyPixflowCaptureActions(page);
  expect(page.locator).not.toHaveBeenCalled();
});

it('reports the failed action and does not silently capture the wrong state', async () => {
  const click = vi.fn().mockRejectedValue(new Error('selector matched two elements'));
  const page = { locator: vi.fn(() => ({ click, hover: vi.fn(), fill: vi.fn(), selectOption: vi.fn(), setChecked: vi.fn(), waitFor: vi.fn() })) };
  await expect(applyPixflowCaptureActions(page, [
    { type: 'click', selector: '.menu' }, { type: 'click', selector: '.child' },
  ])).rejects.toThrow('Capture action 1 (click .menu): selector matched two elements');
  expect(page.locator).toHaveBeenCalledTimes(1);
});
