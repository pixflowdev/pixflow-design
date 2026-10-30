import { expect, test } from '@playwright/test';
import { T } from '../lib/timeouts.js';

// Installed-fixture acceptance is opt-in; no credentials or customer URLs are embedded.
test.describe('installed WordPress usage refresh', () => {
  test.skip(!process.env.PIXFLOW_USAGE_WORDPRESS_URL, 'Requires the isolated installed WordPress fixture');
  for (const surface of ['floating', 'workspace']) {
    test(`${surface} updates its ring and hover after 60 seconds without clicking`, async ({ page }, testInfo) => {
      test.setTimeout(T.xlong + T.long * 2);
      let reads = 0;
      await page.route('**/api/agents/*/usage**', async route => {
        const provider = new URL(route.request().url()).pathname.split('/')[3];
        if (provider !== 'codex' && provider !== 'claude') return route.continue();
        reads++;
        await route.fulfill({ json: { status: 'available', source: 'desktop', checkedAt: new Date().toISOString(), windows: [{ bucket: provider, durationMinutes: 10080, remainingPercent: reads === 1 ? 80 : 65, resetsAt: null }] } });
      });
      await page.goto(`${process.env.PIXFLOW_USAGE_WORDPRESS_URL}/wp-admin/`);
      if (surface === 'workspace') {
        await page.getByRole('button', { name: 'Open settings', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Open workspace', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Pixflow Design', exact: true }).click();
      }
      const ring = page.getByRole('button', { name: /^(Codex|Claude) account usage:/ });
      await expect(ring).toBeVisible({ timeout: T.long });
      await expect(ring).toHaveAttribute('aria-label', /80% remaining/);
      await ring.hover();
      const hover = page.getByRole('tooltip');
      await expect(hover).toContainText('80% remaining');
      const startingReads = reads;
      await expect.poll(() => reads, { timeout: T.xlong + T.long }).toBeGreaterThan(startingReads);
      await expect(ring).toHaveAttribute('aria-label', /65% remaining/);
      await ring.hover();
      await expect(hover).toContainText('65% remaining');
      await expect(ring.locator('[stroke-dashoffset]')).toHaveAttribute('stroke-dashoffset', '35');
      await page.screenshot({ path: testInfo.outputPath(`${surface}-automatic-refresh.png`) });
    });
  }
});
