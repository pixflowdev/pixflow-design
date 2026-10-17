import { FeatureContributionLoading } from './FeatureContributionLoading';
import { pixflowFeatureEnabled, pixflowFeatureAdvertised, usePixflowFeatureAsset } from './feature-runtime';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as JSXRuntime from 'react/jsx-runtime';
import * as I18n from '../i18n';
import * as Analytics from '../analytics/provider';
import type { AssetsContribution } from './assets-contract';
import { InstalledAssetsSection } from '../components/InstalledAssetsSection';

type Contribution = AssetsContribution;
type Factory = (host: { modules: Record<string, unknown> }) => Contribution;
let factory: Factory | undefined;
let contribution: Contribution | undefined;
export function assetsAvailable(): boolean {
  return typeof window !== 'undefined' && pixflowFeatureEnabled('assets') && (typeof (window as typeof window & { PixflowAssetsFactory?: Factory }).PixflowAssetsFactory === 'function' || pixflowFeatureAdvertised('assets', 'pixflow-assets'));
}
function renderer() {
  const next = typeof window === 'undefined' ? undefined : (window as typeof window & { PixflowAssetsFactory?: Factory }).PixflowAssetsFactory;
  if (next !== factory) {
    const loaded = next?.({ modules: { react: React, 'react-dom': ReactDOM, 'react/jsx-runtime': JSXRuntime, 'pixflow-host-i18n': I18n, 'pixflow-host-analytics': Analytics } });
    factory = next; contribution = loaded;
  }
  return contribution;
}
export function PixflowGoogleFontsSection() {
  const status = usePixflowFeatureAsset('pixflow-assets');
  const Component = pixflowFeatureEnabled('assets') && renderer()?.PixflowGoogleFontsSection;
  return Component ? <Component /> : assetsAvailable() ? <FeatureContributionLoading {...status} /> : <InstalledAssetsSection kind="font" />;
}
export function PixflowIconPacksSection(props: React.ComponentProps<Contribution['PixflowIconPacksSection']>) {
  const status = usePixflowFeatureAsset('pixflow-assets');
  const Component = pixflowFeatureEnabled('assets') && renderer()?.PixflowIconPacksSection;
  return Component ? <Component {...props} /> : assetsAvailable() ? <FeatureContributionLoading {...status} /> : <InstalledAssetsSection kind="icons" />;
}
