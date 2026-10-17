import { directorySourceBuild } from './wordpress-directory-source.ts';
import { build, type Plugin } from 'esbuild';
import { join, resolve } from 'node:path';

/** English is immutable application data, shared even by independent React roots. */
export async function buildWordPressSharedData(root: string, outdir: string, distribution: 'website' | 'directory' = 'website'): Promise<Plugin> {
  const source = join(root, 'apps/web/src/i18n/locales/en.ts');
  await directorySourceBuild(root, 'pixflow-english', {
    entryPoints: [source], outfile: join(outdir, 'pixflow-english.js'),
    bundle: true, format: 'iife', globalName: 'PixflowEnglish',
    platform: 'browser', target: ['es2020'], minify: distribution !== 'directory',
  });
  return {
    name: 'wordpress-shared-english',
    setup(builder) {
      builder.onLoad({ filter: /[\\/]i18n[\\/]locales[\\/]en\.ts$/ }, args => {
        if (resolve(args.path) !== resolve(source)) return null;
        return {
          loader: 'js',
          contents: 'const en = globalThis.PixflowEnglish?.en; if (!en) throw new Error("Pixflow shared English data has not loaded."); export { en };',
        };
      });
    },
  };
}
