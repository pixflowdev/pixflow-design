import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LOCALES } from '../apps/web/src/i18n/types.ts';
import { readTranslationCatalog, compareTranslationCatalogs, findUiTextCandidates, findMissingTranslationValues, type UiTextCandidate } from './i18n-catalog.ts';

const root = path.resolve(import.meta.dirname, '..');
const catalogs = new Map(await Promise.all(LOCALES.map(async (locale) => [locale, readTranslationCatalog(await readFile(path.join(root, 'apps/web/src/i18n/locales', `${locale}.ts`), 'utf8'))] as const)));
const english = catalogs.get('en')!.entries;
const locales = LOCALES.map((locale) => {
  const catalog = catalogs.get(locale)!;
  return { locale, total: catalog.entries.size, duplicates: catalog.duplicates, unsupported: catalog.unsupported, syntaxErrors: catalog.syntaxErrors, ...compareTranslationCatalogs(english, catalog.entries) };
});
const ui: UiTextCandidate[] = [];
const missingValues: ReturnType<typeof findMissingTranslationValues> = [];
async function walk(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'i18n') await walk(filename); }
    else if (/\.tsx?$/.test(entry.name)) {
      const source = await readFile(filename, 'utf8');
      const relative = path.relative(root, filename).replaceAll('\\', '/');
      ui.push(...findUiTextCandidates(source, relative));
      missingValues.push(...findMissingTranslationValues(source, relative, english));
    }
  }
}
await walk(path.join(root, 'apps/web/src'));
console.log(`UI translation audit: ${english.size} English keys, ${LOCALES.length} locales including English.`);
for (const row of locales) console.log(`${row.locale.padEnd(6)} keys=${row.total} missing=${row.missing.length} placeholders=${row.placeholderErrors.length} duplicates=${row.duplicates.length} identical-to-English=${row.locale === 'en' ? 'n/a' : row.identical.length}`);
console.log(`Hard-coded UI candidates: ${ui.length} across ${new Set(ui.map((entry) => entry.file)).size} files.`);
console.log(`Missing translation values at call sites: ${missingValues.length}.`);
console.log('Identical values include brands/technical labels and require review. Key parity is not translation completeness. PHP/server responses require a separate inventory.');
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const target = path.resolve(process.argv[outputIndex + 1] || '.tmp/i18n/audit.json');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify({ locales, ui, missingValues }, null, 2) + '\n');
  console.log(`Detailed report: ${target}`);
}
if (missingValues.length || locales.some((row) => row.missing.length || row.orphan.length || row.placeholderErrors.length || row.duplicates.length || row.unsupported.length || row.syntaxErrors.length || row.empty.length)) process.exitCode = 1;
