import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('targeted syntax bundle preserves every supported grammar, alias and both themes', async () => {
  const requireWeb = createRequire(resolve('apps/web/package.json'));
  // The old web bundle omits rust/go/java even though Pixflow requested them,
  // making initialization fail. Full is a test-only reference for the intended
  // set; it is never shipped by the targeted implementation.
  const original = await import(pathToFileURL(requireWeb.resolve('shiki/bundle/full')).href);
  const targeted = await import(pathToFileURL(resolve('apps/web/src/runtime/shiki-bundle.ts')).href);
  const langs = ['javascript', 'typescript', 'tsx', 'jsx', 'html', 'css', 'json', 'python', 'bash', 'shell', 'markdown', 'yaml', 'sql', 'rust', 'go', 'java', 'c', 'cpp', 'swift', 'ruby', 'php', 'diff', 'toml', 'xml', 'graphql', 'dockerfile'];
  const themes = ['github-light-default', 'github-dark-default'];
  const before = await original.createHighlighter({ langs, themes });
  const after = await targeted.createHighlighter();
  try {
    assert.deepEqual(after.getLoadedLanguages().sort(), before.getLoadedLanguages().sort());
    assert.deepEqual(after.getLoadedThemes().sort(), themes.sort());
    for (const lang of before.getLoadedLanguages()) {
      for (const theme of themes) {
        const code = '<style>.card { color: red; }</style>\n<script>const message = "hello";</script>\n<?php echo $value; ?>\n# Title\n```js\nconst x = 1;\n```';
        assert.equal(after.codeToHtml(code, { lang, theme }), before.codeToHtml(code, { lang, theme }), `${lang}/${theme}`);
      }
    }
  } finally { before.dispose(); after.dispose(); }
});
