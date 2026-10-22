import { pixflowFeatureEnabled, usePixflowFeatureAsset } from './feature-runtime';
import { FeatureContributionLoading } from './FeatureContributionLoading';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as JSXRuntime from 'react/jsx-runtime';
import * as I18n from '../i18n';
import * as Analytics from '../analytics/provider';
import type { PlanningContribution } from './planning-contract';
export { planningAvailable } from './planning-availability';

type Contribution = PlanningContribution;
type Factory = (host: { modules: Record<string, unknown> }) => Contribution;
let factory: Factory | undefined;
let contribution: Contribution | undefined;
function renderer() {
  const next = typeof window === 'undefined' ? undefined : (window as typeof window & { PixflowPlanningFactory?: Factory }).PixflowPlanningFactory;
  if (next !== factory) {
    const loaded = next?.({ modules: { react: React, 'react-dom': ReactDOM, 'react/jsx-runtime': JSXRuntime, 'pixflow-host-i18n': I18n, 'pixflow-host-analytics': Analytics } });
    factory = next;
    contribution = loaded;
  }
  return contribution;
}
export function PixflowDesignSystemLibrary(props: React.ComponentProps<Contribution['PixflowDesignSystemLibrary']>) {
  const status = usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.PixflowDesignSystemLibrary;
  return Component ? <Component {...props} /> : pixflowFeatureEnabled('planning') ? <FeatureContributionLoading {...status} /> : null;
}
export function PixflowFrameworkDesignSystemBuilder(props: React.ComponentProps<Contribution['PixflowFrameworkDesignSystemBuilder']>) {
  const status = usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.PixflowFrameworkDesignSystemBuilder;
  return Component ? <Component {...props} /> : pixflowFeatureEnabled('planning') ? <FeatureContributionLoading {...status} /> : null;
}
export function DesignSystemCreationFlow(props: React.ComponentProps<Contribution['DesignSystemCreationFlow']>) {
  const status = usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.DesignSystemCreationFlow;
  return Component ? <Component {...props} /> : pixflowFeatureEnabled('planning') ? <FeatureContributionLoading {...status} /> : null;
}
export function DesignSystemDetailView(props: React.ComponentProps<Contribution['DesignSystemDetailView']>) {
  const status = usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.DesignSystemDetailView;
  return Component ? <Component {...props} /> : pixflowFeatureEnabled('planning') ? <FeatureContributionLoading {...status} /> : null;
}
export function DesignSystemsSection(props: React.ComponentProps<Contribution['DesignSystemsSection']>) {
  const status = usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.DesignSystemsSection;
  return Component ? <Component {...props} /> : pixflowFeatureEnabled('planning') ? <FeatureContributionLoading {...status} /> : null;
}
export function DesignSystemsTab(props: React.ComponentProps<Contribution['DesignSystemsTab']>) {
  const status = usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.DesignSystemsTab;
  return Component ? <Component {...props} /> : pixflowFeatureEnabled('planning') ? <FeatureContributionLoading {...status} /> : null;
}
export function DesignSystemPicker(props: React.ComponentProps<Contribution['DesignSystemPicker']>) {
  const status = usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.DesignSystemPicker;
  return Component ? <Component {...props} /> : pixflowFeatureEnabled('planning') ? <FeatureContributionLoading {...status} /> : null;
}
export function DesignSystemSwitchPicker(props: React.ComponentProps<Contribution['DesignSystemSwitchPicker']>) {
  const status = usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.DesignSystemSwitchPicker;
  return Component ? <Component {...props} /> : pixflowFeatureEnabled('planning') ? <FeatureContributionLoading {...status} /> : null;
}
export function DesignSystemSwitch(props: React.ComponentProps<Contribution['DesignSystemSwitch']>) {
  const status = usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.DesignSystemSwitch;
  return Component ? <Component {...props} /> : pixflowFeatureEnabled('planning') ? <FeatureContributionLoading {...status} /> : null;
}
export function SitemapView(props: React.ComponentProps<Contribution['SitemapView']>) {
  const status = usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.SitemapView;
  return Component ? <Component {...props} /> : pixflowFeatureEnabled('planning') ? <FeatureContributionLoading {...status} /> : null;
}

export function EnhancedDesignGuidance(props: { enabled?: boolean; surface?: import('@open-design/contracts').PixflowSurface }) {
  usePixflowFeatureAsset('pixflow-planning');
  const Component = pixflowFeatureEnabled('planning') && renderer()?.EnhancedDesignGuidance;
  return Component ? <Component {...props} /> : null;
}
