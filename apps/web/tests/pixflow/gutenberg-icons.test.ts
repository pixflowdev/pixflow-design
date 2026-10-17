// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountGutenbergIcons } from '../../src/pixflow/gutenberg-icons';
const request = vi.hoisted(() => vi.fn());
vi.mock('../../src/pixflow/license', () => ({ requestWordPressRest: request }));
afterEach(() => { delete (window as any).wp; vi.clearAllMocks(); });

it('refreshes the core pattern cache used by WordPress 6.8 without duplicating its patterns', async () => {
  const invalidateResolution = vi.fn();
  const updateSettings = vi.fn();
  const preserved = { name: 'theme/card', categories: ['featured'] };
  (window as any).wp = { data: {
    select: (store: string) => store === 'core' ? { getBlockPatterns: vi.fn(), getBlockPatternCategories: vi.fn() } : {
      getSettings: () => ({ __experimentalBlockPatterns: [preserved, { name: 'pixflow/old', categories: ['pixflow-icons'] }] }),
    },
    dispatch: (store: string) => store === 'core' ? { invalidateResolution } : { updateSettings },
  }, blocks: { createBlock: vi.fn(), serialize: vi.fn() } };
  request.mockResolvedValue({ ok: true, body: { native: false, icons: [] } });
  const stop = mountGutenbergIcons();
  try {
    await vi.waitFor(() => expect(invalidateResolution).toHaveBeenCalledWith('getBlockPatterns', []));
    expect(invalidateResolution).toHaveBeenCalledWith('getBlockPatternCategories', []);
    expect(updateSettings).toHaveBeenCalledWith({ __experimentalBlockPatterns: [preserved] });
  } finally { stop(); }
});

it('invalidates native picker caches for removed collections without editing content', async () => {
  const invalidateResolution = vi.fn();
  (window as any).wp = { data: { dispatch: () => ({ invalidateResolution }) } };
  request.mockResolvedValueOnce({ ok: true, body: { native: true, icons: [{ collection: 'pixflow-test' }] } });
  const stop = mountGutenbergIcons();
  try {
    await vi.waitFor(() => expect(invalidateResolution).toHaveBeenCalledWith('getEntityRecords', ['root', 'icon', { collection: 'pixflow-test' }]));
    invalidateResolution.mockClear();
    request.mockResolvedValueOnce({ ok: true, body: { native: true, icons: [] } });
    window.dispatchEvent(new Event('pixflow-design:icon-packs-changed'));
    await vi.waitFor(() => expect(invalidateResolution).toHaveBeenCalledWith('getEntityRecords', ['root', 'icon', { collection: 'pixflow-test' }]));
    expect(invalidateResolution).toHaveBeenCalledWith('getEntityRecords', ['root', 'iconCollection']);
  } finally { stop(); }
});

it('refreshes only owned patterns on WordPress without native collections', async () => {
  const updateSettings = vi.fn();
  const preserved = { name: 'theme/card', categories: ['featured'] };
  (window as any).wp = {
    data: { select: () => ({ getSettings: () => ({ __experimentalBlockPatterns: [preserved, { name: 'pixflow/old', categories: ['pixflow-icons'] }] }) }), dispatch: () => ({ updateSettings }) },
    blocks: { createBlock: vi.fn((name, attributes) => ({ name, attributes })), serialize: vi.fn(() => '<!-- wp:image /-->') },
  };
  request.mockResolvedValueOnce({ ok: true, body: { native: false, icons: [{ name: 'pixflow/new', label: 'New', collection: 'pixflow', block: { name: 'core/image', attributes: { id: 7 } } }] } });
  const stop = mountGutenbergIcons();
  try {
    await vi.waitFor(() => expect(updateSettings).toHaveBeenCalled());
    expect(updateSettings.mock.calls[0]?.[0].__experimentalBlockPatterns).toEqual([preserved, { name: 'pixflow/new', title: 'New', categories: ['pixflow-icons'], content: '<!-- wp:image /-->' }]);
    expect((window as any).wp.blocks.createBlock).toHaveBeenCalledWith('core/image', { id: 7 });
  } finally { stop(); }
});
