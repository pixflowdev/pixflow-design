import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Plugin, BuildOptions, BuildResult } from 'esbuild';

export const WORDPRESS_BUILD_CONTRACT = 1;
export interface WordPressWebBuildOptions {
  target?: 'free' | 'pro';
  proRoot?: string;
  outdir?: string;
}

/** Public build API v1. Feature entrypoints and recipes remain Pro-owned. */
export interface WordPressProBuildHost {
  root: string;
  proRoot: string;
  buildWorkdir: string;
  webPublicDir: string;
  distribution: 'website' | 'directory';
  sharedRuntimePlugin: Plugin;
  retiredSurfaces: Plugin;
  sharedIconStyles: Plugin;
  sharedDataPlugin: Plugin;
  sharedWordPressStyles: Plugin;
  lazyDataPlugin: Plugin;
  workspaceSharedModules: Readonly<Record<string, string>>;
  buildWithDirectorySource(options: BuildOptions): Promise<BuildResult>;
}

/** Pro is an explicit development dependency. Free never discovers a sibling checkout. */
export function resolveWordPressBuild(root: string, options: WordPressWebBuildOptions = {}) {
  const target = options.target ?? 'free';
  if (target !== 'free' && target !== 'pro') throw new Error(`Unknown WordPress build target: ${target}`);
  if (target === 'free') return { target, proRoot: undefined, outdir: options.outdir && resolve(options.outdir) };
  const configured = options.proRoot ?? process.env.PIXFLOW_DESIGN_PRO_ROOT;
  if (!configured) throw new Error('Pro builds require --pro-root or PIXFLOW_DESIGN_PRO_ROOT pointing at an explicit Pro checkout.');
  const proRoot = resolve(configured);
  const manifest = JSON.parse(readFileSync(join(proRoot, 'pixflow-pro.json'), 'utf8'));
  if (manifest.buildContract !== WORDPRESS_BUILD_CONTRACT) throw new Error(`Unsupported Pro build contract: ${manifest.buildContract}`);
  const moduleApi = Number(/API_VERSION\s*=\s*(\d+)/.exec(readFileSync(join(root, 'wordpress/src/Modules/ModuleHost.php'), 'utf8'))?.[1]);
  if (!moduleApi || manifest.core?.moduleApi !== moduleApi) throw new Error(`Incompatible Pro checkout: core module API ${moduleApi}, Pro requires ${manifest.core?.moduleApi}.`);
  if (manifest.core.minimumVersion) {
    const version = /Version:\s*([^\r\n]+)/.exec(readFileSync(join(root, 'pixflow-design.php'), 'utf8'))?.[1]?.trim();
    const parse = (value: unknown): number[] => {
      if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(value)) throw new Error(`Invalid core compatibility version: ${value}`);
      return value.split(/[.+-]/).slice(0, 3).map(Number);
    };
    const current = parse(version);
    const minimum = parse(manifest.core.minimumVersion);
    const difference = current.map((part, index) => part - minimum[index]!).find(part => part !== 0) ?? 0;
    if (difference < 0 || (difference === 0 && version!.includes('-') && !manifest.core.minimumVersion.includes('-'))) {
      throw new Error(`Incompatible core version: ${version}; Pro requires ${manifest.core.minimumVersion} or newer.`);
    }
  }
  if (!existsSync(join(proRoot, 'scripts/wordpress-web-build.ts'))) throw new Error('Pro checkout is missing its web build recipe.');
  return { target, proRoot, outdir: resolve(options.outdir ?? join(proRoot, '.tmp/build/wordpress-pro/assets/app')) };
}

export function parseWordPressWebBuildArguments(args: string[]): WordPressWebBuildOptions {
  const result: WordPressWebBuildOptions = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--target') {
      if (value !== 'free' && value !== 'pro') throw new Error(`Unknown WordPress build target: ${value}`);
      result.target = value;
    } else if (flag === '--pro-root') result.proRoot = value;
    else if (flag === '--outdir') result.outdir = value;
    else throw new Error(`Unknown WordPress build option: ${flag}`);
  }
  return result;
}

/** Shared source has one owner. Pro imports this named development API. */
export function wordpressCoreSource(root: string): Plugin {
  return {
    name: 'pixflow-core-source-api',
    setup(build) {
      build.onResolve({ filter: /^@pixflow-design\/core\// }, async args => {
        const suffix = args.path.slice('@pixflow-design/core/'.length);
        const segments = suffix.split(/[\\/]/);
        if (segments.includes('..') || segments[0] === 'pro') throw new Error(`Invalid core source import: ${args.path}`);
        return build.resolve(join(root, 'apps/web/src', suffix), { kind: args.kind, resolveDir: root });
      });
    },
  };
}
