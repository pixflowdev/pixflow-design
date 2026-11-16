import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { messageScrollerFixture } from '../resources/message-scroller-fixture.js';

let javascript: string;
let stylesheet: string;
test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, '../..');
  const require = createRequire(resolve(root, 'apps/web/package.json'));
  const result = await build({ stdin: { contents: messageScrollerFixture, loader: 'tsx', resolveDir: resolve(root, 'e2e/resources') }, bundle: true,
    outfile: 'fixture.js', write: false, format: 'iife', jsx: 'automatic',
    alias: Object.fromEntries(['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'].map(name => [name, require.resolve(name)])) });
  javascript = result.outputFiles!.find(file => file.path.endsWith('.js'))!.text;
  stylesheet = result.outputFiles!.find(file => file.path.endsWith('.css'))!.text;
});
test.beforeEach(async ({ page }) => {
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: stylesheet + 'article{box-sizing:border-box}p{margin:0}' });
  await page.addScriptTag({ content: javascript });
  await expect(page.locator('[data-slot=message-scroller-viewport]')).toBeVisible();
});
const viewport = (page: Page) => page.locator('[data-slot=message-scroller-viewport]');
const distance = (page: Page) => viewport(page).evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop);
const top = (page: Page) => viewport(page).evaluate(el => el.scrollTop);
async function action(page: Page, name: string) {
  await page.evaluate(name => (window as unknown as { fixture: Record<string, () => void> }).fixture[name]!(), name);
  await page.waitForTimeout(250);
}
async function scrollBack(page: Page) {
  await viewport(page).hover(); await page.mouse.wheel(0, -250); await page.waitForTimeout(200);
}

test('[P1] follows live output, holds scrollback, and resumes only at the live edge', async ({ page }) => {
  await expect.poll(() => distance(page)).toBeLessThan(2);
  await action(page, 'grow'); await expect.poll(() => distance(page)).toBeLessThan(2);
  await scrollBack(page); const before = await top(page);
  await action(page, 'grow'); expect(Math.abs(await top(page) - before)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Jump to latest' }).click();
  await expect.poll(() => distance(page)).toBeLessThan(2);
  await action(page, 'grow'); await expect.poll(() => distance(page)).toBeLessThan(2);
});
test('[P1] opens saved threads at end and keeps replies visible above the queue', async ({ page }) => {
  await action(page, 'queue'); await expect.poll(() => distance(page)).toBeLessThan(2);
  expect(await viewport(page).evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(await page.getByText('Queued message').evaluate(el => el.getBoundingClientRect().top));
  await scrollBack(page); await action(page, 'switch'); await expect.poll(() => distance(page)).toBeLessThan(2);
  await action(page, 'history'); await action(page, 'history'); await expect.poll(() => distance(page)).toBeLessThan(2);
});
test('[P1] prepends history without shifting the visible message', async ({ page }) => {
  await scrollBack(page);
  const row = page.locator('[data-message-id="row-17"]'); const before = await row.evaluate(el => el.getBoundingClientRect().top);
  await action(page, 'prepend');
  expect(Math.abs(await row.evaluate(el => el.getBoundingClientRect().top) - before)).toBeLessThan(2);
  expect(await page.locator('[data-message-id="earlier-user"]').getAttribute('data-message-enter')).toBeNull();
});
test('[P1] selection, focus, disclosure and browser search hold streaming position', async ({ page }) => {
  for (const gesture of ['selection', 'focus', 'search', 'disclosure']) {
    await action(page, 'switch'); await expect.poll(() => distance(page)).toBeLessThan(2);
    const row = page.locator('[data-message-id="row-19"]');
    if (gesture === 'selection') await row.locator('p').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); });
    if (gesture === 'focus') await row.locator('a').focus();
    if (gesture === 'search') await page.keyboard.press('Control+f');
    if (gesture === 'disclosure') await row.locator('summary').click();
    await page.waitForTimeout(200); const before = await top(page);
    await action(page, 'grow'); expect(Math.abs(await top(page) - before), gesture).toBeLessThan(2);
    await page.evaluate(() => window.getSelection()?.removeAllRanges()); await page.keyboard.press('Escape');
  }
});
test('[P1] new turns animate, saved rows do not, and a long reply follows', async ({ page }) => {
  expect(await page.locator('[data-message-enter]').count()).toBe(0);
  await action(page, 'send'); expect(await page.locator('[data-message-id="new-user"]').getAttribute('data-message-enter')).toBe('true');
  for (let i = 0; i < 6; i++) await action(page, 'grow');
  await expect.poll(() => distance(page)).toBeLessThan(2);
  await action(page, 'switch'); expect(await page.locator('[data-message-enter]').count()).toBe(0);
});
test('[P1] keeps a thousand turns searchable and returns to the live edge', async ({ page }) => {
  await action(page, 'long'); await action(page, 'switch');
  await expect.poll(() => distance(page)).toBeLessThan(2);
  expect(await page.locator('[data-message-id]').count()).toBe(1000);
  await scrollBack(page); const before = await top(page); await action(page, 'grow'); expect(Math.abs(await top(page) - before)).toBeLessThan(2);
});

test('[P1] preserves a focused reader when older history is prepended', async ({ page }) => {
  await scrollBack(page);
  const row = page.locator('[data-message-id="row-17"]');
  await row.locator('a').focus();
  const before = await row.evaluate(el => el.getBoundingClientRect().top);
  await action(page, 'prepend');
  expect(Math.abs(await row.evaluate(el => el.getBoundingClientRect().top) - before)).toBeLessThan(2);
});
test('[P1] preparation and completion preserve reading position', async ({ page }) => {
  await scrollBack(page); const before = await top(page);
  await action(page, 'prepare'); expect(Math.abs(await top(page) - before)).toBeLessThan(2);
  await action(page, 'prepare'); expect(Math.abs(await top(page) - before)).toBeLessThan(2);
});
test('[P1] mobile queue and reduced motion keep the transcript usable', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await action(page, 'queue'); await action(page, 'send');
  expect(await page.locator('[data-message-id="new-user"]').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for(let i=0;i<5;i++) await action(page,'grow');
  await expect.poll(() => distance(page)).toBeLessThan(2);
});

test('[P1] sending a new prompt resumes following after a reading interaction', async ({ page }) => {
  await page.locator('[data-message-id="row-19"] a').focus();
  await action(page, 'send');
  for(let i=0;i<6;i++) await action(page,'grow');
  await expect.poll(() => distance(page)).toBeLessThan(2);
});

test('[P1] keeps a focused message in place when earlier content resizes', async ({ page }) => {
  await scrollBack(page); const row = page.locator('[data-message-id="row-17"]');
  await row.locator('a').focus(); await page.waitForTimeout(300); const before = await row.evaluate(el => el.getBoundingClientRect().top);
  await action(page, 'growAbove');
  expect(Math.abs(await row.evaluate(el => el.getBoundingClientRect().top) - before)).toBeLessThan(2);
});

test('[P1] separates the previous reply footer from the next user turn', async ({ page }) => {
  await action(page, 'send');
  const gap = await page.evaluate(() => {
    const previous = document.querySelector('[data-message-id="row-19"]')!.getBoundingClientRect();
    const next = document.querySelector('[data-message-id="new-user"]')!.getBoundingClientRect();
    return next.top - previous.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(28);
});
