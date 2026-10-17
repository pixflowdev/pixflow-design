import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { before, after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import ts from 'typescript';
import { buildWordPressLanguagePacks, type LanguagePackManifest } from './build-wordpress-language-packs.ts';
import { buildWordPressTranslations } from './build-wordpress-translations.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await mkdtemp(join(tmpdir(), 'pixflow-free-language-packs-'));
const output = join(fixture, 'packs');
const languageRoot = join(fixture, 'languages');
const expectedLocales = ['ar', 'de', 'es-ES', 'fa', 'fr', 'hu', 'id', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'ru', 'th', 'tr', 'uk', 'zh-CN', 'zh-TW'];

before(async () => {
  await buildWordPressTranslations(false, { outputRoot: languageRoot });
  await buildWordPressLanguagePacks(root, output, { languageRoot, writeManifest: false });
});
after(async () => { await rm(fixture, { recursive: true, force: true }); });

interface Pack {
  schema: number;
  locale: string;
  dictionary: Record<string, string>;
  content: Record<string, unknown>;
  wordpress: Record<string, string>;
}

async function manifest(): Promise<LanguagePackManifest> {
  return JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
}

test('all eighteen data downloads preserve complete UI/catalogue translations and PHP MO bytes', async () => {
  const inventory = await manifest();
  assert.equal(inventory.schema, 1);
  assert.deepEqual(Object.keys(inventory.locales).sort(), expectedLocales);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'wordpress/resources/language-packs.json'), 'utf8')), inventory);
  const { LOCALE_LOADERS } = await import(pathToFileURL(join(root, 'apps/web/src/i18n/locale-loaders.ts')).href);
  const { CONTENT_LOADERS } = await import(pathToFileURL(join(root, 'apps/web/src/i18n/content-loaders.ts')).href);
  for (const [locale, entry] of Object.entries(inventory.locales)) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.equal(entry.file, `${locale}-${entry.sha256}.json`);
    const bytes = await readFile(join(output, entry.file));
    assert.equal(bytes.length, entry.bytes, locale);
    assert.ok(bytes.length < 3 * 1024 * 1024, `${locale} exceeds the backend limit`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, locale);
    const payload = JSON.parse(bytes.toString('utf8')) as Pack;
    assert.deepEqual(Object.keys(payload).sort(), ['content', 'dictionary', 'locale', 'schema', 'wordpress']);
    assert.equal(payload.schema, 1);
    assert.equal(payload.locale, locale);
    // Deep equality includes placeholders, saved identifiers and example copy.
    assert.deepEqual(payload.dictionary, await LOCALE_LOADERS[locale](), locale);
    assert.deepEqual(payload.content, await CONTENT_LOADERS[locale === 'zh-TW' ? 'zh-CN' : locale](), locale);
    assert.deepEqual(Object.keys(payload.wordpress).sort(), ['pixflow-design', 'pixflow-design-pro']);
    for (const domain of Object.keys(payload.wordpress)) {
      const mo = Buffer.from(payload.wordpress[domain]!, 'base64');
      assert.deepEqual(mo, await readFile(join(languageRoot, domain, `${domain}-${entry.wpLocale}.mo`)));
      assert.equal(mo.readUInt32LE(0), 0x950412de, 'Downloaded PHP translations must be valid GNU MO files');
      assert.ok(mo.readUInt32LE(8) > 0, 'MO must contain translations');
    }
  }
});

test('identical sources reproduce byte-identical downloads and pinned manifests', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'pixflow-language-build-'));
  try {
    const expected = await manifest();
    const rebuilt = await buildWordPressLanguagePacks(root, folder, { languageRoot, writeManifest: false });
    assert.deepEqual(rebuilt, expected);
    for (const entry of Object.values(expected.locales)) {
      assert.deepEqual(await readFile(join(folder, entry.file)), await readFile(join(output, entry.file)));
    }
    assert.equal((await readdir(folder)).length, 19, 'Only JSON data packs and their manifest should be generated');
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('Free ZIP omits downloaded language payloads but retains the English fallback and translation template', async () => {
  const packageOutput = resolve(process.env.PIXFLOW_DESIGN_PACKAGE_OUTPUT_DIR || join(root, 'dist'));
  const inventory = await manifest();
  const { en } = await import(pathToFileURL(join(root, 'apps/web/src/i18n/locales/en.ts')).href);
  const english = new Set(Object.values(en));
  const sentinels = new Map<string, string>();
  for (const [locale, entry] of Object.entries(inventory.locales)) {
    const payload = JSON.parse(await readFile(join(output, entry.file), 'utf8')) as Pack;
    const copy = Object.values(payload.dictionary).find(value => value.length > 120 && !english.has(value));
    assert.ok(copy, `${locale} needs representative translated text`);
    sentinels.set(copy, locale);
  }
  for (const [alias, slug, domain] of [
    ['pixflow-ai.zip', 'pixflow-ai', 'pixflow-design'],
  ]) {
    const archive = await JSZip.loadAsync(await readFile(join(packageOutput, alias!)));
    const names = Object.keys(archive.files);
    assert.ok(archive.file(`${slug}/languages/${domain}.pot`), `${alias} must keep its translation template`);
    assert.equal(names.some(name => /\/languages\/.*\.(?:mo|po)$/.test(name)), false, `${alias} ships downloaded PHP translations`);
    for (const entry of Object.values(inventory.locales)) {
      assert.equal(names.some(name => name.endsWith(`/${entry.file}`)), false, `${alias} embeds a downloadable language pack`);
    }
    // Scan decoded JavaScript string tokens so minifier Unicode escapes cannot
    // hide an accidentally retained foreign-language bundle in either edition.
    for (const file of Object.values(archive.files).filter(file => !file.dir && file.name.endsWith('.js'))) {
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, await file.async('string'));
      for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
        if (token === ts.SyntaxKind.StringLiteral) {
          const locale = sentinels.get(scanner.getTokenValue());
          assert.equal(locale, undefined, `${file.name} embeds downloaded ${locale} dictionary data`);
        }
      }
    }
    if (slug === 'pixflow-ai') {
      const packed = archive.file(`${slug}/resources/language-packs.json`);
      assert.ok(packed, 'Free must own the language manifest without Pro');
      assert.deepEqual(JSON.parse(await packed.async('string')), inventory);
      const bundledEnglish = await archive.file(`${slug}/assets/app/pixflow-english.js`)?.async('string');
      assert.ok(bundledEnglish?.includes('Send'), 'Free English UI must be bundled once and usable without any downloads');
      const lazy = JSON.parse(await archive.file(`${slug}/assets/app/lazy/manifest.json`)!.async('string')) as { modules: Record<string, string> };
      assert.equal(Object.keys(lazy.modules).length, 1, 'Only syntax highlighting remains a JavaScript lazy download');
    }
  }
});
