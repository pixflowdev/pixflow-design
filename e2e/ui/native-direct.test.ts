import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';

test('Bridge remains reachable across navigation with no extension installed', async () => {
  const directory = process.env.PIXFLOW_NATIVE_EXTENSION;
  test.skip(!directory, 'Explicit isolated Bridge configuration required');
  const config = JSON.parse(await readFile(join(directory!, 'config.json'), 'utf8'));
  const profile = await mkdtemp(join(directory!, 'direct-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, args: ['--disable-extensions'],
  });
  try {
    const page = await context.newPage();
    for (const path of ['/', '/wp-admin/', '/']) {
      await page.goto(config.sites[0] + path, { waitUntil: 'domcontentloaded' });
      expect(context.serviceWorkers().filter(worker => worker.url().startsWith('chrome-extension:'))).toHaveLength(0);
      const result = await page.evaluate(async (bridge: string) => {
        // WordPress adapts window.fetch for its own API. Use the application's
        // saved network fetch so this proves the real local Bridge answered.
        const networkFetch = (window as any).__PIXFLOW_DESIGN_NATIVE_FETCH__ || fetch;
        const response = await networkFetch(bridge + '/api/health');
        const health = await response.json();
        return {
          status: response.status,
          product: health.product,
          nativeAdapter: Boolean((window as any).__PIXFLOW_NATIVE_PROTOTYPE__),
        };
      }, config.bridge);
      expect(result).toEqual({ status: 200, product: 'pixflow-design-bridge', nativeAdapter: false });
    }
  } finally { await context.close(); }
});
