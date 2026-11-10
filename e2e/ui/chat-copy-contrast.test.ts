import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Real shared styles, exercised in both panel and Workspace containers.
test('message actions and times meet contrast requirements in both themes', async ({ page }) => {
  const root = resolve(import.meta.dirname, '../../apps/web/src/styles');
  const css = (await Promise.all(['tokens.css', 'chat.css', 'viewer/shared-interactions.css',
    'viewer/theater.css', 'viewer/shared-routines.css'].map(file => readFile(resolve(root, file), 'utf8')))).join('\n');
  for (const theme of ['light', 'dark']) for (const app of ['', 'app']) {
    await page.setContent(`<html data-pixflow-theme="${theme}"><body><main class="${app}" style="background:var(--bg-panel);padding:30px">
      <div class="msg user"><div class="user-text-wrap"><div class="user-actions"><time class="user-actions-time">10:30</time><button class="user-copy-btn">Copy</button></div></div></div>
      <div class="msg assistant"><footer class="assistant-footer" data-last="true"><span class="assistant-stats">12s</span><button class="assistant-copy-button">Copy</button></footer></div>
      </main></body></html>`);
    await page.addStyleTag({ content: css });
    for (const selector of ['.user-actions-time', '.user-copy-btn', '.assistant-stats', '.assistant-copy-button']) {
      const target = page.locator(selector);
      for (const state of ['default', 'hover', 'focus']) {
      await page.mouse.move(0, 0);
      if (state === 'hover') await target.hover();
      if (state === 'focus' && (selector.includes('btn') || selector.includes('button'))) await target.focus();
      const ratio = await target.evaluate(element => {
        const luminance = (color: string) => {
          const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => {
            const v = n / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
          });
          return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
        };
        let parent: Element | null = element;
        while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
        const fg = luminance(getComputedStyle(element).color);
        const bg = luminance(getComputedStyle(parent!).backgroundColor);
        return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
      });
      expect(ratio, `${theme}/${app || 'panel'}/${selector}/${state}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    await page.locator('.assistant-copy-button').focus();
    await expect(page.locator('.assistant-footer')).toHaveCSS('opacity', '1');
  }
});
