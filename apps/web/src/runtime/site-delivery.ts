import type { ChatMessage, AgentEvent } from '../types';

export const SITE_DELIVERY_UNCERTAIN = 'PIXFLOW_SITE_DELIVERY_UNCERTAIN';
export const SITE_DELIVERY_INSPECT_FIRST = 'The connection ended before this site operation could be confirmed. It has not been repeated. Check the handoff status and the latest site state before continuing; do not replay the previous request.';

/** A lost mutation receipt is not permission to repeat the original user turn. */
export function hasUncertainSiteDelivery(message: Pick<ChatMessage, 'events'>): boolean {
  return (message.events ?? []).some(event => event.kind === 'status' && event.code === SITE_DELIVERY_UNCERTAIN);
}

/** Native tool-only answers have observable output even without a final text paragraph. */
export function hasSuccessfulToolResult(events: AgentEvent[] | undefined): boolean {
  return (events ?? []).some(event => event.kind === 'tool_result' && !event.isError);
}

/** Tool admission without a result is uncertain even when the user interrupts the run. */
export function hasUnresolvedToolCall(events: AgentEvent[] | undefined): boolean {
  const pending = new Set<string>();
  for (const event of events ?? []) {
    if (event.kind === 'tool_use') pending.add(event.id);
    else if (event.kind === 'tool_result') pending.delete(event.toolUseId);
  }
  return pending.size > 0;
}

function hasHandoffReceipt(text: string): boolean {
  const receipt = (value: any, depth = 0): boolean => {
    if (!value || value.ok === false || value.isError === true || depth > 2) return false;
    const id = value.handoff?.id ?? value.result?.handoff?.id;
    if (typeof id === 'string' && id.length > 0) return true;
    return Array.isArray(value.content) && value.content.some((part: any) => {
      if (part.type !== 'text' || typeof part.text !== 'string') return false;
      try { return receipt(JSON.parse(part.text), depth + 1); } catch { return false; }
    });
  };
  return text.split('\n').some(line => {try {return receipt(JSON.parse(line));} catch {return false;}});
}

/** Associate failures with an actual handoff call; never infer a failed handoff
 * from unrelated terminal errors or replay a mutation whose receipt was lost. */
export function failedBuilderHandoff(events: AgentEvent[] | undefined): {code:string; detail:string} | null {
  const calls = new Map<string, 'handoff' | 'status'>();
  let failure: {code:string; detail:string} | null = null;
  for (const event of events ?? []) {
    if (event.kind === 'tool_use') {
      const input = event.input as {command?:unknown;cmd?:unknown} | undefined;
      const command = input?.command ?? input?.cmd;
      const structured = event.name.replace(/^(?:mcp__pixflow_builtin__|mcp_pixflow_builtin_)/, '');
      const namedTool = structured === 'pixflow_builder_handoff' ? 'builder.handoff'
        : structured === 'pixflow_builder_handoff_status' ? 'builder.handoff.status'
        : structured === 'pixflow_call' && input && 'tool' in input ? String(input.tool) : event.name;
      const isHandoff = namedTool === 'builder.handoff' || typeof command === 'string'
        && /builder-tool\.(?:cmd|ps1|mjs)\b/i.test(command) && /\bbuilder\.handoff(?![\w.])/.test(command);
      const isStatus = namedTool === 'builder.handoff.status' || typeof command === 'string'
        && /builder-tool\.(?:cmd|ps1|mjs)\b/i.test(command) && /\bbuilder\.handoff\.status(?![\w.])/.test(command);
      if (isHandoff || isStatus) calls.set(event.id, isStatus ? 'status' : 'handoff');
    } else if (event.kind === 'tool_result' && calls.has(event.toolUseId)) {
      if (calls.get(event.toolUseId) === 'status') {
        if (!event.isError && hasHandoffReceipt(event.content ?? '')) failure = null;
        continue;
      }
      if (!event.isError) { failure = null; continue; }
      const blocked = /PSSecurityException|running scripts is disabled|UnauthorizedAccess.*ExecutionPolicy/i.test(event.content ?? '');
      failure = blocked
        ? {code:'BUILDER_HANDOFF_FAILED',detail:'The builder handoff could not start because Windows blocked its PowerShell launcher. No handoff was sent by this command. Update the Bridge to use the native helper, then retry.'}
        : {code:SITE_DELIVERY_UNCERTAIN,detail:SITE_DELIVERY_INSPECT_FIRST};
    }
  }
  return failure;
}
