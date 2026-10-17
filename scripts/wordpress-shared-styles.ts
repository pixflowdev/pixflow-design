import type { Plugin } from 'esbuild';
import { join, resolve } from 'node:path';

/**
 * WordPress Pro clients always mount inside the Free host, whose stylesheet
 * supplies RemixIcon's font face and glyph catalogue. Keep a single owner for
 * that complete stylesheet rather than deleting matching rules out of a
 * compiled cascade. Component styles and their CSS-module names stay intact.
 *
 * This plugin is for Pro WordPress builds only: never apply it to Free or the
 * standalone app. It deliberately recognizes one repository-owned file, not
 * arbitrary third-party stylesheets with the same basename.
 */
export function reuseWordPressHostIconStyles(root: string): Plugin {
  const sharedIconStyles = resolve(join(root, 'apps/web/src/styles/remixicon/remixicon.css'));
  return {
    name: 'wordpress-pro-host-icon-styles',
    setup(build) {
      build.onLoad({ filter: /[/\\]remixicon\.css$/ }, args => {
        if (resolve(args.path) !== sharedIconStyles) return undefined;
        return {
          contents: '/* RemixIcon is supplied by the Free WordPress host stylesheet. */',
          loader: 'css',
        };
      });
    },
  };
}

/** Complete global CSS entrypoints owned by the Free WordPress host. */
export const WORDPRESS_HOST_GLOBAL_STYLE_ENTRIES = [
  'apps/web/src/pixflow/wordpress-shared.css',
  'apps/web/src/styles/home/wordpress-shared.css',
] as const;

/**
 * Apply the host's global baseline once, before the Pro component styles.
 *
 * Free already enqueues these global styles on admin and native builder
 * documents. Re-emitting the entries in a Pro bundle replays base/reset rules
 * after its component styles. The canonical order is the Free baseline followed
 * by each feature's own styles; this plugin enforces source ownership, not
 * text-based rule deduplication. It never handles CSS Modules, individual global
 * files imported directly by a feature, or Pro-owned stylesheets.
 *
 * Native panels use the same document, not an isolated stylesheet-free frame.
 * An isolated future host must load Free's stylesheet before mounting Pro.
 */
export function reuseWordPressHostStyles(root: string): Plugin {
  const entries = new Set(WORDPRESS_HOST_GLOBAL_STYLE_ENTRIES.map(path => resolve(root, path)));
  entries.add(resolve(root, 'apps/web/src/styles/remixicon/remixicon.css'));
  return {
    name: 'wordpress-pro-host-styles',
    setup(build) {
      build.onLoad({ filter: /\.css$/ }, args => {
        if (!entries.has(resolve(args.path))) return undefined;
        return { contents: '/* Shared global styles are supplied by the Free WordPress host. */', loader: 'css' };
      });
    },
  };
}
