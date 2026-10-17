import * as React from 'react';
import * as I18n from '../i18n';
import * as Analytics from '../analytics/provider';
import { hasPixflowWordPressContext } from './wordpress-context';
import { FeatureContributionLoading } from './FeatureContributionLoading';
import { standaloneComposio } from './composio-standalone';
import { loadPixflowFeature, pixflowFeatureAdvertised, pixflowFeatureEnabled, usePixflowFeatureAsset } from './feature-runtime';
import type { ComposioContribution } from './composio-contract';
import styles from './composio-contribution.module.css';

type Contribution = ComposioContribution;
type Factory = (host: { modules: Record<string, unknown> }) => Contribution;
let factory: Factory | undefined;
let contribution: Contribution | undefined;
export function composioAvailable(): boolean {
  if (!hasPixflowWordPressContext()) return standaloneComposio() !== undefined;
  return typeof window !== 'undefined' && pixflowFeatureEnabled('composio')
    && (typeof (window as Window & { PixflowComposioFactory?: unknown }).PixflowComposioFactory === 'function'
      || pixflowFeatureAdvertised('composio', 'pixflow-composio'));
}
function composioContribution(): Contribution | undefined {
  if (!hasPixflowWordPressContext()) return standaloneComposio();
  if (!composioAvailable()) return undefined;
  const next = (window as Window & { PixflowComposioFactory?: Factory }).PixflowComposioFactory;
  if (next !== factory) {
    contribution = next?.({ modules: { 'pixflow-host-i18n': I18n, 'pixflow-host-analytics': Analytics } });
    factory = next;
  }
  return contribution;
}
/** Load only the server-advertised Pro implementation. Never change saved
 * transport/accounts when Pro is absent, expired or temporarily unavailable. */
export async function requireComposioContribution(): Promise<Contribution> {
  if (!composioAvailable()) throw new Error(I18n.translateLocale(I18n.detectInitialLocale(), 'composio.proRequired'));
  if (hasPixflowWordPressContext()) await loadPixflowFeature('pixflow-composio');
  const value = composioContribution();
  if (!value) throw new Error(I18n.translateLocale(I18n.detectInitialLocale(), 'license.featureRefreshError'));
  return value;
}
function useComposioComponent<Name extends 'ComposioExecution' | 'ComposioSiteConnectors' | 'ComposioSiteApps' | 'ComposioWriteAccess'>(name: Name) {
  const status = usePixflowFeatureAsset('pixflow-composio', hasPixflowWordPressContext() && composioAvailable());
  return { Component: composioContribution()?.[name], status };
}
export function ComposioExecution(props: React.ComponentProps<Contribution['ComposioExecution']>) {
  const t = I18n.useT();
  const { Component, status } = useComposioComponent('ComposioExecution');
  return Component ? <Component {...props}/> : composioAvailable() ? <FeatureContributionLoading {...status}/>
    : <div className={styles.unavailable} role="status"><strong>Composio</strong><p>{t('composio.proRequired')}</p></div>;
}
export function ComposioSiteConnectors() {
  const { Component, status } = useComposioComponent('ComposioSiteConnectors');
  return Component ? <Component/> : composioAvailable() ? <FeatureContributionLoading {...status}/> : null;
}
export function ComposioSiteApps(props: React.ComponentProps<Contribution['ComposioSiteApps']>) {
  const { Component, status } = useComposioComponent('ComposioSiteApps');
  return Component ? <Component {...props}/> : composioAvailable() ? <FeatureContributionLoading {...status}/> : null;
}
export function ComposioWriteAccess(props: React.ComponentProps<Contribution['ComposioWriteAccess']>) {
  const { Component, status } = useComposioComponent('ComposioWriteAccess');
  return Component ? <Component {...props}/> : composioAvailable() ? <FeatureContributionLoading {...status}/> : null;
}
