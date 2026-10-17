import { FeatureContributionLoading } from './FeatureContributionLoading';
import { pixflowFeatureEnabled, pixflowFeatureAdvertised, usePixflowFeatureAsset } from './feature-runtime';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as JSXRuntime from 'react/jsx-runtime';
import * as I18n from '../i18n';
import * as Analytics from '../analytics/provider';
import * as Registry from '../providers/registry';
import type { CustomSkillsContribution } from './custom-skills-contract';
type Contribution = CustomSkillsContribution;
type Factory = (host: {modules: Record<string,unknown>}) => Contribution;
let factory: Factory | undefined;
let contribution: Contribution | undefined;
export function customSkillsAvailable(): boolean { return typeof window !== 'undefined' && pixflowFeatureEnabled('custom-skills') && (typeof (window as Window & {PixflowCustomSkillsFactory?: unknown}).PixflowCustomSkillsFactory === 'function' || pixflowFeatureAdvertised('custom-skills', 'pixflow-custom-skills')); }
export function customSkillsContribution() {
  const next = typeof window === 'undefined' ? undefined : (window as Window & {PixflowCustomSkillsFactory?: Factory}).PixflowCustomSkillsFactory;
  if (next !== factory) {
    contribution = next?.({modules:{react:React,'react-dom':ReactDOM,'react/jsx-runtime':JSXRuntime,'pixflow-host-i18n':I18n,'pixflow-host-analytics':Analytics,'pixflow-host-registry':Registry}});
    factory = next;
  }
  return contribution;
}
export function ProSkillsSection(props: React.ComponentProps<Contribution['SkillsSection']>) {
  const status = usePixflowFeatureAsset('pixflow-custom-skills');
  const Component = pixflowFeatureEnabled('custom-skills') && customSkillsContribution()?.SkillsSection;
  return Component ? <Component {...props}/> : customSkillsAvailable() ? <FeatureContributionLoading {...status} /> : null;
}
