import { classifyConnectorToolSafety, type ConnectorCatalogDefinition, type ConnectorCatalogToolDefinition } from './catalog.js';
import { readComposioWritePolicy } from './composio-config.js';

/** Discovery and execution share this policy; never cache consent on a run or tool. */
export function connectorToolAccess(definition: ConnectorCatalogDefinition, tool: ConnectorCatalogToolDefinition, purpose = 'agent_preview') {
  const classified = classifyConnectorToolSafety(tool);
  const safety = classified.sideEffect !== 'read' || classified.approval !== 'auto' ? classified : tool.safety;
  const approvals = [definition.minimumApproval, tool.safety.approval, safety.approval].filter(Boolean);
  const approval = approvals.includes('disabled') ? 'disabled' : approvals.includes('confirm') ? 'confirm' : 'auto';
  const readAllowed = definition.allowedToolNames.includes(tool.name) && safety.sideEffect === 'read' && approval === 'auto';
  let writeAllowed = false;
  const deletion = /(?:^|[._:\-/\s])(?:delete|remove)(?:$|[._:\-/\s])/i.test([tool.name, tool.title, tool.providerToolId, ...tool.requiredScopes].join(' '));
  if (purpose === 'agent_preview' && definition.authentication === 'composio' && definition.provider === 'composio'
    && safety.sideEffect === 'write' && tool.safety.sideEffect !== 'destructive' && tool.safety.sideEffect !== 'unknown'
    && approval !== 'disabled' && !deletion && Boolean(tool.providerToolId)) {
    try {
      const policy = readComposioWritePolicy();
      writeAllowed = policy.allowWrites || policy.connectorWrites[definition.id] === true;
    } catch { /* Unreadable consent fails closed. */ }
  }
  return { safety, approval, writeAllowed, allowed: readAllowed || writeAllowed };
}
