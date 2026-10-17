import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, type Locale } from '../apps/web/src/i18n/types.ts';
import { compareTranslationCatalogs, readTranslationCatalog, translationPlaceholders } from './i18n-catalog.ts';
import { collectWordPressMessages, compileMo, printfPlaceholders, type WordPressMessage } from './wordpress-translations.ts';

const root = path.resolve(import.meta.dirname, '..');
const wordpressLocales: Record<Locale, string> = {
  en: 'en_US', id: 'id_ID', de: 'de_DE', 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', 'pt-BR': 'pt_BR', 'es-ES': 'es_ES',
  ru: 'ru_RU', fa: 'fa_IR', ar: 'ar', ja: 'ja', ko: 'ko_KR', pl: 'pl_PL', hu: 'hu_HU', fr: 'fr_FR', uk: 'uk', tr: 'tr_TR', th: 'th', it: 'it_IT',
};

export interface WordPressTranslationOptions {
  proRoot?: string | undefined;
  outputRoot?: string | undefined;
}

export async function buildWordPressTranslations(templatesOnly = false, options: WordPressTranslationOptions = {}): Promise<void> {
  const inventory = JSON.parse(await readFile(path.join(root, 'wordpress/resources/translation-messages.json'), 'utf8')) as Array<WordPressMessage & { key: string }>;
  const scanned = await collectWordPressMessages(root, options.proRoot);
  // Public translation data is shared across editions. Reproduce the existing
  // language downloads without requiring or discovering private PHP source.
  const actual = options.proRoot ? scanned : [...scanned, ...inventory.filter(item => item.domain === 'pixflow-design-pro')];
  const mapped = new Map(inventory.map(item => [`${item.domain}\0${item.message}`, item]));
  for (const item of actual) if (!mapped.has(`${item.domain}\0${item.message}`)) throw new Error(`Uncatalogued WordPress text: ${item.references[0]}: ${item.message}`);
  const parsed = new Map(await Promise.all(LOCALES.map(async locale => [locale, readTranslationCatalog(await readFile(path.join(root, 'apps/web/src/i18n/locales', `${locale}.ts`), 'utf8'))] as const)));
  const catalogs = new Map([...parsed].map(([locale, catalog]) => [locale, catalog.entries]));
  if (!templatesOnly) {
    for (const [locale, catalog] of parsed) {
      const comparison = compareTranslationCatalogs(catalogs.get('en')!, catalog.entries);
      if (catalog.syntaxErrors.length || catalog.duplicates.length || catalog.unsupported.length
        || comparison.missing.length || comparison.orphan.length || comparison.empty.length || comparison.placeholderErrors.length) {
        throw new Error(`Incomplete or invalid translation catalogue: ${locale} (${comparison.missing.length} missing, ${comparison.placeholderErrors.length} placeholder mismatches). Run scripts/i18n-coverage-report.ts for details.`);
      }
    }
  }
  const version = /Version:\s*([^\r\n]+)/.exec(await readFile(path.join(root, 'pixflow-design.php'), 'utf8'))?.[1]?.trim() ?? '';
  for (const domain of ['pixflow-design', 'pixflow-design-pro']) {
    const ownerRoot = domain.endsWith('-pro') ? options.proRoot! : root;
    const directory = options.outputRoot ? path.join(options.outputRoot, domain)
      : domain.endsWith('-pro') && !options.proRoot ? path.join(root, '.tmp/wordpress-translations', domain)
      : path.join(ownerRoot, domain.endsWith('-pro') ? 'wordpress-pro' : 'wordpress', 'languages');
    await mkdir(directory, { recursive: true });
    const messages = actual.filter(item => item.domain === domain);
    const header = (language: string) => `Project-Id-Version: ${domain} ${version}\nLanguage: ${language}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\nX-Generator: Pixflow translation build\n`;
    const po = (values: Map<string, string>) => '# Generated from the typed Pixflow language catalogues. Edit the source catalogues.\n'
      + `msgid ""\nmsgstr ${JSON.stringify(values.get('') ?? '')}\n\n`
      + messages.map(item => `#: ${item.references.join(' ')}\nmsgid ${JSON.stringify(item.message)}\nmsgstr ${JSON.stringify(values.get(item.message) ?? '')}\n`).join('\n');
    await writeFile(path.join(directory, `${domain}.pot`), po(new Map([['', header('')]])));
    if (templatesOnly) continue;
    for (const locale of LOCALES.filter(locale => locale !== 'en')) {
      const catalog = catalogs.get(locale)!;
      const values = new Map<string, string>([['', header(wordpressLocales[locale])]]);
      for (const item of messages) {
        const key = mapped.get(`${item.domain}\0${item.message}`)!.key;
        const value = catalog.get(key);
        if (!value?.trim()) throw new Error(`Missing WordPress translation: ${locale}.${key}`);
        if (JSON.stringify(printfPlaceholders(item.message)) !== JSON.stringify(printfPlaceholders(value))
          || JSON.stringify(translationPlaceholders(item.message)) !== JSON.stringify(translationPlaceholders(value))) throw new Error(`WordPress placeholder mismatch: ${locale}.${key}`);
        values.set(item.message, value);
      }
      await writeFile(path.join(directory, `${domain}-${wordpressLocales[locale]}.po`), po(values));
      await writeFile(path.join(directory, `${domain}-${wordpressLocales[locale]}.mo`), compileMo(values));
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildWordPressTranslations(process.argv.includes('--templates-only'));
  console.log('WordPress translation files generated.');
}
