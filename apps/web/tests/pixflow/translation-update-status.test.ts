// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { requestWordPressRest } from '../../src/pixflow/license';
import { watchTranslationUpdates } from '../../src/pixflow/translation-update-status';

vi.mock('../../src/pixflow/license', () => ({ requestWordPressRest: vi.fn() }));
const rest = vi.mocked(requestWordPressRest);
const changed = () => window.dispatchEvent(new Event('pixflow:translation-updates-changed'));
const response = (languages: string[], pending: boolean) => ({ ok: true, status: 200, body: { activeLanguages: languages, needsUpdate: pending } });

it('shares status between menu and rail, refreshes after changes, and ignores stale responses on revocation', async () => {
  const access = { canManage: true };
  Object.assign(window, { __PIXFLOW_FEATURE_RUNTIME__: { features: ['site-translations'], configuration: { 'site-translations': access } } });
  const menu = vi.fn(), rail = vi.fn();
  rest.mockResolvedValueOnce(response([], true));
  const close = watchTranslationUpdates(menu), unmount = watchTranslationUpdates(rail);
  try {
    await vi.waitFor(() => expect(rail).toHaveBeenLastCalledWith({ activeLanguages: [], needsUpdate: false }));
    expect(rest).toHaveBeenCalledTimes(1);
    rest.mockResolvedValueOnce(response(['es'], true));
    changed();
    await vi.waitFor(() => expect(menu).toHaveBeenLastCalledWith({ activeLanguages: ['es'], needsUpdate: true }));
    rest.mockRejectedValueOnce(new Error('temporarily offline'));
    changed(); await Promise.resolve();
    expect(rail).toHaveBeenLastCalledWith({ activeLanguages: ['es'], needsUpdate: true });
    rest.mockResolvedValueOnce(response(['es'], false));
    changed();
    await vi.waitFor(() => expect(menu).toHaveBeenLastCalledWith({ activeLanguages: ['es'], needsUpdate: false }));
    let finish!: () => void;
    rest.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(response(['es'], true)); }));
    changed();
    access.canManage = false;
    window.dispatchEvent(new Event('pixflow-design:feature-runtime-changed'));
    finish(); await Promise.resolve();
    expect(menu).toHaveBeenLastCalledWith(null);
  } finally { close(); unmount(); }
  rest.mockClear();
  changed(); window.dispatchEvent(new Event('focus'));
  expect(rest).not.toHaveBeenCalled();
});
