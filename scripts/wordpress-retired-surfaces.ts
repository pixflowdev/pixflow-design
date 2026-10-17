import type { Plugin } from 'esbuild';
import { join, resolve } from 'node:path';

/** Catalogue screens whose WordPress routes/settings were retired. Context
 * inspectors are deliberately excluded: existing chats may still use them. */
export const RETIRED_WORDPRESS_SURFACES = [
  'MarketplaceView',
  'PluginDetailView',
  'PluginsView',
  'PixflowResourcesSection',
  'BridgeConnectorSection',
] as const;

/** Exclude unreachable catalogue trees from WordPress packages only. The normal
 * Next/desktop build keeps the original implementations and their behaviour. */
export function wordpressRetiredSurfaces(root: string): Plugin {
  const components = join(root, 'apps/web/src/components');
  const modules = new Map(RETIRED_WORDPRESS_SURFACES.flatMap(name => [
    [join(components, name), name] as const,
    [join(components, `${name}.tsx`), name] as const,
  ]));
  return {
    name: 'wordpress-retired-catalogue-surfaces',
    setup(build) {
      build.onResolve({ filter: /composio-standalone(?:\.ts)?$/ }, args => (
        resolve(args.resolveDir, args.path).replace(/\.ts$/, '') === join(root, 'apps/web/src/pixflow/composio-standalone')
          ? { path: 'composio-standalone', namespace: 'pixflow-retired-catalogue' } : null
      ));
      build.onResolve({ filter: /(?:MarketplaceView|PluginDetailView|PluginsView|PixflowResourcesSection|BridgeConnectorSection)(?:\.tsx)?$/ }, args => {
        const name = modules.get(resolve(args.resolveDir, args.path));
        return name ? { path: name, namespace: 'pixflow-retired-catalogue' } : null;
      });
      build.onLoad({ filter: /.*/, namespace: 'pixflow-retired-catalogue' }, args => ({
        contents: args.path === 'composio-standalone' ? 'export function standaloneComposio() { return undefined; }' : `export function ${args.path}() { return null; }`,
        loader: 'js',
      }));
    },
  };
}
