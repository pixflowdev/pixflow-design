import type { ReactNode } from 'react';
import { FloatingChatMenu } from './FloatingChatMenu';
import {
  getPixflowSettingsSurfaceProfile,
  PIXFLOW_SURFACE_FEATURES,
  type PixflowSurface,
} from '@open-design/contracts';

type Props = {
  surface: PixflowSurface;
  children: ReactNode;
  className?: string;
};

/**
 * Surface-neutral outer shell for the contextual agent. It owns the explicit
 * surface/feature metadata and common DOM boundary; surface adapters provide
 * their own context and optional regions as children. In particular, this
 * module does not import the Bricks Stage A drawer or mutation code.
 */
export function PixflowAgentSurfaceShell({ surface, children, className = '' }: Props) {
  const features = PIXFLOW_SURFACE_FEATURES[surface];
  const settingsProfile = getPixflowSettingsSurfaceProfile(surface);
  return (
    <div
      className={`pixflow-agent-surface-shell pixflow-agent-surface-shell--${surface} ${className}`.trim()}
      data-pixflow-surface={surface}
      data-pixflow-stage-a={features.stageAHtmlCssJsPreview ? 'enabled' : 'disabled'}
      data-pixflow-settings-profile={settingsProfile.surface === 'wp_admin' ? 'wp_admin_slim' : 'full'}
    >
      <FloatingChatMenu />
      {children}
    </div>
  );
}
