import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as JSXRuntime from 'react/jsx-runtime';
import * as I18n from '../i18n';
import * as Analytics from '../analytics/provider';
import * as Router from '../router';
import * as Registry from '../providers/registry';
import * as Config from '../state/config';
import * as Projects from '../state/projects';
import type { WorkspaceHostContext } from '../App';
import type { DesignSystemGenerationJob } from '../types';
import { pixflowFeatureEnabled, pixflowFeatureAdvertised, usePixflowFeatureAsset } from './feature-runtime';
import { FeatureContributionLoading } from './FeatureContributionLoading';
import { Button } from '@open-design/components';
import { hasPixflowWordPressContext } from './wordpress-context';
import { workspaceHostModules } from './workspace-host-modules';
import { WorkspaceLoading } from '../components/WorkspaceLoading';

export interface WorkspaceActions {
  refreshProjects(): Promise<void>;
  skillsChanged(id?: string): void;
  designSystemsChanged(id?: string): void;
  designSystemJob(id: string, job: DesignSystemGenerationJob): void;
  openTemplateLibrary(): void;
}

type Surface = React.ComponentType<{ host: WorkspaceHostContext }>;
type Factory = (host: { modules: Record<string, unknown> }) => { WorkspaceSurface: Surface };
let standalone: Surface | undefined;
let factory: Factory | undefined;
let contribution: ReturnType<Factory> | undefined;

/** The desktop entry explicitly provides its own implementation; Free never imports it. */
export function registerStandaloneWorkspace(surface: Surface): void { standalone = surface; }

export function workspaceAvailable(): boolean {
  if (!hasPixflowWordPressContext()) return standalone !== undefined;
  return pixflowFeatureEnabled('workspace') && (
    typeof (window as Window & { PixflowWorkspaceFactory?: Factory }).PixflowWorkspaceFactory === 'function'
    || pixflowFeatureAdvertised('workspace', 'pixflow-workspace')
  );
}

function renderer() {
  if (!hasPixflowWordPressContext()) return standalone;
  const next = (window as Window & { PixflowWorkspaceFactory?: Factory }).PixflowWorkspaceFactory;
  if (next !== factory) {
    contribution = next?.({ modules: { ...workspaceHostModules,
      react: React, 'react-dom': ReactDOM, 'react/jsx-runtime': JSXRuntime,
      'pixflow-host-i18n': I18n, 'pixflow-host-analytics': Analytics,
      'pixflow-host-router': Router, 'pixflow-host-registry': Registry,
      'pixflow-host-config': Config, 'pixflow-host-projects': Projects,
    } });
    factory = next;
  }
  return contribution?.WorkspaceSurface;
}

export function WorkspaceContribution({ host }: { host: WorkspaceHostContext }) {
  const wordpress = hasPixflowWordPressContext();
  const allowed = host.workspaceAllowed && (wordpress ? pixflowFeatureEnabled('workspace') : standalone !== undefined);
  const [opened, setOpened] = React.useState(!wordpress || host.pixflowWorkspaceCatalogVisible);
  React.useEffect(() => { if (host.pixflowWorkspaceCatalogVisible) setOpened(true); }, [host.pixflowWorkspaceCatalogVisible]);
  const status = usePixflowFeatureAsset('pixflow-workspace', wordpress && allowed && opened);
  if (wordpress && host.pixflowLicenseStatus === null) {
    return host.pixflowWorkspaceCatalogVisible ? <WorkspaceLoading /> : null;
  }
  if (!allowed) return host.pixflowWorkspaceCatalogVisible || !wordpress ? <section className="empty-card" aria-label="Pixflow Design Workspace">
    <h2>Pixflow Design Workspace · Pro</h2>
    <Button onClick={() => window.open('https://pixflow.dev/pricing', '_blank', 'noopener,noreferrer')}>{host.translateUi('ui.composioSiteApps.upgradeToPro')}</Button>
    <Button variant="ghost" onClick={() => host.openSettings()}>{host.translateUi('entry.openSettingsAria')}</Button>
  </section> : null;
  if (!opened) return null;
  const Surface = renderer();
  return Surface ? <Surface host={host} /> : <FeatureContributionLoading {...status} />;
}
