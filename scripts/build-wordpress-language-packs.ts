import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

export const WORDPRESS_LANGUAGE_LOCALES: Record<string, string> = {
  id: 'id_ID', de: 'de_DE', 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', 'pt-BR': 'pt_BR', 'es-ES': 'es_ES',
  ru: 'ru_RU', fa: 'fa_IR', ar: 'ar', ja: 'ja', ko: 'ko_KR', pl: 'pl_PL', hu: 'hu_HU', fr: 'fr_FR',
  uk: 'uk', tr: 'tr_TR', th: 'th', it: 'it_IT',
};
export interface LanguagePackManifest {
  schema: 1;
  locales: Record<string, { sha256: string; bytes: number; wpLocale: string; file: string }>;
}

/** Release-pinned inert data. Public hosting may serve these exact bytes without a licence. */
export async function buildWordPressLanguagePacks(root: string, outputDirectory: string, options: {
  proRoot?: string | undefined;
  languageRoot?: string | undefined;
  writeManifest?: boolean | undefined;
} = {}): Promise<LanguagePackManifest> {
  // Variable imports keep scripts' Node-only typecheck independent of the web compilation.
  const { LOCALE_LOADERS } = await tsImport(pathToFileURL(join(root, 'apps/web/src/i18n/locale-loaders.ts')).href, import.meta.url);
  const { CONTENT_LOADERS } = await tsImport(pathToFileURL(join(root, 'apps/web/src/i18n/content-loaders.ts')).href, import.meta.url);
  const manifest: LanguagePackManifest = { schema: 1, locales: {} };
  await mkdir(outputDirectory, { recursive: true });
  for (const [locale, wpLocale] of Object.entries(WORDPRESS_LANGUAGE_LOCALES)) {
    const dictionary: Record<string, string> = await LOCALE_LOADERS[locale]();
    const content = await CONTENT_LOADERS[locale === 'zh-TW' ? 'zh-CN' : locale]();
    if (!Object.keys(dictionary).length || Object.values(dictionary).some(value => typeof value !== 'string')) {
      throw new Error(`Invalid translation dictionary: ${locale}`);
    }
    const wordpress: Record<string, string> = {};
    for (const domain of ['pixflow-design', 'pixflow-design-pro']) {
      const owner = domain.endsWith('-pro') ? 'wordpress-pro' : 'wordpress';
      const directory = options.languageRoot ? join(options.languageRoot, domain)
        : domain.endsWith('-pro') && !options.proRoot ? join(root, '.tmp/wordpress-translations', domain)
        : join(domain.endsWith('-pro') ? options.proRoot! : root, owner, 'languages');
      wordpress[domain] = (await readFile(join(directory, `${domain}-${wpLocale}.mo`))).toString('base64');
    }
    const bytes = Buffer.from(JSON.stringify({ schema: 1, locale, dictionary, content, wordpress }));
    if (bytes.length > 3 * 1024 * 1024) throw new Error(`Language pack exceeds the download limit: ${locale}`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const file = `${locale}-${sha256}.json`;
    await writeFile(join(outputDirectory, file), bytes);
    manifest.locales[locale] = { sha256, bytes: bytes.length, wpLocale, file };
  }
  const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(outputDirectory, 'manifest.json'), encoded);
  if (options.writeManifest !== false) await writeFile(join(root, 'wordpress/resources/language-packs.json'), encoded);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const root = resolve(import.meta.dirname, '..');
  const { buildWordPressTranslations } = await import('./build-wordpress-translations.ts');
  await buildWordPressTranslations();
  await buildWordPressLanguagePacks(root, resolve(process.env.PIXFLOW_LANGUAGE_OUTPUT_DIR || join(root, '.tmp/language-packs')));
  console.log('Built 18 verified language data packs. Publishing is a separate step.');
}
