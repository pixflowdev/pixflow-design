export function readPanelDiscussion(prompt: string): Record<string, unknown> {
  let workspaceDiscussion: unknown;
  window.dispatchEvent(new CustomEvent('pixflow-design:read-panel-context', {
    detail: { prompt, provide(value: unknown) { workspaceDiscussion = value; } },
  }));
  return workspaceDiscussion ? { workspaceDiscussion } : {};
}
