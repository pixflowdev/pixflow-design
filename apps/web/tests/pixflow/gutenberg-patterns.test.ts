import { expect, it, vi } from 'vitest';
import { validateGutenbergPatterns } from '../../src/pixflow/gutenberg-patterns';

const ref = (id: number) => ({ name: 'core/block', attributes: { ref: id } });
const parse = (content: string) => JSON.parse(content || '[]');
const record = (blocks: any[] = [], meta = {}) => ({ status: 'publish', meta, content: { raw: JSON.stringify(blocks) } });
it('validates nested references once and leaves block data untouched', async () => {
  const blocks = [ref(2), ref(2)], original = JSON.stringify(blocks);
  const fetch = vi.fn(async () => record());
  await validateGutenbergPatterns(blocks, { type: 'page', id: '1' }, fetch, parse);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(blocks)).toBe(original);
});
it.each([0, -1, 1.5])('rejects invalid pattern ID %s', async id => {
  await expect(validateGutenbergPatterns([ref(id)], { type: 'page', id: '1' })).rejects.toThrow('valid synced pattern');
});
it('rejects absent, unpublished and unsynced references', async () => {
  for (const value of [null, { status: 'draft' }, record([], { wp_pattern_sync_status: 'unsynced' }), {...record(), wp_pattern_sync_status:'unsynced'}]) {
    await expect(validateGutenbergPatterns([ref(2)], { type: 'page', id: '1' }, async () => value as any, parse)).rejects.toThrow(/published|independent/);
  }
});
it('rejects direct and indirect self references without changing a document', async () => {
  await expect(validateGutenbergPatterns([ref(2)], { type: 'wp_block', id: '2' }, async () => record(), parse)).rejects.toThrow('cycle');
  await expect(validateGutenbergPatterns([ref(2)], { type: 'page', id: '1' }, async () => record([ref(2)]), parse)).rejects.toThrow('cycle');
});
it('requires readable native content and discovery when references are present', async () => {
  await validateGutenbergPatterns([{ name: 'core/paragraph' }], { type: 'page', id: '1' });
  await expect(validateGutenbergPatterns([ref(2)], { type: 'page', id: '1' })).rejects.toThrow('unavailable');
  await expect(validateGutenbergPatterns([ref(2)], { type: 'page', id: '1' }, async () => ({ status: 'publish' }), parse)).rejects.toThrow('content');
});
