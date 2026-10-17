import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { dismissPrivacyDialog, STORAGE_KEY, waitForLoadingToClear } from '@/playwright/amr';
import { fulfillAgentsRoute } from '@/playwright/mock-factory';

type OnboardingConfig = {
  mode: 'daemon';
  apiKey: string;
  baseUrl: string;
  model: string;
  agentId: string | null;
  skillId: null;
  designSystemId: null;
  onboardingCompleted: boolean;
  mediaProviders: Record<string, never>;
  agentModels: Record<string, { model: string; reasoning: string }>;
};

test.describe.configure({ timeout: 30_000 });

test('[P0] @critical onboarding Local CLI card lets the user pick an agent model before continuing', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    codexModels: [
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'gpt-5.5', label: 'gpt-5.5' },
      { id: 'o3', label: 'o3' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'glm-5', label: 'GLM 5' },
      { id: 'qwen3-235b', label: 'Qwen3 235B' },
      { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'kimi-k2.6', label: 'Kimi K2.6' },
    ],
  });

  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: config },
  );

  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Local coding agent/i }).click();
  await selectOnboardingOption(page, 'Model', 'GLM 5');

  await expect(expectOnboardingTrigger(page, 'Model')).toContainText('GLM 5');
  await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible();
});

test('[P0] onboarding falls back to Local CLI when AMR is unavailable', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  await expect(page.getByRole('button', { name: /AMR Cloud/i })).toHaveCount(0);
  await page.getByRole('button', { name: /Local coding agent/i }).click();
  await expect(page.getByText('Local CLI')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible();
});

test('[P0] onboarding skip exits to home and marks onboarding completed', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Skip for now/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] onboarding about-you step accepts profile selections and completes setup', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();

  await selectOnboardingOption(page, 'Your role', 'Engineer');
  await selectOnboardingOption(page, 'Organization size', 'Growth company');
  await selectOnboardingOption(page, 'Use case', 'Product design');
  await selectOnboardingOption(page, 'Use case', 'Prototype / app UI');
  await page.keyboard.press('Escape');
  await selectOnboardingOption(page, 'Where did you hear about us?', 'Search');

  await expect(expectOnboardingTrigger(page, 'Your role')).toContainText('Engineer');
  await expect(expectOnboardingTrigger(page, 'Organization size')).toContainText('Growth company');
  await expect(expectOnboardingTrigger(page, 'Use case')).toContainText('Product design');
  await expect(expectOnboardingTrigger(page, 'Use case')).toContainText('Prototype / app UI');
  await expect(expectOnboardingTrigger(page, 'Where did you hear about us?')).toContainText('Search');

  // About you is no longer the final step; advance to the newsletter step
  // before finishing.
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: /Finish setup/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] @critical onboarding BYOK path can fetch models, test the provider, and complete setup', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
  });

  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 14,
        models: [
          { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
        ],
      },
    });
  });
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 27,
        model: 'claude-opus-4-8',
        sample: 'Connected',
      },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Bring your own key/i }).click();
  await expect(page.getByText('BYOK')).toBeVisible();
  const byokPanel = page.locator('.onboarding-view__setup-panel').filter({ hasText: /BYOK/ });

  await fillInlineField(page, 'API key', 'test-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByRole('status')).toContainText('Fetched 2 models.');
  await selectOnboardingOption(byokPanel, 'Model', 'claude-opus-4-8');

  await page.getByRole('button', { name: /^Test$/i }).click();
  await expect(page.getByText('Connected. Replied in 27 ms')).toBeVisible();

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();
  // Advance from About you to the newsletter step, then finish.
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: /Finish setup/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    mode: 'api',
    apiKey: 'test-api-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-4-8',
    onboardingCompleted: true,
  });
});

async function wireOnboardingMocks(
  page: Page,
  options: { codexModels?: Array<{ id: string; label: string }> },
): Promise<OnboardingConfig> {
  const config: OnboardingConfig = {
    mode: 'daemon', apiKey: '', baseUrl: '', model: '', agentId: 'codex',
    skillId: null, designSystemId: null, onboardingCompleted: false,
    mediaProviders: {}, agentModels: { codex: { model: 'default', reasoning: 'default' } },
  };
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/projects', async route => {
    if (route.request().method() === 'GET') await route.fulfill({ json: { projects: [] } });
    else await route.continue();
  });
  await page.route('**/api/app-config', async route => {
    if (route.request().method() === 'GET') await route.fulfill({ json: { config } });
    else if (route.request().method() === 'PUT') {
      Object.assign(config, route.request().postDataJSON() as Partial<OnboardingConfig>);
      await route.fulfill({ json: { ok: true } });
    } else await route.continue();
  });
  await page.route('**/api/agents**', route => fulfillAgentsRoute(route, [{
    id: 'codex', name: 'Codex CLI', bin: 'codex', available: true, version: 'test',
    models: options.codexModels ?? [{ id: 'default', label: 'Default' }],
  }]));
  await page.route('**/api/integrations/vela/status', route => route.fulfill({
    json: { loggedIn: false, loginInFlight: false, profile: 'local', user: null },
  }));
  return config;
}

async function gotoOnboarding(page: Page) {
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page.getByRole('heading', { name: /Welcome|欢迎/i })).toBeVisible();
}

async function seedOnboardingConfig(page: Page, config: OnboardingConfig) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: config },
  );
}

async function expectOnboardingFinished(page: Page) {
  await dismissPrivacyDialog(page);
  const finishSetup = page.getByRole('button', { name: /Finish setup/i });
  if (await finishSetup.isVisible().catch(() => false)) {
    await finishSetup.click();
  }
  await expect(page).not.toHaveURL(/\/onboarding$/);
  await expect(page.getByText('What do you want to design?')).toBeVisible();
}

function pollStoredConfig(page: Page) {
  return expect.poll(() =>
    page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '{}'), STORAGE_KEY),
  );
}

type OnboardingLocatorRoot = Page | Locator;

function onboardingField(root: OnboardingLocatorRoot, label: string) {
  return root.locator('.onboarding-view__select-field, .onboarding-view__inline-field').filter({
    hasText: new RegExp(label, 'i'),
  }).first();
}

function expectOnboardingTrigger(root: OnboardingLocatorRoot, label: string) {
  return onboardingField(root, label).getByRole('button');
}

async function selectOnboardingOption(root: OnboardingLocatorRoot, label: string, option: string) {
  const field = onboardingField(root, label);
  const listbox = field.getByRole('listbox', { name: new RegExp(label, 'i') });
  if (!(await listbox.isVisible().catch(() => false))) {
    await field.getByRole('button').click();
  }
  await listbox.getByRole('option').filter({ hasText: new RegExp(option, 'i') }).first().click();
}

async function fillInlineField(page: Page, label: string, value: string) {
  await onboardingField(page, label).locator('input').fill(value);
}
