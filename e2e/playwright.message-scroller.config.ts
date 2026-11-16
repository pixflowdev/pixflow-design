import { defineConfig, devices } from '@playwright/test';

// This suite bundles the real shared components into a page-local fixture.
// It does not need a daemon, credentials or a running WordPress installation.
export default defineConfig({
  testDir: './ui',
  testMatch: 'message-scroller.test.ts',
  outputDir: './ui/reports/message-scroller',
  workers: 1,
  timeout: 30_000,
  retries: 0,
  use: { ...devices['Desktop Chrome'], screenshot: 'only-on-failure' },
});
