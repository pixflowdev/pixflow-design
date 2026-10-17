import type { PixflowBricksAgentSessionPayload } from './bricks-agent-session';

type PixflowBricksAgentHostApi = {
  openPanel?: (reason?: string, payload?: unknown) => void;
  updatePanel?: (reason?: string, payload?: unknown) => void;
};

function hostApi(): PixflowBricksAgentHostApi | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { pixflowDesignBricksAgent?: PixflowBricksAgentHostApi }).pixflowDesignBricksAgent;
  return candidate && typeof candidate === 'object' ? candidate : null;
}

function isFramedWorkspace(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.parent && window.parent !== window;
  } catch {
    return true;
  }
}

function postToParent(type: 'pixflow-design:open-bricks-agent' | 'pixflow-design:update-bricks-agent', reason: string, payload: PixflowBricksAgentSessionPayload): void {
  window.parent?.postMessage({
    source: 'pixflow-design',
    type,
    reason,
    payload,
  }, '*');
}

export function openPixflowBricksAgentPanel(
  reason: string,
  payload: PixflowBricksAgentSessionPayload,
): void {
  if (isFramedWorkspace()) {
    postToParent('pixflow-design:open-bricks-agent', reason, payload);
    return;
  }
  const api = hostApi();
  if (typeof api?.openPanel === 'function') {
    api.openPanel(reason, payload);
    return;
  }
  postToParent('pixflow-design:open-bricks-agent', reason, payload);
}

export function updatePixflowBricksAgentPanel(
  reason: string,
  payload: PixflowBricksAgentSessionPayload,
): void {
  if (isFramedWorkspace()) {
    postToParent('pixflow-design:update-bricks-agent', reason, payload);
    return;
  }
  const api = hostApi();
  if (typeof api?.updatePanel === 'function') {
    api.updatePanel(reason, payload);
    return;
  }
  postToParent('pixflow-design:update-bricks-agent', reason, payload);
}
