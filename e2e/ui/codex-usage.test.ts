import { expect, test } from '@playwright/test';
import { openSettingsDialog } from '../lib/playwright/amr.js';
import { routeAgents } from '../lib/playwright/mock-factory.js';

test('[P1] Codex usage shows reported windows and recovers without modifying chats', async ({ page }, testInfo) => {
  const config = { mode: 'daemon', agentId: 'codex', onboardingCompleted: true, privacyDecisionAt: 1, agentModels: {}, agentCliEnv: {}, telemetry: { metrics: false, content: false, artifactManifest: false } };
  await page.addInitScript(config => {
    localStorage.setItem('open-design:config', JSON.stringify(config));
    localStorage.setItem('open-design:locale', 'en');
  }, config);
  await page.route('**/api/app-config', route => route.fulfill({ json: { config } }));
  await routeAgents(page, [{ id: 'codex', name: 'Codex CLI', bin: 'codex', available: true, models: [{ id: 'default', label: 'Default' }] }]);
  let phase = 0;
  await page.route('**/api/agents/codex/usage', route => route.fulfill({ json: {
    status: phase === 1 ? 'unavailable' : 'available', source: 'desktop', checkedAt: new Date().toISOString(),
    windows: phase === 1 ? [] : [
      { bucket: 'codex', durationMinutes: 10080, remainingPercent: 19, resetsAt: 1793784989 },
      ...(phase === 2 ? [{ bucket: 'codex', durationMinutes: 300, remainingPercent: 70, resetsAt: 1793784989 }] : []),
    ],
  } }));
  await page.goto('/');
  const dialog = await openSettingsDialog(page);
  await dialog.getByRole('tab', { name: 'Local CLI', exact: true }).click();
  const usage = dialog.getByRole('region', { name: 'Codex account usage' });
  await expect(usage.getByText('19% remaining')).toBeVisible();
  await expect(usage.getByRole('progressbar')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('usage-desktop.png') });
  phase = 1; await usage.getByRole('button', { name: 'Refresh' }).click();
  await expect(usage.getByText('Unavailable')).toBeVisible();
  phase = 2; await usage.getByRole('button', { name: 'Refresh' }).click();
  await expect(usage.getByRole('progressbar')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(usage.getByText('70% remaining')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('usage-mobile.png') });
});
