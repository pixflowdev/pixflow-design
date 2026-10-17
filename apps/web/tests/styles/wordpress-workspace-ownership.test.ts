import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../src/', import.meta.url));
async function bundle(entries: string[]): Promise<string> {
  const result = await build({
    stdin: { contents: entries.map((entry) => `@import '${entry}';`).join('\n'), loader: 'css', resolveDir: root },
    bundle: true,
    write: false,
    outfile: 'styles.css',
    external: ['https://*', '*.woff', '*.woff2', '*.ttf', '*.eot', '*.svg'],
    logLevel: 'silent',
  });
  return result.outputFiles.find((file) => file.path.endsWith('.css'))!.text;
}

describe('WordPress stylesheet ownership', () => {
  it('keeps usable onboarding, settings and floating chat without loading Pro Workspace styles', async () => {
    const css = await bundle(['./pixflow/wordpress-shared.css', './styles/home/wordpress-shared.css']);
    for (const selector of ['.onboarding-view', '.avatar-popover', '.inline-switcher__select', '.caret-floating-layer', '.pixflow-bricks-agent-panel', '.entry-settings-menu', '.workspace-shell__body']) {
      expect(css.includes(selector), selector).toBe(true);
    }
    for (const selector of ['.entry-nav-rail {', '.workspace-tabs-strip {', '.home-hero__input-card', '.plugins-home {', '.pixflow-template-library {', '.df-panel {', '.design-browser {']) {
      expect(css.includes(selector), selector).toBe(false);
    }
  });

});
