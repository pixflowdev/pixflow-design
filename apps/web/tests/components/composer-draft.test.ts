// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const owner = vi.hoisted(() => ({ restBaseUrl: 'https://test.invalid/rest', userId: 1 }));
vi.mock('../../src/pixflow/wordpress-context', () => ({ getPixflowWordPressConfig: () => owner }));
import { loadComposerDraft, saveComposerDraft, loadComposerSnapshot, saveComposerSnapshot } from '../../src/components/composer-draft';
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); owner.userId = 1; });
it('keeps the latest draft through a quota failure and composer remount without resurrecting old text', () => {
  localStorage.setItem('quota-draft', 'Older text');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  saveComposerDraft('quota-draft', 'Current text\n\nWith paragraphs');
  expect(loadComposerDraft('quota-draft')).toBe('Current text\n\nWith paragraphs');
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw Error('Unavailable'); });
  saveComposerDraft('quota-draft', '');
  expect(loadComposerDraft('quota-draft')).toBe('');
});
it('does not expose one signed-in account recovery draft to another', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Unavailable'); });
  saveComposerDraft('account-draft', 'Account one');
  owner.userId = 2; expect(loadComposerDraft('account-draft')).toBeNull();
  owner.userId = 1; expect(loadComposerDraft('account-draft')).toBe('Account one');
});

it('reads a newer snapshot written by another mounted surface instead of stale memory', () => {
  saveComposerSnapshot('shared', { text: 'old', attachments: [] });
  const key = Object.keys(localStorage).find(key => key.includes('composer-snapshot:'))!;
  localStorage.setItem(key, JSON.stringify({text: 'new', attachments: [{path: 'upload.png'}]}));
  expect(loadComposerSnapshot('shared')).toEqual({text: 'new', attachments: [{path:'upload.png'}]});
});
it('isolates attachment snapshots by signed-in owner', () => {
  saveComposerSnapshot('private-snapshot', {text:'private', attachments: [{path:'private.png'}]});
  owner.userId = 2;
  expect(loadComposerSnapshot('private-snapshot')).toBeNull();
});
