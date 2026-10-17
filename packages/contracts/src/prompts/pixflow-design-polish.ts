/** Editor identity wins over installed integrations; only Bricks carries a legacy canvasId. */
export function pixflowDesignPolishReference(context: { editor?: unknown; bricksIntegrationActive?: unknown } = {}, canvasId?: string): string {
  if (context.editor === 'elementor') return 'elementor/design-polish.md';
  if (context.editor === 'etch') return 'etch/design-polish.md';
  if (context.editor === 'bricks' || (!context.editor && canvasId && context.bricksIntegrationActive !== false)) return 'bricks/workflows/enhanced-design.md';
  return 'pixflow/frontend-design/SKILL.md';
}

export function pixflowDesignPolishInstruction(enabled: boolean, context: { editor?: unknown; bricksIntegrationActive?: unknown } = {}, canvasId?: string): string {
  return enabled ? `Design polish is enabled for visual work. Read the relevant Pixflow guidance at ${pixflowDesignPolishReference(context, canvasId)} through skills.read. Apply it within the user's brief and current editing surface. It adds design judgement, not an approval gate, fixed aesthetic or mandatory inspection sequence. Administrative and read-only requests retain their original scope. Other useful skills remain available.` : '';
}
