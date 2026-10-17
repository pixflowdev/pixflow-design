import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectWordPressMessages, compileMo, readWordPressMessages, printfPlaceholders } from './wordpress-translations.ts';

test('Free message collection does not require or discover a Pro checkout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-free-translations-'));
  try {
    await mkdir(join(root, 'wordpress/src'), { recursive: true });
    await writeFile(join(root, 'wordpress/src/Notice.php'), "<?php __('Free settings', 'pixflow-design');");
    const messages = await collectWordPressMessages(root);
    assert.deepEqual(messages.map(item => [item.domain, item.message]), [['pixflow-design', 'Free settings']]);
    await mkdir(join(root, 'private/wordpress-pro/src'), { recursive: true });
    await writeFile(join(root, 'private/wordpress-pro/src/Notice.php'), "<?php __('Pro settings', 'pixflow-design-pro');");
    assert.equal((await collectWordPressMessages(root)).length, 1);
    assert.equal((await collectWordPressMessages(root, join(root, 'private'))).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('extracts static text with escaping and keeps each plugin domain', () => {
  const source = String.raw`<?php esc_html__('Don\'t remove %s', 'pixflow-design'); __('Pro settings', 'pixflow-design-pro'); __('Other', 'foreign-plugin'); __('Ignore ' . $dynamic, 'pixflow-design');`;
  const messages = readWordPressMessages(source, 'notice.php');
  assert.equal(messages.length, 2);
  assert.equal(messages[0]!.message, "Don't remove %s");
  assert.equal(messages[1]!.domain, 'pixflow-design-pro');
  assert.deepEqual(printfPlaceholders('Copy %1$s (%d)'), ['%1$s', '%d']);
});

test('compiles byte offsets for non-Latin UTF-8 messages without corrupting text', () => {
  const mo = compileMo(new Map([['', 'Content-Type: text/plain; charset=UTF-8\n'], ['Save', 'حفظ'], ['Delete', '删除']]));
  assert.equal(mo.readUInt32LE(0), 0x950412de);
  const count = mo.readUInt32LE(8);
  const read = (table: number, index: number) => { const slot = table + index * 8; return mo.subarray(mo.readUInt32LE(slot + 4), mo.readUInt32LE(slot + 4) + mo.readUInt32LE(slot)).toString('utf8'); };
  const messages = new Map(Array.from({ length: count }, (_, index) => [read(mo.readUInt32LE(12), index), read(mo.readUInt32LE(16), index)]));
  assert.equal(messages.get('Save'), 'حفظ'); assert.equal(messages.get('Delete'), '删除');
});

test('empty GNU MO hash table follows both lookup tables for the WordPress 6.2 reader', () => {
  const mo = compileMo(new Map([['', 'Content-Type: text/plain; charset=UTF-8\n'], ['Open settings', 'Ouvrir les paramètres']]));
  const count = mo.readUInt32LE(8);
  const translationsTable = mo.readUInt32LE(16);
  const hashSize = mo.readUInt32LE(20);
  const hashAddress = mo.readUInt32LE(24);
  assert.equal(hashSize, 0, 'This compiler deliberately omits a hash table');
  // POMO in WordPress 6.2 reads the translation descriptors through hash_addr
  // even when hash_length is zero, then requires exactly count * 8 bytes.
  assert.equal(hashAddress - translationsTable, count * 8, 'The translation descriptors must be readable through the empty hash table address');
  assert.equal(mo.readUInt32LE(32), hashAddress, 'Message strings begin immediately after the empty hash table');
});
