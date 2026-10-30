import { expect, test } from '@playwright/test';
import { T } from '../lib/timeouts.js';

const fixtures = JSON.parse(process.env.PIXFLOW_TOOLTIP_FIXTURES || '[]') as Array<{ name: string; url: string; viewport?: { width: number; height: number } }>;
test.describe('installed composer tooltip overflow', () => {
  for (const fixture of fixtures) {
    test(`${fixture.name} composer hover does not expand the host page`, async ({ page }, testInfo) => {
      if (fixture.viewport) await page.setViewportSize(fixture.viewport);
      await page.goto(fixture.url);
      const panel = page.locator('.pixflow-bricks-agent-panel');
      if (!await panel.isVisible()) {
        await page.getByRole('button', { name: /^(Open Pixflow Agent panel|Pixflow Design)$/ }).click();
      }
      await expect(panel).toBeVisible({ timeout: T.long });
      await expect(panel.locator('.pixflow-bricks-agent-react__bridge-loading')).toHaveCount(0, { timeout: T.xlong });
      const dimensions = () => page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight,
        x: window.scrollX, y: window.scrollY,
      }));
      const plus = panel.getByRole('button', { name: 'Add context', exact: true });
      await expect(plus).toBeVisible({ timeout: T.long });
      await page.mouse.move(5, 5);
      const baseline = await dimensions();
      for (const button of [plus, panel.locator('.composer-send')]) {
        await button.hover();
        const tooltip = page.locator('.od-tooltip-layer:visible');
        if (fixture.name.startsWith('Bricks')) await expect(tooltip.first()).toBeVisible();
        else if (await tooltip.count() === 0) expect(await button.getAttribute('title')).toBeTruthy();
        const snapshot = { baseline, hovered: await dimensions(), positions: await tooltip.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).position)) };
        await testInfo.attach(`${fixture.name}-hover-metrics`, { body: JSON.stringify(snapshot), contentType: 'application/json' });
        expect(snapshot.positions.every(position => position === 'fixed')).toBe(true);
        await expect.poll(dimensions).toEqual(baseline);
        for (const item of await tooltip.all()) {
          const expectedBackground = await button.evaluate(node => getComputedStyle(node).getPropertyValue('--bg-elevated').trim());
          expect(await item.evaluate(node => getComputedStyle(node).getPropertyValue('--bg-elevated').trim())).toBe(expectedBackground);
          const bounds = await item.boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.y).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
        }
        await page.screenshot({ path: testInfo.outputPath(`${fixture.name}-${button === plus ? 'plus' : 'send'}.png`) });
        await page.mouse.move(5, 5);
        await expect(tooltip).toHaveCount(0);
        expect(await dimensions()).toEqual(baseline);
      }
    });
  }
});
