import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/locales/en';

import {
  pixflowDownloadCounts,
  pixflowResourcePackAttentionCount,
  pixflowResourcePacksMissingInitially,
  type PixflowResourcePackCatalog,
} from '../../src/pixflow/resource-packs';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const appSource = readFileSync(resolve(repoRoot, 'apps/web/src/App.tsx'), 'utf8');
const onboardingSource = readFileSync(resolve(repoRoot, 'apps/web/src/components/OnboardingView.tsx'), 'utf8');
const settingsSource = readFileSync(resolve(repoRoot, 'apps/web/src/components/SettingsDialog.tsx'), 'utf8');
const workspaceArtifactsCss = readFileSync(resolve(repoRoot, 'apps/web/src/styles/workspace/artifacts.css'), 'utf8');

function catalog(): PixflowResourcePackCatalog {
  return {
    packs: [
      {
        slug: 'plugins', type: 'plugins', name: 'Plugins', description: '', channel: 'stable', version: '1.1.5',
        size: 1, licenseRequired: false, optional: true, recommended: true, installed: true,
        installedVersion: '1.1.5', status: 'installed', needsUpdate: true,
      },
      {
        slug: 'design-templates', type: 'design-templates', name: 'Templates', description: '', channel: 'stable', version: '1.1.5',
        size: 1, licenseRequired: false, optional: true, recommended: true, installed: false,
        installedVersion: '', status: 'not-installed', needsUpdate: false,
      },
      {
        slug: 'design-systems', type: 'design-systems', name: 'Systems', description: '', channel: 'stable', version: '1.1.5',
        size: 1, licenseRequired: false, optional: true, recommended: true, installed: true,
        installedVersion: '1.1.5', status: 'installed', needsUpdate: false,
      },
    ],
  };
}

describe('Pixflow resource-pack lifecycle', () => {
  it('separates initial missing packs from later update notifications', () => {
    expect(pixflowResourcePacksMissingInitially(catalog()).map((pack) => pack.slug))
      .toEqual(['design-templates']);
    expect(pixflowResourcePackAttentionCount(catalog())).toBe(2);
  });

  it('includes the Bridge in builder Downloads totals', () => {
    expect(pixflowDownloadCounts(catalog(), { installed: true, needsUpdate: false })).toEqual({
      available: 4,
      installed: 3,
      updates: 1,
    });
    expect(pixflowDownloadCounts(catalog(), { installed: true, needsUpdate: true })).toEqual({
      available: 4,
      installed: 3,
      updates: 2,
    });
  });

  it('keeps post-onboarding resource updates non-blocking and surfaces them in Downloads', () => {
    expect(appSource).not.toContain('showPixflowResourceGate');
    expect(appSource).not.toContain('showPixflowResourceUpdateNotice');
    expect(appSource).not.toContain('Pixflow resources required');
    expect(workspaceArtifactsCss).not.toContain('pixflow-resource-update-notice');
    expect(settingsSource).toContain('settings-nav-item__badge');
    expect(settingsSource).toContain('pixflowResourcePackAttentionCount');
  });

  it('keeps the Downloads UI focused on version, download state, and progress', () => {
    expect(settingsSource).not.toContain('settings-resource-packs__head-actions');
    expect(settingsSource).not.toContain('<span>Required</span>');
    expect(settingsSource).not.toContain("onAction(pack, 'delete')");
    expect(settingsSource).not.toContain('settings-pixflow-download__icon');
    expect(settingsSource).not.toContain('settings-pixflow-download__status');
    expect(settingsSource).not.toContain('{pack.type}');
    expect(settingsSource).not.toContain('{pack.channel}');
    expect(settingsSource).toContain('<span className="settings-pixflow-download__pill">v{pack.version}</span>');
    expect(settingsSource).toContain('settings-pixflow-download__pill--status');
    expect(settingsSource).toContain("t('updater.available')");
    expect(settingsSource).toContain("t('settings.alreadyLatest')");
    expect(settingsSource).toContain("data-download-status={pack.needsUpdate ? 'update-available' : pack.installed ? 'up-to-date' : 'not-installed'}");
    expect(settingsSource).toContain('settings-pixflow-download__progress-value');
    expect(settingsSource).not.toContain('settings-resource-pack__pill');
    expect(settingsSource).toContain('aria-label={translateUi("ui.settingsDialog.downloadProgress", { value1: pack.name })}');
    expect(en['ui.settingsDialog.downloadProgress']).toBe('{value1} download progress');
    expect(settingsSource).not.toContain('The bridge may mirror resource packs');
    expect(settingsSource).not.toContain('Bundled bootstrap resources are available');
    expect(workspaceArtifactsCss).not.toContain('.settings-pixflow-download__icon');
    expect(workspaceArtifactsCss).not.toContain('.settings-pixflow-download__status');
    expect(workspaceArtifactsCss).toContain('.settings-pixflow-download__head');
    expect(workspaceArtifactsCss).toContain('.settings-pixflow-download__pill--status.is-up-to-date');
    expect(workspaceArtifactsCss).toContain('.settings-pixflow-download__pill--status.is-update-available');
  });

  it('keeps initial resource downloads optional after setup', () => {
    expect(onboardingSource).not.toContain('Install initial resources');
    expect(onboardingSource).toContain('translateUi("ui.entryShell.frameworksExtraResourcesMediaProvidersAndDictation")');
    expect(en['ui.entryShell.frameworksExtraResourcesMediaProvidersAndDictation']).toBe('Frameworks, extra resources, media providers and dictation can be set up later in Settings.');
  });


});
