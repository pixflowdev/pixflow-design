export const WORKSPACE_NAVIGATION_REQUEST = 'pixflow-design:workspace-navigation-request';
export type WorkspaceNavigationRequest = { proceed: () => void };

/** A mounted editor may defer navigation until its save/discard decision completes. */
export function requestWorkspaceNavigation(action: () => void): boolean {
  let completed = false;
  const proceed = () => { if (!completed) { completed = true; action(); } };
  const event = new window.CustomEvent<WorkspaceNavigationRequest>(WORKSPACE_NAVIGATION_REQUEST, { cancelable: true, detail: { proceed } });
  if (!window.dispatchEvent(event)) return false;
  proceed();
  return true;
}
