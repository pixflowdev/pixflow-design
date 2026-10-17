import { directorySourceBuild } from './wordpress-directory-source.ts';
import * as esbuild from 'esbuild';
import ts from 'typescript';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve, relative, join } from 'node:path';

export function dynamicImports(source: string, filename: string): Array<{ start: number; end: number; specifier: string }> {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const results: Array<{ start: number; end: number; specifier: string }> = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]!)) {
      results.push({ start: node.getStart(tree), end: node.end, specifier: node.arguments[0]!.text });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return results;
}

/** Keep the WordPress global/factory boundary while extracting its explicitly lazy data imports. */
export async function buildWordPressLazyAssets(root: string, outdir: string, distribution: 'website' | 'directory' = 'website'): Promise<esbuild.Plugin> {
  const requireWeb = createRequire(join(root, 'apps/web/package.json'));
  const files = ['runtime/shiki.ts']
    .map(file => join(root, 'apps/web/src', file));
  const sources = new Map<string, string>();
  const imports = new Map<string, ReturnType<typeof dynamicImports>>();
  const targets = new Map<string, string>();
  const keys = new Map<string, string>();
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    sources.set(file, source);
    const found = dynamicImports(source, file);
    imports.set(file, found);
    for (const item of found) {
      const target = item.specifier.startsWith('.')
        ? resolve(dirname(file), `${item.specifier}.ts`) : requireWeb.resolve(item.specifier);
      targets.set(`${file}:${item.specifier}`, target);
      keys.set(target, item.specifier.startsWith('.')
        ? relative(join(root, 'apps/web/src'), target).replaceAll('\\', '/').replace(/\.ts$/, '') : item.specifier);
    }
  }
  const entries = Object.fromEntries([...new Set(targets.values())].map((file, index) => [`module-${index}`, file]));
  const build = await directorySourceBuild(root, 'lazy', { entryPoints: entries, outdir, bundle: true, splitting: true,
    format: 'esm', platform: 'browser', target: 'es2020', minify: distribution !== 'directory', metafile: true,
    entryNames: '[name]-[hash]', chunkNames: 'chunks/[name]-[hash]',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.VSCODE_TEXTMATE_DEBUG': 'false' },
    logLevel: 'silent' });
  const outputs = new Map<string, string>();
  for (const [file, info] of Object.entries(build.metafile.outputs)) {
    if (info.entryPoint) outputs.set(resolve(info.entryPoint), relative(outdir, resolve(file)).replaceAll('\\', '/'));
  }
  await writeFile(join(outdir, 'manifest.json'), JSON.stringify({ schema: 1,
    modules: Object.fromEntries([...outputs].filter(([target]) => keys.has(target)).map(([target, output]) => [keys.get(target), output])) }));
  return {
    name: 'wordpress-lazy-data',
    setup(build) {
      build.onLoad({ filter: /(?:locale-loaders|content-loaders)\.ts$/ }, args => {
        const directory = join(root, 'apps/web/src/i18n');
        if (![join(directory, 'locale-loaders.ts'), join(directory, 'content-loaders.ts')].includes(args.path)) return null;
        const catalogue = args.path.endsWith('content-loaders.ts');
        const locales = ['id', 'de', 'zh-CN', 'zh-TW', 'pt-BR', 'es-ES', 'ru', 'fa', 'ar', 'ja', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'it'];
        const entries = locales.map(locale => `${JSON.stringify(locale)}: () => loadInstalledLanguage(${JSON.stringify(locale)}).then(pack => pack.${catalogue ? 'content' : 'dictionary'})`).join(',');
        return { contents: `import { loadInstalledLanguage } from ${JSON.stringify(join(root, 'apps/web/src/pixflow/language-packs.ts'))}; export const ${catalogue ? 'CONTENT_LOADERS' : 'LOCALE_LOADERS'} = {${entries}};`, loader: 'ts', resolveDir: directory };
      });
      build.onLoad({ filter: /(?:locale-loaders|content-loaders|shiki)\.ts$/ }, args => {
        let source = sources.get(args.path);
        if (source === undefined) return null;
        for (const item of [...(imports.get(args.path) || [])].reverse()) {
          const target = targets.get(`${args.path}:${item.specifier}`)!;
          const output = outputs.get(target);
          if (!output) throw new Error(`Missing lazy output for ${target}`);
          source = source.slice(0, item.start) + `loadPixflowLazyModule(${JSON.stringify(keys.get(target))})` + source.slice(item.end);
        }
        source = `import { loadPixflowLazyModule } from ${JSON.stringify(join(root, 'apps/web/src/pixflow/lazy-modules.ts'))};\n${source}`;
        return { contents: source, loader: 'ts', resolveDir: dirname(args.path) };
      });
    },
  };
}

/** Build-time hashes avoid reading multi-megabyte bundles on each PHP request. */
export async function writeAssetRevisions(directory: string): Promise<void> {
  const files: Record<string, { sha256: string; size: number }> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:js|css)$/.test(entry.name)) continue;
    const content = await readFile(join(directory, entry.name));
    files[entry.name] = { sha256: createHash('sha256').update(content).digest('hex'), size: content.length };
  }
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'asset-revisions.json'), `${JSON.stringify({ version: 1, files })}\n`);
}
