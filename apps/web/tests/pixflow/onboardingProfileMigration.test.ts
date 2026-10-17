import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const profilePath = resolve(repoRoot, 'wordpress/src/Onboarding/UserOnboardingProfile.php');
const tempRoot = mkdtempSync(resolve(tmpdir(), 'pixflow-onboarding-profile-'));

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

function phpPath(path: string): string {
  return path.replaceAll('\\', '/').replaceAll("'", "\\'");
}

function runMigrationScenario(): Record<string, unknown> {
  const harness = resolve(tempRoot, 'migration.php');
  writeFileSync(harness, `<?php
define('ABSPATH', __DIR__);

$GLOBALS['pixflow_user_options'] = [];
$GLOBALS['pixflow_site_options'] = [];
$GLOBALS['pixflow_updates'] = [];

function get_user_option($key, $user_id) {
    return $GLOBALS['pixflow_user_options'][$user_id][$key] ?? false;
}

function update_user_option($user_id, $key, $value, $global) {
    $GLOBALS['pixflow_user_options'][$user_id][$key] = $value;
    $GLOBALS['pixflow_updates'][] = compact('user_id', 'key', 'value', 'global');
    return true;
}

function get_option($key, $default = false) {
    return $GLOBALS['pixflow_site_options'][$key] ?? $default;
}

function sanitize_key($value) {
    return strtolower(preg_replace('/[^a-z0-9_\\-]/', '', (string) $value));
}

function sanitize_text_field($value) {
    return trim((string) $value);
}

require '${phpPath(profilePath)}';

use PixflowDesign\\WordPress\\Onboarding\\UserOnboardingProfile;

function reset_fixture(array $legacy, mixed $stored = false): void {
    $GLOBALS['pixflow_site_options'] = ['pixflow_design_app_config' => $legacy];
    $GLOBALS['pixflow_user_options'] = [];
    $GLOBALS['pixflow_updates'] = [];
    if ($stored !== false) {
        $GLOBALS['pixflow_user_options'][7]['pixflow_design_onboarding_profile_v1'] = $stored;
    }
}

$profiles = new UserOnboardingProfile();

reset_fixture([
    'onboardingCompleted' => true,
    'skillId' => 'pixflow-design',
    'designSystemId' => 'route-existing-site',
]);
$migrated = $profiles->get(7);
$migration_updates = $GLOBALS['pixflow_updates'];

reset_fixture(['onboardingCompleted' => true], [
    'completed' => false,
    'source' => 'explicit-reset',
]);
$explicit_incomplete = $profiles->get(7);
$explicit_updates = $GLOBALS['pixflow_updates'];

reset_fixture(['onboardingCompleted' => false]);
$fresh = $profiles->get(7);
$fresh_updates = $GLOBALS['pixflow_updates'];

reset_fixture(['onboardingCompleted' => true], [
    'completed' => true,
    'source' => 'onboarding-complete',
    'runtimeMode' => 'local-cli',
    'skillId' => 'pixflow-design',
    'designSystemId' => 'route-existing-site',
]);
$reset = $profiles->reset(7);
$reset_updates = $GLOBALS['pixflow_updates'];

echo json_encode([
    'migrated' => $migrated,
    'migrationUpdates' => $migration_updates,
    'explicitIncomplete' => $explicit_incomplete,
    'explicitUpdates' => $explicit_updates,
    'fresh' => $fresh,
    'freshUpdates' => $fresh_updates,
    'reset' => $reset,
    'resetUpdates' => $reset_updates,
], JSON_THROW_ON_ERROR);
`, 'utf8');

  return JSON.parse(execFileSync('php', [harness], { encoding: 'utf8' })) as Record<string, unknown>;
}

describe('legacy WordPress onboarding completion migration', () => {
  it('preserves an already-onboarded user when the per-user profile does not exist yet', () => {
    const result = runMigrationScenario();
    const migrated = result.migrated as Record<string, unknown>;
    const updates = result.migrationUpdates as Array<Record<string, unknown>>;

    expect(migrated.completed).toBe(true);
    expect(migrated.source).toBe('legacy-app-config-migration');
    expect(migrated.skillId).toBe('pixflow-design');
    expect(migrated.designSystemId).toBe('route-existing-site');
    expect(updates).toHaveLength(1);
  });

  it('does not override an existing explicit incomplete profile', () => {
    const result = runMigrationScenario();
    const profile = result.explicitIncomplete as Record<string, unknown>;

    expect(profile.completed).toBe(false);
    expect(profile.source).toBe('explicit-reset');
    expect(result.explicitUpdates).toEqual([]);
  });

  it('leaves a genuinely new installation incomplete', () => {
    const result = runMigrationScenario();
    const profile = result.fresh as Record<string, unknown>;

    expect(profile.completed).toBe(false);
    expect(result.freshUpdates).toEqual([]);
  });

  it('resets only the current user onboarding profile without reviving legacy completion', () => {
    const result = runMigrationScenario();
    const profile = result.reset as Record<string, unknown>;
    const updates = result.resetUpdates as Array<Record<string, unknown>>;

    expect(profile.completed).toBe(false);
    expect(profile.source).toBe('settings-reset');
    expect(profile.runtimeMode).toBeNull();
    expect(profile.skillId).toBeNull();
    expect(profile.designSystemId).toBeNull();
    expect(updates).toHaveLength(1);
  });
});
