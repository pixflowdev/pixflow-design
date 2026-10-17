import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { sourceRegistryDependency } from './wordpress-directory-source-dependencies.ts';

/** Capture the exact Free graph, including virtual replacements, without copying Pro modules. */
export async function directorySourceBuild(root: string, name: string, options: esbuild.BuildOptions): Promise<esbuild.BuildResult<{ metafile: true }>> {
  if (process.env.PIXFLOW_DESIGN_WORDPRESS_DISTRIBUTION !== 'directory') {
    return esbuild.build({ ...options, metafile: true });
  }
  const captured = new Map<string, { contents: string | Uint8Array; loader?: esbuild.Loader | undefined }>();
  const normalize = (path: string, namespace = 'file'): string => namespace === 'file'
    ? relative(root, path).replaceAll('\\', '/') : `${namespace}:${path}`;
  const plugins = (options.plugins ?? []).map(plugin => ({
    name: plugin.name,
    setup(builder: esbuild.PluginBuild) {
      const proxy = new Proxy(builder, { get(target, property) {
        if (property !== 'onLoad') return Reflect.get(target, property);
        return (settings: esbuild.OnLoadOptions, callback: (args: esbuild.OnLoadArgs) => esbuild.OnLoadResult | null | undefined | Promise<esbuild.OnLoadResult | null | undefined>) => {
          builder.onLoad(settings, async args => {
            const result = await callback(args);
            if (result?.contents !== undefined) captured.set(normalize(args.path, args.namespace), { contents: result.contents, loader: result.loader });
            return result;
          });
        };
      } });
      plugin.setup(proxy);
    },
  }));
  const result = await esbuild.build({ ...options, plugins, metafile: true });
  const stdinKey = options.stdin ? normalize(resolve(options.stdin.resolveDir ?? root, options.stdin.sourcefile ?? '<stdin>')) : undefined;
  const project = join(root, '.tmp/wordpress-directory/source-project');
  await mkdir(join(project, 'inputs'), { recursive: true });
  const inputs: Record<string, { file: string; loader: esbuild.Loader; imports: esbuild.Metafile['inputs'][string]['imports'] }> = {};
  for (const [key, info] of Object.entries(result.metafile.inputs)) {
    if (/(?:^|\/)apps\/web\/src\/pro\//.test(key)) throw new Error(`Private Pro source in directory graph: ${key}`);
    let item = captured.get(key);
    if (!item && options.stdin && (key === options.stdin.sourcefile || key === '<stdin>' || key === stdinKey)) {
      item = { contents: options.stdin.contents, loader: options.stdin.loader };
    }
    if (!item) item = { contents: await readFile(resolve(root, key)) };
    const extension = extname(key).split('?')[0] ?? '';
    const inferred: Record<string, esbuild.Loader> = { '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'jsx', '.css': key.endsWith('.module.css') ? 'local-css' : 'css', '.json': 'json' };
    const loader = item.loader ?? options.loader?.[extension] ?? inferred[extension] ?? 'file';
    const bytes = typeof item.contents === 'string' ? Buffer.from(item.contents) : item.contents;
    const hash = createHash('sha256').update(bytes).digest('hex');
    const file = `inputs/${hash}${/^[.][a-z0-9]+$/i.test(extension) ? extension : '.txt'}`;
    await writeFile(join(project, file), bytes);
    inputs[key] = { file, loader, imports: info.imports };
  }
  const entryPoints: Record<string, string> = {};
  if (options.stdin) entryPoints[name] = Object.keys(inputs).find(key => key === stdinKey || key === options.stdin!.sourcefile || key === '<stdin>')!;
  else if (Array.isArray(options.entryPoints)) {
    for (const entry of options.entryPoints) {
      if (typeof entry !== 'string') throw new Error('Unsupported source snapshot entry shape.');
      entryPoints[options.outfile ? name : entry.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')] = normalize(resolve(root, entry));
    }
  } else {
    for (const [key, value] of Object.entries(options.entryPoints ?? {})) entryPoints[key] = normalize(resolve(root, value));
  }
  const { plugins: _plugins, stdin: _stdin, entryPoints: _entries, outfile: _outfile, outdir: _outdir, alias: _alias, ...serializable } = options;
  const recipe = { schema: 1, name, esbuild: esbuild.version, inputs, entryPoints,
    outputs: result.metafile.outputs,
    options: { ...serializable, absWorkingDir: undefined, metafile: true, write: true,
      ...(options.outfile ? { outfile: options.outfile.split(/[\\/]/).pop() } : {}),
      ...(options.outdir ? { outdir: name === 'lazy' ? 'lazy' : '.' } : {}),
    },
  };
  await writeFile(join(project, `${name}.json`), JSON.stringify(recipe, null, 2));
  return result;
}

/** Package only inputs referenced by current Free recipes; stale captures never ship. */
export async function packageDirectorySources(root: string, appAssets: string, destination: string): Promise<void> {
  const project = join(root, '.tmp/wordpress-directory/source-project');
  await mkdir(join(destination, 'inputs'), { recursive: true });
  const selected = new Set<string>();
  const recipeNames: string[] = [];
  const dependencies: Record<string, string> = { esbuild: esbuild.version, postcss: '8.5.23' };
  for (const name of await readdir(project)) {
    if (!name.endsWith('.json')) continue;
    const recipe = JSON.parse(await readFile(join(project, name), 'utf8'));
    if (recipe.schema !== 1 || !recipe.inputs) continue;
    for (const [key, input] of Object.entries(recipe.inputs) as [string, { file: string; registry?: Awaited<ReturnType<typeof sourceRegistryDependency>> }][]) {
      if (/(?:^|\/)apps\/web\/src\/pro\//.test(key)) throw new Error(`Pro input in Free source snapshot: ${key}`);
      const registry = await sourceRegistryDependency(root, key, await readFile(join(project, input.file)));
      if (registry) {
        if (dependencies[registry.name] && dependencies[registry.name] !== registry.version) throw new Error(`Conflicting pinned source versions for ${registry.name}`);
        dependencies[registry.name] = registry.version;
        input.registry = registry;
      } else selected.add(input.file);
    }
    recipeNames.push(name);
    await writeFile(join(destination, name), JSON.stringify(recipe, null, 2));
  }
  if (!recipeNames.includes('pixflow-design-app.json') || !recipeNames.includes('pixflow-shared-runtime.json') || !recipeNames.includes('lazy.json')) {
    throw new Error('Directory source snapshot is incomplete. Rebuild directory web assets.');
  }
  for (const file of selected) await cp(join(project, file), join(destination, file));
  await cp(join(root, 'scripts/wordpress-directory-rebuild.ts'), join(destination, 'rebuild.ts'));
  await cp(join(root, 'scripts/wordpress-language-scope.ts'), join(destination, 'wordpress-language-scope.ts'));
  const script = await readFile(join(root, 'scripts/build-wordpress-web.mjs'), 'utf8');
  const scopeStart = script.indexOf('function scopeCssForWordPress(css)');
  const scopeEnd = script.indexOf('// Directory snapshots', scopeStart);
  if (scopeStart < 0 || scopeEnd < scopeStart) throw new Error('Cannot locate CSS build transform.');
  const scope = script.slice(scopeStart, scopeEnd).replace('function scopeCssForWordPress(css)', 'export function scopeCssForWordPress(css)');
  await writeFile(join(destination, 'css-scope.ts'), `import postcss from 'postcss';\nimport { scopeWordPressLanguageSelector } from './wordpress-language-scope.ts';\nconst wordpressScopeSelector = ':where(#pixflow-design-root, #pixflow-design-overlay, .pixflow-design-token-scope, .pixflow-design-portal-scope, .pixflow-bricks-agent-shell)';\n${scope}`);
  await cp(appAssets, join(destination, 'static-assets'), { recursive: true,
    filter: path => !/\.(?:js|css)$/.test(path) && !path.endsWith('asset-revisions.json'),
  });
  await writeFile(join(destination, 'package.json'), JSON.stringify({
    name: 'pixflow-free-source', private: true, type: 'module', version: '2.0.4',
    scripts: { build: 'node rebuild.ts' }, engines: { node: '>=24' },
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
  }, null, 2) + '\n');
  const lock = JSON.parse(await readFile(join(root, 'wordpress/directory/source-package-lock.json'), 'utf8'));
  if (JSON.stringify(Object.entries(lock.packages[''].dependencies).sort()) !== JSON.stringify(Object.entries(dependencies).sort())) {
    throw new Error('Standalone source lock is stale: regenerate it from the emitted source/package.json.');
  }
  await cp(join(root, 'wordpress/directory/source-package-lock.json'), join(destination, 'package-lock.json'));
  await writeFile(join(destination, 'README.txt'), `Pixflow Free source snapshot\n\nThis contains original Pixflow source and resolved virtual build modules.\nRecipes map every original import to local inputs or exact public npm sources.\nNo private Pro implementation is included. Unmodified dependency sources are\nrestored by npm ci from pinned package versions and integrity-verified URLs.\nThe rebuild also verifies each dependency file SHA-256. Changed dependency\ninputs remain local. Original dependency licence notices accompany the plugin.\n\nUse Node 24: npm ci --ignore-scripts, then npm run build. The output is rebuilt-assets/.\nCSS is scoped to Pixflow roots. Lazy output names and asset revisions regenerate.\nThe PHP plugin and its static scripts are already readable source outside this\ndirectory; they do not require a JavaScript bundler. This snapshot rebuilds the\nFree browser assets without the private workspace repository or Pro add-on.\n\nSnapshot namespaces can change bundler identifiers and tree-shaking, so rebuilt\nfiles are not claimed byte-identical. Their imports, styles and data use the same\ncaptured inputs. Do not replace release files without running the plugin tests.\n\n${recipeNames.length} build recipes; ${selected.size} unique input files.\n`);
}
