import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type WordPressDistribution = 'website' | 'directory';

export function wordpressDistribution(value: string | undefined): WordPressDistribution {
  if (!value || value === 'website') return 'website';
  if (value === 'directory') return value;
  throw new Error(`Unknown WordPress distribution: ${value}`);
}

/** Modify only PHP translation arguments, never saved identifiers or routes. */
export function directoryTranslationDomains(source: string): string {
  const indexes: Record<string, number> = {
    __: 1, _e: 1, esc_html__: 1, esc_html_e: 1, esc_attr__: 1, esc_attr_e: 1,
    _x: 2, _ex: 2, esc_html_x: 2, esc_attr_x: 2, _n: 3, _nx: 4,
    _n_noop: 2, _nx_noop: 3, load_plugin_textdomain: 0,
  };
  // Strings/comments are tokens, so nested function calls and commas in prose
  // cannot turn a settings value into a translation-domain replacement.
  const tokens = [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[A-Za-z_][A-Za-z_0-9]*|[^\s]/g)];
  const edits: { start: number; end: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const domainIndex = indexes[tokens[i]![0]];
    if (domainIndex === undefined || tokens[i + 1]?.[0] !== '(') continue;
    let depth = 1;
    let argument = 0;
    for (let j = i + 2; j < tokens.length; j++) {
      const token = tokens[j]![0];
      if (token === '(' || token === '[') depth++;
      if (token === ')' || token === ']') depth--;
      if (depth === 0) break;
      if (depth === 1 && token === ',') argument++;
      if (depth === 1 && argument === domainIndex && /^(['"])pixflow-design\1$/.test(token)) {
        edits.push({ start: tokens[j]!.index!, end: tokens[j]!.index! + token.length });
      }
    }
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + "'pixflow-ai'" + source.slice(edit.end);
  }
  return source;
}

/** Directory activation keeps the exact data migrations but has no private updater. */
export function directoryPluginEntry(source: string): string {
  const languageBootstrap = /    \$directory = is_dir\(PIXFLOW_DESIGN_PLUGIN_DIR \. 'languages'\) \? 'languages' : 'wordpress\/languages';\r?\n    load_plugin_textdomain\('pixflow-design', false, dirname\(plugin_basename\(PIXFLOW_DESIGN_PLUGIN_FILE\)\) \. '\/' \. \$directory\);/;
  if (!languageBootstrap.test(source)) throw new Error('Cannot identify website translation bootstrap.');
  source = source.replace(languageBootstrap, "    \\PixflowDesign\\WordPress\\Languages\\LanguagePackService::load_installed('pixflow-ai');");
  const start = source.indexOf('$pixflow_design_plugin_updater = new ');
  const end = source.indexOf('\\PixflowDesign\\WordPress\\Plugin::boot();', start);
  if (start < 0 || end < start) throw new Error('Cannot identify website updater activation block.');
  source = source.slice(0, start)
    + "register_activation_hook(__FILE__, static function (): void {\n    \\PixflowDesign\\WordPress\\Plugin::activate();\n});\n\n"
    + source.slice(end);
  source = source.replace(/^ \* Update URI:.*\r?\n/m, '')
    .replace(/^ \* Text Domain:.*$/m, ' * Text Domain: pixflow-ai')
    .replace(/^ \* Tested up to:.*\r?\n/m, '')
    .replace(/^ \* Requires at least:.*$/m, ' * Requires at least: 6.2')
    .replace("define('PIXFLOW_DESIGN_VERSION',", "define('PIXFLOW_DESIGN_DISTRIBUTION', 'directory');\ndefine('PIXFLOW_DESIGN_VERSION',");
  return directoryTranslationDomains(source).replace(/\r\n?/g, '\n');
}

export async function assertDistributionAssets(directory: string, distribution: WordPressDistribution): Promise<void> {
  let marker: { distribution?: string };
  try { marker = JSON.parse(await readFile(join(directory, 'distribution.json'), 'utf8')); }
  catch (error) {
    if (distribution === 'website' && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new Error(`Build ${distribution} web assets before packaging.`, { cause: error });
  }
  if (marker.distribution !== distribution) throw new Error(`Refusing ${marker.distribution} assets in ${distribution} package.`);
}

export async function prepareDirectoryPhp(directory: string, entryFile: string): Promise<void> {
  await rm(join(directory, 'src/Admin/PluginUpdater.php'), { force: true });
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && entry.name.endsWith('.php')) {
        const before = await readFile(file, 'utf8');
        const after = file === join(directory, entryFile) ? directoryPluginEntry(before) : directoryTranslationDomains(before);
        if (after !== before) await writeFile(file, after);
      }
    }
  }
  await visit(directory);
}
