import { directorySourceBuild } from './wordpress-directory-source.ts';
import { build, type Plugin } from 'esbuild';
import { join } from 'node:path';
import { createRequire } from 'node:module';

export const WORDPRESS_SHARED_RUNTIME_MODULES = [
  'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime',
  'motion/react', 'zod',
] as const;

/** One renderer/dispatcher and vendor implementation per WordPress document.
 * Context-bearing Pixflow modules remain supplied by the existing host factories.
 * Standalone builds never use this plugin or depend on this browser registry. */
export async function buildWordPressSharedRuntime(root: string, outdir: string, distribution: 'website' | 'directory' = 'website'): Promise<Plugin> {
  const contractRequire = createRequire(join(root, 'packages/contracts/package.json'));
  await directorySourceBuild(root, 'pixflow-shared-runtime', {
    stdin: {
      contents: `
        export const monochromeProviderArtwork = ${distribution === 'directory'};
        import React from 'react';
        import ReactDOM from 'react-dom';
        import ReactDOMClient from 'react-dom/client';
        import JSXRuntime from 'react/jsx-runtime';
        import { AnimatePresence, MotionConfig, motion } from 'motion/react';
        import { z } from 'zod';
        export const modules = Object.freeze({
          react: React, 'react-dom': ReactDOM, 'react-dom/client': ReactDOMClient,
          'react/jsx-runtime': JSXRuntime,
          'motion/react': Object.freeze({ AnimatePresence, MotionConfig, motion }),
          zod: Object.freeze({ z }),
        });
      `,
      resolveDir: join(root, 'apps/web'),
      sourcefile: 'pixflow-shared-runtime-entry.ts', loader: 'ts',
    },
    outfile: join(outdir, 'pixflow-shared-runtime.js'),
    bundle: true, format: 'iife', globalName: 'PixflowSharedRuntime',
    platform: 'browser', target: ['es2020'], minify: distribution !== 'directory',
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'eof',
    alias: { zod: contractRequire.resolve('zod') },
    // All imports, including Motion's internal hooks, must use WordPress's
    // dispatcher in directory builds. Never ship a second renderer as fallback.
    plugins: distribution === 'directory' ? [wordpressNativeReact()] : [],
  });
  const names = new Set<string>(WORDPRESS_SHARED_RUNTIME_MODULES);
  return {
    name: 'wordpress-shared-vendor-runtime',
    setup(builder) {
      builder.onResolve({ filter: /^(?:react(?:-dom)?(?:\/.*)?|motion\/react|zod)$/ }, args => (
        names.has(args.path) ? { path: args.path, namespace: 'pixflow-shared-vendor' } : null
      ));
      builder.onLoad({ filter: /.*/, namespace: 'pixflow-shared-vendor' }, args => {
        // Explicit ESM exports make unsupported Motion/Zod APIs fail at build
        // time, while CommonJS preserves React's native default interoperability.
        const exports = args.path === 'motion/react'
          ? 'export const { AnimatePresence, MotionConfig, motion } = value;'
          : args.path === 'zod' ? 'export const { z } = value;' : 'module.exports = value;';
        return {
          loader: 'js',
          contents: `const value = globalThis.PixflowSharedRuntime?.modules[${JSON.stringify(args.path)}];
            if (!value) throw new Error("Pixflow shared runtime has not loaded: " + ${JSON.stringify(args.path)});
            ${exports}`,
        };
      });
    },
  };
}

function wordpressNativeReact(): Plugin {
  return {
    name: 'wordpress-native-react',
    setup(builder) {
      builder.onResolve({ filter: /^(?:react|react-dom|react-dom\/client|react\/jsx-runtime)$/ }, args => ({
        path: args.path, namespace: 'pixflow-wordpress-react',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'pixflow-wordpress-react' }, args => {
        const value = args.path === 'react' ? 'React'
          : args.path === 'react-dom' ? 'globalThis.ReactDOM'
          : args.path === 'react-dom/client' ? '{ createRoot: element.createRoot, hydrateRoot: element.hydrateRoot }'
          : `{ Fragment: React.Fragment, jsx, jsxs }`;
        return { loader: 'js', contents: `
          const React = globalThis.React;
          const element = globalThis.wp?.element;
          if (!React || typeof React.useId !== 'function' || typeof element?.createRoot !== 'function') {
            throw new Error('Pixflow requires the WordPress 6.2 or newer React runtime.');
          }
          // WordPress 6.2 predates the react-jsx-runtime script handle. Convert
          // automatic JSX to its native createElement without bundling React.
          function jsx(type, props, key) {
            const config = key === undefined ? props : { ...props, key };
            return props && Object.prototype.hasOwnProperty.call(props, 'children')
              ? React.createElement(type, config, props.children)
              : React.createElement(type, config);
          }
          // The automatic runtime marks these children as a static tuple.
          // Spread only jsxs tuples so React does not demand list keys for
          // ordinary adjacent JSX, while dynamic jsx arrays retain validation.
          function jsxs(type, props, key) {
            if (!Array.isArray(props?.children)) return jsx(type, props, key);
            return React.createElement(type, key === undefined ? props : { ...props, key }, ...props.children);
          }
          module.exports = ${value};
        ` };
      });
    },
  };
}
