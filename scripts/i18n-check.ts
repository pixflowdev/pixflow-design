import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
const localeTypesPath = '../apps/web/src/i18n/types.ts';
const { LOCALE_LABEL, LOCALES } = await import(localeTypesPath) as { LOCALE_LABEL: Record<string, string>; LOCALES: string[] };
const loadersPath = '../apps/web/src/i18n/locale-loaders.ts';
const { LOCALE_LOADERS } = await import(loadersPath) as { LOCALE_LOADERS: Record<string, () => Promise<Record<string, string>>> };
const englishPath = '../apps/web/src/i18n/locales/en.ts';
const { en } = await import(englishPath) as { en: Record<string, string> };

// English documentation is independent of the downloadable UI translations.
const files = (await readdir(new URL('../apps/web/src/i18n/locales/', import.meta.url)))
  .filter(name => name.endsWith('.ts')).map(name => name.slice(0, -3)).sort();
assert.deepEqual(files, [...LOCALES].sort());
assert.deepEqual(Object.keys(LOCALE_LOADERS).sort(), LOCALES.filter(locale => locale !== 'en').sort());
const expected = Object.keys(en).sort();
for (const locale of LOCALES) {
  assert.ok(LOCALE_LABEL[locale]);
  const loader = LOCALE_LOADERS[locale];
  if (locale !== 'en') assert.ok(loader, `Missing loader: ${locale}`);
  const dictionary = locale === 'en' ? en : await loader!();
  assert.deepEqual(Object.keys(dictionary).sort(), expected, `Dictionary keys differ: ${locale}`);
  for (const [key, value] of Object.entries(dictionary)) assert.equal(typeof value, 'string', `Invalid message: ${locale}/${key}`);
}
for (const name of ['README.md', 'QUICKSTART.md', 'CONTRIBUTING.md', 'TRANSLATIONS.md']) {
  const source = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  assert.ok(source.trim());
  assert.doesNotMatch(source, /docs\/i18n\/(?:README|QUICKSTART|CONTRIBUTING|MAINTAINERS)\.[\w-]+\.md/, `Stale translation link: ${name}`);
}
console.log(`i18n check passed: ${LOCALES.length} locale dictionaries and current documentation.`);
