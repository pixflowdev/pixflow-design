import { usePixflowFeatureAsset } from './feature-runtime';
import { FeatureContributionLoading } from './FeatureContributionLoading';
import { useEffect, useRef } from 'react';
import type { AppConfig } from '../types';
import type { Dispatch, SetStateAction } from 'react';

export type BuilderSettingsProps = {
  cfg?: AppConfig;
  setCfg?: Dispatch<SetStateAction<AppConfig>>;
  mode?: 'settings' | 'onboarding';
  onReadyChange?: (ready: boolean) => void;
};
export type BuilderSettingsRenderer = {
  renderSettings(kind: string, element: HTMLElement, props: BuilderSettingsProps): void;
  unmountSettings(element: HTMLElement): void;
};

/** Separately built settings own their React root and providers. */
export function BuilderSettingsContribution({ kind, ...props }: BuilderSettingsProps & { kind: 'extensions' | 'framework' }) {
  const container = useRef<HTMLDivElement>(null);
  const host = window as typeof window & { PixflowBricksSettings?: BuilderSettingsRenderer };
  const renderer = host.PixflowBricksSettings;
  const status = usePixflowFeatureAsset('pixflow-bricks-settings', !renderer);
  useEffect(() => {
    if (container.current) renderer?.renderSettings(kind, container.current, props);
  }, [renderer, kind, props.cfg, props.setCfg, props.mode, props.onReadyChange]);
  useEffect(() => {
    const element = container.current;
    return () => { if (element) renderer?.unmountSettings(element); };
  }, [renderer]);
  return <><div ref={container} />{!renderer && <FeatureContributionLoading {...status} />}</>;
}
