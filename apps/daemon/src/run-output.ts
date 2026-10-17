/**
 * A structured turn is complete only when it produced an assistant response
 * or a deliverable. Reasoning/tool events alone may represent an interrupted
 * turn and must not be promoted to a silent success.
 */
export function isSubstantiveAgentOutput(event: unknown): boolean {
  if (!event || typeof event !== 'object') return false;
  const type = (event as { type?: unknown }).type;
  return type === 'text_delta' || type === 'artifact';
}
