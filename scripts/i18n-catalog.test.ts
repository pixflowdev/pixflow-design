import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTranslationCatalog, compareTranslationCatalogs, findUiTextCandidates, findMissingTranslationValues } from './i18n-catalog.ts';
test('reads unquoted keys, quotes and multiline translations', () => {
 const catalog=readTranslationCatalog("export const fr = { voice: 'Parler', 'chat.title': \"L’assistant\", multi: `line one\nline two` };");
 assert.equal(catalog.entries.size,3);
 assert.equal(catalog.entries.get('multi'),'line one\nline two');
});
test('detects duplicate keys, fallback spreads and broken placeholders', () => {
 const result=readTranslationCatalog("export const fr = {...en, label: 'A', label: 'B'};");
 assert.deepEqual(result.duplicates,['label']); assert.equal(result.unsupported.length,1);
 const compared=compareTranslationCatalogs(new Map([['a','Hello {name}'],['b','Save']]),new Map([['a','Bonjour {count}']]));
 assert.deepEqual(compared.missing,['b']); assert.deepEqual(compared.placeholderErrors,['a']);
});
test('inventories explicit UI text without treating class names as text', () => {
 const results=findUiTextCandidates('const x = <button className="save-button" title="Save changes">Save{busy ? "Working…" : "Ready"}</button>;', 'screen.tsx');
 assert.deepEqual(results.map(r=>r.text),['Save changes','Save','Working…','Ready']);
});

test('rejects malformed catalogue syntax instead of reporting partial key coverage', () => {
 assert.ok(readTranslationCatalog("export const fr = { label: 'Unclosed string }; ").syntaxErrors.length);
});

test('detects missing values in shared labels and rich text without guessing dynamic objects', () => {
  const en = new Map([['count', '{shown} of {total}'], ['welcome', 'Hello {name}']]);
  const result = findMissingTranslationValues(`t('count'); t('count', {shown: 1, total: 2}); t('count', vars); translateLocale('fr', 'welcome', {}); const node = <TranslatedText id="welcome" values={{name: <b>Ada</b>}} />;`, 'screen.tsx', en);
  assert.deepEqual(result.map(item => item.missing), [['shown', 'total'], ['name']]);
});
