import { hasPixflowWordPressContext } from './wordpress-context';
export function isPixflowHiddenBuilderWorkspace(): boolean {
  if (typeof window === 'undefined') return false;
  if (!hasPixflowWordPressContext()) return false;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('bricks')) return false;
  const overlay = document.getElementById('pixflow-design-overlay');
  if (overlay?.dataset.open === 'true') return false;
  const wpConfig = (window as unknown as {
    __PIXFLOW_DESIGN_WORDPRESS__?: { workspaceInitiallyVisible?: boolean };
  }).__PIXFLOW_DESIGN_WORDPRESS__;
  return wpConfig?.workspaceInitiallyVisible !== true;
}
