import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  const anchor = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    // Keep one portal container throughout the session: moving it preserves the
    // composer draft, stream and selected conversation instead of remounting them.
    const node = document.createElement('div');
    node.style.display = 'contents';
    const move = (event?: Event) => {
      const outlet = (event as CustomEvent | undefined)?.detail?.active === false
        ? null : document.getElementById('pixflow-sitemap-conversation-outlet');
      (outlet ?? anchor.current)?.appendChild(node);
      window.dispatchEvent(new Event('pixflow-design:conversation-surface-moved'));
    };
    move(); setContainer(node);
    window.addEventListener('pixflow-design:conversation-outlet', move);
    return () => { window.removeEventListener('pixflow-design:conversation-outlet', move); node.remove(); };
  }, []);
  const features = PIXFLOW_SURFACE_FEATURES[surface];
  const settingsProfile = getPixflowSettingsSurfaceProfile(surface);
  const content = (
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
  return <><div ref={anchor} style={{ display: "contents" }} />{container ? createPortal(content, container) : null}</>;
}
