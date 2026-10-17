import type { ComponentType } from 'react';
import { useT } from '../i18n';

let bricksAgentFrame: ComponentType | undefined;
export function registerStandaloneBricksAgentFrame(component: ComponentType): void { bricksAgentFrame = component; }
export function StandaloneBricksAgentFrame() {
  const t = useT();
  const Component = bricksAgentFrame;
  return Component ? <Component /> : <div role="status">{t('ui.pixflowMcpSection.requiresPixflowDesignPro')}</div>;
}
