/** Standalone Free source snapshot rebuilder. Copied to the directory package. */
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, cp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface SnapshotInput {
  file: string;
  registry?: { name: string; version: string; path: string; sha256: string };
  loader: esbuild.Loader;
  imports: { path: string; original?: string; external?: boolean }[];
}
interface SnapshotRecipe {
  schema: number;
  name: string;
  esbuild: string;
  inputs: Record<string, SnapshotInput>;
  entryPoints: Record<string, string>;
  options: esbuild.BuildOptions;
  outputs: esbuild.Metafile['outputs'];
}

const project = dirname(fileURLToPath(import.meta.url));
const { scopeCssForWordPress } = await import(pathToFileURL(join(project, 'css-scope.ts')).href);
const destination = resolve(process.argv[2] ?? join(project, 'rebuilt-assets'));
await mkdir(destination, { recursive: true });
const filenames = (await readdir(project)).filter(file => file.endsWith('.json') && !['package.json', 'package-lock.json'].includes(file));
for (const filename of filenames) {
  const recipe = JSON.parse(await readFile(join(project, filename), 'utf8')) as SnapshotRecipe;
  if (recipe.schema !== 1 || !recipe.inputs) continue;
  if (recipe.esbuild !== esbuild.version) throw new Error(`Use pinned esbuild ${recipe.esbuild}; found ${esbuild.version}.`);
  const outdir = recipe.options.outdir ? join(destination, recipe.options.outdir) : undefined;
  const outfile = recipe.options.outfile ? join(destination, recipe.options.outfile) : undefined;
  const result = await esbuild.build({ ...recipe.options, ...(outdir ? { outdir } : {}), ...(outfile ? { outfile } : {}), entryPoints: recipe.entryPoints,
    jsx: 'automatic', tsconfigRaw: { compilerOptions: { jsx: 'react-jsx', target: 'ES2022', useDefineForClassFields: true } },
    plugins: [{ name: 'captured-free-inputs', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (args.kind === 'entry-point') {
          if (!recipe.inputs[args.path]) throw new Error(`Missing entry input ${args.path}`);
          return { path: args.path, namespace: 'snapshot' };
        }
        const input = recipe.inputs[args.importer];
        const dependency = input?.imports.find(item => item.original === args.path || item.path === args.path);
        if (!dependency) throw new Error(`Missing captured dependency ${args.path} from ${args.importer}`);
        return dependency.external ? { path: dependency.path, external: true }
          : { path: dependency.path, namespace: 'snapshot' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'snapshot' }, async args => {
        const input = recipe.inputs[args.path];
        if (!input) throw new Error(`Missing source ${args.path}`);
        let contents: Buffer;
        if (input.registry) {
          const dep = input.registry;
          if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(dep.name) || dep.path.split(/[\\/]/).some(part => part === '..' || part === '.') || /^(?:[\\/]|[a-z]:)/i.test(dep.path)) throw new Error('Unsafe dependency source path.');
          const directory = join(project, 'node_modules', dep.name);
          const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
          if (manifest.name !== dep.name || manifest.version !== dep.version) throw new Error(`Wrong source dependency version: ${dep.name}`);
          contents = await readFile(join(directory, dep.path));
          if (createHash('sha256').update(contents).digest('hex') !== dep.sha256) throw new Error(`Dependency source bytes changed: ${args.path}`);
        } else contents = await readFile(join(project, input.file));
        return { contents, loader: input.loader };
      });
    } }],
  });
  if (!result.metafile) throw new Error('Missing rebuild metadata.');
  if (recipe.name === 'lazy') {
    const original = JSON.parse(await readFile(join(project, 'static-assets/lazy/manifest.json'), 'utf8'));
    const replacements: Record<string, string> = {};
    for (const [path, output] of Object.entries(recipe.outputs)) {
      if (!output.entryPoint) continue;
      const replacement = Object.entries(result.metafile.outputs).find(([, item]) => item.entryPoint === `snapshot:${output.entryPoint}` || item.entryPoint === output.entryPoint);
      if (replacement) replacements[path.split('/lazy/').pop()!] = replacement[0].replaceAll('\\', '/').split('/lazy/').pop()!;
    }
    for (const [key, value] of Object.entries(original.modules)) {
      const next = replacements[value as string];
      if (!next) throw new Error(`Lazy output was not rebuilt: ${value}`);
      original.modules[key] = next;
    }
    await mkdir(join(destination, 'lazy'), { recursive: true });
    await writeFile(join(destination, 'lazy/manifest.json'), JSON.stringify(original));
  }
}

// Original static icons and the exact lazy import manifest accompany the input
// graph; derived revisions are regenerated below after every bundle is written.
await cp(join(project, 'static-assets'), destination, { recursive: true,
  filter: source => !source.replaceAll('\\', '/').endsWith('/lazy/manifest.json'),
});
const revisions: Record<string, { sha256: string; size: number }> = {};
for (const entry of await readdir(destination, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(?:js|css)$/.test(entry.name)) continue;
  if (entry.name.endsWith('.css')) {
    await writeFile(join(destination, entry.name), scopeCssForWordPress(await readFile(join(destination, entry.name), 'utf8')));
  }
  const bytes = await readFile(join(destination, entry.name));
  revisions[entry.name] = { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
}
await writeFile(join(destination, 'asset-revisions.json'), JSON.stringify({ version: 1, files: revisions }) + '\n');
console.log(`Rebuilt Free source graph in ${destination}`);
