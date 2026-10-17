// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { changeReviewDisabled, setChangeReviewDisabled, subscribeChangeReviewPreference } from '../../src/pixflow/change-review-preference';

afterEach(() => { vi.restoreAllMocks(); setChangeReviewDisabled(false); });
it('works when storage is blocked and notifies mounted controls', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const listener = vi.fn(), unsubscribe = subscribeChangeReviewPreference(listener);
  setChangeReviewDisabled(true); expect(changeReviewDisabled()).toBe(true);
  expect(listener).toHaveBeenCalledOnce(); unsubscribe();
  setChangeReviewDisabled(false); expect(listener).toHaveBeenCalledOnce();
});
it('refreshes the cached choice when another tab changes storage', () => {
  const unsubscribe = subscribeChangeReviewPreference(() => {});
  setChangeReviewDisabled(true);
  const name = Object.keys(localStorage).find(key => key.startsWith('pixflow:disable-change-review:'))!;
  localStorage.setItem(name, 'false');
  window.dispatchEvent(new StorageEvent('storage', { key: name, newValue: 'false' }));
  expect(changeReviewDisabled()).toBe(false); unsubscribe();
});
