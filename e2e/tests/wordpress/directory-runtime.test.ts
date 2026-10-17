import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { buildWordPressSharedRuntime } from '../../../scripts/wordpress-shared-runtime.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const requireWeb = createRequire(join(root, 'apps/web/package.json'));
const React = requireWeb('react');
const ReactDOM = requireWeb('react-dom');
const ReactDOMClient = requireWeb('react-dom/client');
async function expandLocalCss(path: string): Promise<string> {
  const source = await readFile(path, 'utf8');
  const imports = Array.from(source.matchAll(/@import\s+['"]([^'"]+)['"];?/g));
  let expanded = source;
  for (const match of imports) {
    const relative = match[1];
    if (relative?.startsWith('.')) expanded = expanded.replace(match[0], await expandLocalCss(resolve(dirname(path), relative)));
  }
  return expanded;
}
let temporary = '';
let directoryCode = '';
let websiteCode = '';
it('Free shared CSS retains bounded chat layout and shared controls independently of Composio', async () => {
  const css = await expandLocalCss(join(root, 'apps/web/src/pixflow/wordpress-shared.css'));
  const wrap = css.match(/\.chat-log-wrap\s*\{([^}]+)\}/)?.[1] ?? '';
  expect(wrap).toContain('display: flex');
  expect(wrap).toContain('flex: 1');
  expect(wrap).toContain('min-height: 0');
  expect(css).toContain('.chat-log-wrap .chat-log { flex: 1; }');
  expect(css).toContain('.chat-jump-btn-active');
  expect(css).toContain('.assistant-completion-row');
  expect(css).not.toContain('.settings-section-connectors-credentials.is-loading');
});
beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'pixflow-directory-runtime-'));
  await buildWordPressSharedRuntime(root, join(temporary, 'directory'), 'directory');
  await buildWordPressSharedRuntime(root, join(temporary, 'website'));
  directoryCode = await readFile(join(temporary, 'directory/pixflow-shared-runtime.js'), 'utf8');
  websiteCode = await readFile(join(temporary, 'website/pixflow-shared-runtime.js'), 'utf8');
});
afterAll(async () => {
  if (temporary && resolve(temporary).startsWith(resolve(tmpdir()) + sep + 'pixflow-directory-runtime-')) {
    await rm(temporary, { recursive: true, force: true });
  }
});

it('directory runtime uses the host dispatcher, renderer and hooks for every client', () => {
  const context = { React, ReactDOM, wp: { element: ReactDOMClient }, queueMicrotask, setTimeout, clearTimeout };
  const modules = runInNewContext(`${directoryCode}\nPixflowSharedRuntime.modules`, context);
  expect(runInNewContext(`${directoryCode}\nPixflowSharedRuntime.monochromeProviderArtwork`, context)).toBe(true);
  expect(modules.react).toBe(React);
  expect(modules['react-dom']).toBe(ReactDOM);
  expect(modules['react-dom/client'].createRoot).toBe(ReactDOMClient.createRoot);
  const element = modules['react/jsx-runtime'].jsx('div', { children: 'Preserved', title: 'Example' }, 'saved-key');
  expect(React.isValidElement(element)).toBe(true);
  expect(element.key).toBe('saved-key');
  expect(element.props.children).toBe('Preserved');
  expect(modules['motion/react'].motion.div).toBeDefined();
  expect(modules.zod.z.string().parse('value')).toBe('value');
  expect(directoryCode).not.toContain('react-dom.production.min.js');
  expect(directoryCode).not.toContain('react.production.min.js');
});

it('keeps static JSX children distinct from dynamic arrays without spurious key warnings', () => {
  const developmentReact = requireWeb(resolve(requireWeb.resolve('react'), '../cjs/react.development.js'));
  const context = { React: developmentReact, ReactDOM, wp: { element: ReactDOMClient }, queueMicrotask, setTimeout, clearTimeout };
  const modules = runInNewContext(`${directoryCode}\nPixflowSharedRuntime.modules`, context);
  const { jsx, jsxs } = modules['react/jsx-runtime'];
  const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const ref = developmentReact.createRef();
    const result = jsxs('section', { ref, children: [jsx('span', { children: 'One' }), jsx('span', { children: 'Two' })] }, 'stable');
    expect(result.key).toBe('stable');
    expect(result.ref).toBe(ref);
    expect(result.props.children.map((child: { props: { children: string } }) => child.props.children)).toEqual(['One', 'Two']);
    requireWeb('react-dom/server').renderToStaticMarkup(result);
    expect(warnings).not.toHaveBeenCalled();
    jsx('article', { children: [jsx('i', { children: 'Dynamic' }), jsx('i', { children: 'List' })] });
    expect(warnings.mock.calls.some(args => String(args[0]).includes('unique "key"'))).toBe(true);
  } finally {
    warnings.mockRestore();
  }
});

it('directory runtime rejects unsupported WordPress instead of installing a second React', () => {
  expect(() => runInNewContext(directoryCode, {})).toThrow('WordPress 6.2');
  expect(() => runInNewContext(directoryCode, { React: { version: '17.0.2' }, wp: { element: {} } })).toThrow('WordPress 6.2');
});

it('default website runtime stays self-contained without WordPress React handles', () => {
  const modules = runInNewContext(`${websiteCode}\nPixflowSharedRuntime.modules`, { queueMicrotask, setTimeout, clearTimeout });
  expect(modules.react.version).toMatch(/^18\./);
  expect(typeof modules['react-dom/client'].createRoot).toBe('function');
  expect(modules.react).not.toBe(React);
});

it('WordPress CSS never requests a remote font on startup', async () => {
  const css = await readFile(join(root, 'apps/web/src/pixflow/wordpress-shared.css'), 'utf8');
  expect(css).not.toMatch(/@import\s+url\(['"]?https?:/);
});
