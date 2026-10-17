import * as esbuild from 'esbuild';
import { parseWordPressWebBuildArguments, resolveWordPressBuild, wordpressCoreSource } from './wordpress-build-contract.ts';
import { directorySourceBuild } from './wordpress-directory-source.ts';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scopeWordPressLanguageSelector } from './wordpress-language-scope.ts';
import { buildWordPressLazyAssets, writeAssetRevisions } from './wordpress-lazy-assets.ts';
import { WORKSPACE_SHARED_MODULES } from './wordpress-workspace-shared-modules.ts';
import { buildWordPressTranslations } from './build-wordpress-translations.ts';
import { buildWordPressLanguagePacks } from './build-wordpress-language-packs.ts';
import { buildWordPressSharedData } from './wordpress-shared-data.ts';
import { reuseWordPressHostStyles } from './wordpress-shared-styles.ts';
import { wordpressRetiredSurfaces } from './wordpress-retired-surfaces.ts';
import { buildWordPressSharedRuntime } from './wordpress-shared-runtime.ts';
import { copyDirectoryLogoAssets } from './wordpress-directory-logo-assets.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function buildWordPressWeb(options = {}) {
const configuration = resolveWordPressBuild(root, options);
const proRoot = configuration.proRoot;
const target = configuration.target;
const requireFromWeb = createRequire(join(root, 'apps', 'web', 'package.json'));
const postcss = requireFromWeb('postcss');
const distribution = process.env.PIXFLOW_DESIGN_WORDPRESS_DISTRIBUTION || 'website';
if (!['website', 'directory'].includes(distribution)) throw new Error(`Unknown WordPress distribution: ${distribution}`);
// Directory output must never replace the website runtime or its updater build.
const outdir = configuration.outdir || (distribution === 'directory'
  ? join(root, '.tmp', 'wordpress-directory', 'assets', 'app')
  : join(root, 'wordpress', 'assets', 'app'));
const buildNonce = `${process.pid}-${Date.now()}`;
// Keep transient bundles out of source scans while the finished directory swaps.
const buildWorkdir = join(root, '.tmp', 'wordpress-web', buildNonce);
const stagingOutdir = join(buildWorkdir, 'app');
const entryPoint = join(root, 'apps', 'web', 'src', 'pixflow', 'wordpress-entry.tsx');
const webPublicDir = join(root, 'apps', 'web', 'public');
const wordpressScopeSelector = ':where(#pixflow-design-root, #pixflow-design-overlay, .pixflow-design-token-scope, .pixflow-design-portal-scope, .pixflow-bricks-agent-shell)';
const directoryIconStyles = {
  name: 'wordpress-directory-icon-license',
  setup(build) {
    if (distribution !== 'directory') return;
    const vendor = join(root, 'wordpress/directory/vendor/remixicon');
    build.onLoad({ filter: /[/\\]remixicon\.css$/ }, async args => {
      if (resolve(args.path) !== join(root, 'apps/web/src/styles/remixicon/remixicon.css')) return null;
      return { contents: await readFile(join(vendor, 'remixicon.css'), 'utf8'), loader: 'css', resolveDir: vendor };
    });
    build.onResolve({ filter: /^\/remixicon\.woff2$/ }, () => ({ path: join(vendor, 'remixicon.woff2') }));
  },
};
// The desktop/Next entry keeps the full cascade. WordPress Free and native
// panels consume only shared UI; the Pro Workspace owns its additional CSS.
const sharedWordPressStyles = {
  name: 'wordpress-shared-styles',
  setup(build) {
    build.onResolve({ filter: /(?:^|\/)index\.css$/ }, args => {
      const path = resolve(args.resolveDir, args.path);
      if (path === join(root, 'apps/web/src/index.css')) return { path: join(root, 'apps/web/src/pixflow/wordpress-shared.css') };
      if (path === join(root, 'apps/web/src/styles/home/index.css')) return { path: join(root, 'apps/web/src/styles/home/wordpress-shared.css') };
      return null;
    });
  },
};

await removeDirectory(stagingOutdir);
await mkdir(stagingOutdir, { recursive: true });

try {
  if (target === 'free') {
    const languageRoot = configuration.outdir ? join(buildWorkdir, 'languages') : undefined;
    await buildWordPressTranslations(false, { outputRoot: languageRoot });
    await buildWordPressLanguagePacks(root, resolve(process.env.PIXFLOW_LANGUAGE_OUTPUT_DIR || join(root, '.tmp/language-packs')), { languageRoot, writeManifest: !configuration.outdir });
  }
  const lazyDataPlugin = await buildWordPressLazyAssets(root, join(stagingOutdir, 'lazy'), distribution);
  const sharedDataPlugin = await buildWordPressSharedData(root, stagingOutdir, distribution);
  const sharedRuntimePlugin = await buildWordPressSharedRuntime(root, stagingOutdir, distribution);
  await writeFile(join(stagingOutdir, 'distribution.json'), JSON.stringify({ distribution }) + '\n');
  const sharedIconStyles = reuseWordPressHostStyles(root);
  const retiredSurfaces = wordpressRetiredSurfaces(root);
  if (target === 'free') {
  const coreBuild = await buildWithDirectorySource({
    entryPoints: {
      'pixflow-design-app': entryPoint,
    },
    bundle: true,
    metafile: true,
    outdir: stagingOutdir,
    entryNames: '[name]',
    assetNames: 'assets/[name]-[hash]',
    format: 'iife',
    globalName: 'PixflowDesignAppBundle',
    platform: 'browser',
    target: ['es2020'],
    minify: distribution !== 'directory',
    sourcemap: false,
    logLevel: 'info',
    plugins: [sharedRuntimePlugin, retiredSurfaces, sharedDataPlugin, sharedWordPressStyles, lazyDataPlugin, directoryIconStyles,
      {
        name: 'wordpress-public-assets',
        setup(build) {
          build.onResolve({ filter: /^\/[^/]/ }, (args) => {
            const publicAssetPath = join(webPublicDir, args.path.slice(1));
            if (!existsSync(publicAssetPath)) return null;

            return { path: publicAssetPath };
          });
        },
      },
    ],
    loader: {
      '.gif': 'file',
      '.jpeg': 'file',
      '.jpg': 'file',
      '.png': 'file',
      '.svg': 'file',
      '.webp': 'file',
      '.woff': 'file',
      '.woff2': 'file',
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.NEXT_PUBLIC_NEWSLETTER_URL': '""',
      'process.env.OD_PREVIEW_KEEP_ALIVE': '"1"',
      'process.env.VSCODE_TEXTMATE_DEBUG': 'false',
    },
  });

  if (Object.keys(coreBuild.metafile.inputs).some(path => /apps[\\/]web[\\/]src[\\/]pro[\\/]/.test(path))) {
    throw new Error('Core bundle must not import Pro implementations.');
  }
  await mkdir(join(root, '.tmp/workspace-extraction'), { recursive: true });
  await writeFile(join(root, '.tmp/workspace-extraction/core-metafile.json'), JSON.stringify(coreBuild.metafile, null, 2));
  }
  if (target === 'free') {
  const gutenbergBuild = await buildWithDirectorySource({
    metafile: true,
    entryPoints: [join(root, 'apps/web/src/pixflow/gutenberg-editor-entry.ts')],
    plugins: [sharedRuntimePlugin, retiredSurfaces, sharedDataPlugin],
    outfile: join(stagingOutdir, 'pixflow-gutenberg-editor.js'),
    bundle: true, format: 'iife', platform: 'browser', target: ['es2020'], minify: distribution !== 'directory',
  });
  if (Object.keys(gutenbergBuild.metafile.inputs).some(path => /apps[\\/]web[\\/]src[\\/]pro[\\/]/.test(path))) throw new Error('Core Gutenberg must not import Pro implementations.');
  await scopeWordPressCssBundle(stagingOutdir);
  await buildWithDirectorySource({
    entryPoints: [join(root, 'apps/web/src/pixflow/editor-save-guard-entry.ts')],
    plugins: [sharedRuntimePlugin],
    outfile: join(stagingOutdir, 'pixflow-editor-save-guard.js'),
    bundle: true, format: 'iife', platform: 'browser', target: ['es2020'], minify: distribution !== 'directory',
  });
  await buildWithDirectorySource({
    entryPoints: [join(root, 'apps/web/src/pixflow/pro-upgrade-notice-entry.ts')],
    plugins: [sharedRuntimePlugin],
    outfile: join(stagingOutdir, 'pixflow-pro-upgrade-notice.js'),
    bundle: true, format: 'iife', platform: 'browser', target: ['es2020'], minify: distribution !== 'directory',
  });

  // Pixflow-owned: runtime-built icon URLs are not static imports, so esbuild
  // cannot discover them. Copy the public marks into the WP app asset directory
  // for the WordPress-mounted workspace and Bricks Agent panel.
  if (distribution === 'directory') {
    await copyDirectoryLogoAssets(root, stagingOutdir);
  } else {
    await cp(join(webPublicDir, 'agent-icons'), join(stagingOutdir, 'agent-icons'), { recursive: true });
    await cp(join(webPublicDir, 'model-icons'), join(stagingOutdir, 'model-icons'), { recursive: true });
  }
  await cp(join(webPublicDir, 'app-icon.svg'), join(stagingOutdir, 'app-icon.svg'));

  }
  if (target === 'pro') {
    const recipe = await import(pathToFileURL(join(proRoot, 'scripts/wordpress-web-build.ts')).href);
    if (typeof recipe.buildProWeb !== 'function') throw new Error('Pro web recipe must export buildProWeb(host).');
    await recipe.buildProWeb({ root, proRoot, buildWorkdir, webPublicDir, distribution,
      sharedRuntimePlugin, retiredSurfaces, sharedIconStyles, sharedDataPlugin, sharedWordPressStyles, lazyDataPlugin,
      workspaceSharedModules: WORKSPACE_SHARED_MODULES, buildWithDirectorySource });
  await normalizeTrailingWhitespaceInWordPressJsBundle(join(buildWorkdir, 'pro-app'));
  await scopeWordPressCssBundle(join(buildWorkdir, 'pro-app'));
  // Shared language/syntax modules ship once in Free; every host uses its asset base.
  await writeAssetRevisions(join(buildWorkdir, 'pro-app'));
  await replaceDirectory(join(buildWorkdir, 'pro-app'), outdir);
  } else {
    await normalizeTrailingWhitespaceInWordPressJsBundle(stagingOutdir);
    await writeAssetRevisions(stagingOutdir);
    await replaceDirectory(stagingOutdir, outdir);
  }
} catch (error) {
  await removeDirectory(stagingOutdir).catch(() => {});
  throw error;
}

console.log(`Built WordPress ${target} bundle at ${relative(root, outdir).replaceAll('\\', '/')}`);
return { target, outdir };

async function normalizeTrailingWhitespaceInWordPressJsBundle(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map(async (entry) => {
      const jsPath = join(directory, entry.name);
      const source = await retryTransientFs(() => readFile(jsPath, 'utf8'));
      // esbuild preserves literal whitespace/newlines inside dependency template
      // strings. For each trailing whitespace run, ask the JS parser whether escaping it
      // is valid at that exact location. Valid escapes preserve template-literal
      // values; invalid escapes identify ordinary JS whitespace and are safely
      // removed. This never writes a backslash token into executable syntax.
      let normalized = source;
      let offset = 0;
      while (offset < normalized.length) {
        const match = /[ \t]+(?=\r?\n)/g;
        match.lastIndex = offset;
        const found = match.exec(normalized);
        if (!found) break;
        const index = found.index;
        const escaped = `${normalized.slice(0, index)}${found[0].replaceAll(' ', '\\x20').replaceAll('\t', '\\t')}${normalized.slice(index + found[0].length)}`;
        try {
          await esbuild.transform(escaped, { loader: 'js', target: 'es2020', logLevel: 'silent' });
          offset = index + escaped.length - normalized.length + found[0].length;
          normalized = escaped;
        } catch {
          normalized = `${normalized.slice(0, index)}${normalized.slice(index + found[0].length)}`;
          offset = index;
        }
      }
      await esbuild.transform(normalized, { loader: 'js', target: 'es2020', logLevel: 'silent' });
      if (/[ \t]+(?=\r?\n)/.test(normalized)) {
        throw new Error(`Generated JavaScript still contains trailing whitespace: ${relative(root, jsPath)}`);
      }
      if (normalized !== source) {
        await retryTransientFs(() => writeFile(jsPath, normalized));
      }
    }));
}

async function scopeWordPressCssBundle(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries
    // This isolated host stylesheet targets Gutenberg's own layout, outside
    // the Pixflow root. Every selector is gated by a Pixflow data attribute.
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css') && entry.name !== 'pixflow-gutenberg-editor.css')
    .map(async (entry) => {
      const cssPath = join(directory, entry.name);
      const css = await retryTransientFs(() => readFile(cssPath, 'utf8'));
      const scoped = scopeCssForWordPress(css);
      await retryTransientFs(() => writeFile(cssPath, scoped));
    }));
}

async function replaceDirectory(source, target) {
  await mkdir(dirname(target), { recursive: true });
  const backup = join(buildWorkdir, 'previous');
  await removeDirectory(backup);

  if (existsSync(target)) {
    await retryTransientFs(() => rename(target, backup));
  }

  try {
    await retryTransientFs(() => rename(source, target));
  } catch (error) {
    if (existsSync(backup) && !existsSync(target)) {
      await retryTransientFs(() => rename(backup, target));
    }
    throw error;
  }

  await removeDirectory(backup).catch((error) => {
    console.warn(`Built bundle installed, but the previous bundle could not be removed yet: ${error.message}`);
  });
}

async function removeDirectory(directory) {
  await rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 125,
  });
}

async function retryTransientFs(operation) {
  const transientCodes = new Set(['EACCES', 'EBUSY', 'ENOTEMPTY', 'EPERM', 'UNKNOWN']);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= 7 || !transientCodes.has(error && error.code)) {
        throw error;
      }
      await delay(75 * (attempt + 1));
    }
  }
}

function scopeCssForWordPress(css) {
  const ast = postcss.parse(css);
  ast.walkRules((rule) => {
    if (isInsideKeyframes(rule)) return;
    rule.selector = postcss.list
      .comma(rule.selector)
      .map((selector) => scopeSelectorForWordPress(selector.trim()))
      .join(',');
  });
  return ast.toString();
}

function isInsideKeyframes(rule) {
  let parent = rule.parent;
  while (parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return true;
    parent = parent.parent;
  }
  return false;
}

function scopeSelectorForWordPress(selector) {
  if (!selector || selector.startsWith(wordpressScopeSelector)) return selector;
  if (isAlreadyPixflowScoped(selector)) return selector;

  const normalized = selector.replace(/\s+/g, ' ');
  const scopedLanguage = scopeWordPressLanguageSelector(normalized, wordpressScopeSelector);
  if (scopedLanguage) return scopedLanguage;
  const scopedTheme = scopeThemeSelector(normalized);
  if (scopedTheme) return scopedTheme;

  return `${wordpressScopeSelector} ${selector}`;
}

function isAlreadyPixflowScoped(selector) {
  return /^(?:#pixflow-design-root|#pixflow-design-overlay|\.pixflow-design-token-scope|\.pixflow-design-portal-scope|\.pixflow-bricks-agent-shell)(?:[^\w-]|$)/.test(selector);
}

function scopeThemeSelector(selector) {
  const themePrefixMatch = selector.match(/^(\[data-theme=(?:"dark"|'dark'|dark|"light"|'light'|light)\])(\s+.+)$/);
  if (themePrefixMatch) {
    return `${wordpressScopeSelector}${themePrefixMatch[1]}${themePrefixMatch[2]}`;
  }

  const htmlNoThemeMatch = selector.match(/^html:not\(\[data-theme\]\)(\s+.+)?$/);
  if (htmlNoThemeMatch) {
    return `${wordpressScopeSelector}:not([data-theme])${htmlNoThemeMatch[1] ?? ''}`;
  }

  const htmlThemeMatch = selector.match(/^html(?:\.([A-Za-z0-9_-]+)|\[data-theme=(?:"([^"]+)"|'([^']+)'|([^\]]+))\])?(\s+.+)?$/);
  if (htmlThemeMatch) {
    const htmlClass = htmlThemeMatch[1] ? `.${htmlThemeMatch[1]}` : '';
    const dataTheme = htmlThemeMatch[2] ?? htmlThemeMatch[3] ?? htmlThemeMatch[4];
    const themeAttr = dataTheme ? `[data-theme=${JSON.stringify(dataTheme.trim())}]` : '';
    return `${wordpressScopeSelector}${htmlClass}${themeAttr}${htmlThemeMatch[5] ?? ''}`;
  }

  const rootMatch = selector.match(/^(?::root|body)(\s+.+)?$/);
  if (rootMatch) {
    return `${wordpressScopeSelector}${rootMatch[1] ?? ''}`;
  }

  return null;
}

// Directory snapshots contain only the Free graph, never private add-on modules.
async function buildWithDirectorySource(options) {
  const output = options.outfile || options.outdir || '';
  if (output.replaceAll('\\', '/').includes('/pro-app')) return esbuild.build({ ...options,
    absWorkingDir: root,
    nodePaths: [join(root, 'apps/web/node_modules'), join(root, 'node_modules')],
    plugins: [...(options.plugins || []), wordpressCoreSource(root)],
  });
  const name = options.outfile ? options.outfile.split(/[\\/]/).pop().replace(/\.[^.]+$/, '') : Object.keys(options.entryPoints)[0];
  return directorySourceBuild(root, name, options);
}

}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await buildWordPressWeb(parseWordPressWebBuildArguments(process.argv.slice(2)));
}
