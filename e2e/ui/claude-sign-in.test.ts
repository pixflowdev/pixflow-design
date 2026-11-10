import { expect, test } from '@playwright/test';
import { openSettingsDialog } from '../lib/playwright/amr.js';
import { routeAgents } from '../lib/playwright/mock-factory.js';

for (const mobile of [false, true]) {
  test(`Claude sign-in recovery stays available and retains its attempt on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }, testInfo) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    const config = { mode: 'daemon', agentId: 'claude', onboardingCompleted: true, privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false } };
    await page.addInitScript(config => {
      localStorage.setItem('open-design:config', JSON.stringify(config));
      localStorage.setItem('open-design:locale', 'en');
    }, config);
    await page.route('**/api/app-config', route => route.fulfill({ json: { config } }));
    await routeAgents(page, [{ id: 'claude', name: 'Claude', bin: 'claude', available: true, authStatus: 'ok', runtimeSource: 'desktop', models: [{ id: 'default', label: 'Default' }] }]);
    let state = 'idle'; let starts = 0; let opens = 0; let code = ''; let failOnce = false;
    await page.route('**/api/agents/claude/sign-in**', async route => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      if (path.endsWith('/open-browser')) { opens++; expect(request.postDataJSON()).toEqual({ attemptId: 'owned' }); }
      else if (path.endsWith('/code')) { code = request.postDataJSON().code; state = 'connected'; }
      else if (request.method() === 'POST') { starts++; state = 'waiting'; failOnce = true; }
      else if (failOnce) { failOnce = false; await route.abort('failed'); return; }
      await route.fulfill({ json: { state, source: 'desktop', ...(state === 'waiting' ? { attemptId: 'owned', canOpenBrowser: true, acceptsCode: true } : {}) } });
    });
    await page.goto('/'); await openSettingsDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: /Local CLI/ }).click();
    await dialog.getByRole('button', { name: 'Sign in again', exact: true }).click();
    await expect(dialog.getByText('Waiting for sign-in…', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Connection interrupted. Checking sign-in status…')).toBeVisible();
    const open = dialog.getByRole('button', { name: 'Open sign-in page', exact: true });
    await expect(open).toBeEnabled(); await open.click(); expect(opens).toBe(1);
    await expect(dialog.getByLabel('Authorization code')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('recovery.png'), fullPage: true });
    await dialog.getByLabel('Authorization code').fill('synthetic-code#state');
    await dialog.getByRole('button', { name: 'Complete sign-in', exact: true }).click();
    await expect(dialog.getByText('Waiting for sign-in…', { exact: true })).toHaveCount(0);
    expect(code).toBe('synthetic-code#state'); expect(starts).toBe(1);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('synthetic-code');
  });
}
