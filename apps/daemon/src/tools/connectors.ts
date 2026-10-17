import { connectorToolAccess } from '../connectors/write-policy.js';
import type { ToolTokenGrant } from '../tool-tokens.js';

import { connectorDefinitionToDetail, type ConnectorCatalogDefinition, type ConnectorToolDetail, type ConnectorToolUseCase } from '../connectors/catalog.js';
import { connectorService, ConnectorService, type ConnectorExecuteRequest } from '../connectors/service.js';

export interface ConnectorToolContext {
  grant: ToolTokenGrant;
  projectsRoot: string;
  service?: ConnectorService;
}

function isAgentPreviewListableTool(definition: ConnectorCatalogDefinition, tool: ConnectorToolDetail): boolean {
  const catalogTool = definition.tools.find(candidate => candidate.name === tool.name);
  return Boolean(catalogTool && connectorToolAccess(definition, catalogTool).allowed);
}

function matchesConnectorToolUseCase(tool: ConnectorToolDetail, useCase: ConnectorToolUseCase | undefined): boolean {
  if (useCase === undefined) return true;
  return tool.curation?.useCases?.includes(useCase) ?? false;
}

function connectorNeedsHydratedDiscovery(definition: ConnectorCatalogDefinition | undefined): boolean {
  if (!definition) return true;
  if (definition.tools.length === 0) return true;
  return definition.toolCount !== undefined && definition.tools.length < definition.toolCount;
}

const AGENT_CONNECTOR_TOOL_HYDRATION_LIMIT = 1000;

export async function listConnectorTools(context: ConnectorToolContext & { useCase?: ConnectorToolUseCase }): Promise<Awaited<ReturnType<ConnectorService['listConnectors']>>> {
  const service = context.service ?? connectorService;
  // Agent-facing tool discovery sits on the hot path for unattended Orbit
  // runs. Do not call provider discovery here: Composio toolkit discovery can
  // cold-start slowly and leave the agent with no data before its shell
  // timeout. Static definitions plus locally persisted connection status are
  // enough to expose the approved read-only tool surface, and execution still
  // validates connection state and safety again before calling providers.
  const fastDefinitions = service.listFastDefinitions();
  const fastDefinitionsById = new Map(fastDefinitions.map((definition) => [definition.id, definition]));
  const connectedStatusIds = Object.entries(service.listConnectorStatuses())
    .filter(([, status]) => status.status === 'connected')
    .map(([connectorId]) => connectorId);
  const connectedConnectorIdsNeedingDiscovery = connectedStatusIds.filter((connectorId) => {
    const fastDefinition = fastDefinitionsById.get(connectorId);
    return connectorNeedsHydratedDiscovery(fastDefinition);
  });
  let definitions = fastDefinitions;
  if (connectedConnectorIdsNeedingDiscovery.length > 0) {
    const targetedDefinitions = await Promise.all(connectedConnectorIdsNeedingDiscovery.map(async (connectorId) => {
      const fastDefinition = fastDefinitionsById.get(connectorId);
      return fastDefinition
        ? await service.getPreviewDefinition(connectorId, { toolsLimit: AGENT_CONNECTOR_TOOL_HYDRATION_LIMIT })
        : await service.getHydratedDefinition(connectorId);
    }));
    const targetedDefinitionsById = new Map(
      targetedDefinitions
        .filter((definition): definition is ConnectorCatalogDefinition => definition !== undefined)
        .map((definition) => [definition.id, definition]),
    );
    definitions = fastDefinitions.map((definition) => targetedDefinitionsById.get(definition.id) ?? definition);
    for (const definition of targetedDefinitionsById.values()) {
      if (!fastDefinitionsById.has(definition.id)) definitions.push(definition);
    }
  }
  const entries = definitions.map((definition) => {
    const detail = connectorDefinitionToDetail(definition);
    const status = service.getStatus(definition);
    return {
      definition,
      connector: {
        ...detail,
        status: status.status,
        ...(status.accountLabel === undefined ? {} : { accountLabel: status.accountLabel }),
        ...(status.lastError === undefined ? {} : { lastError: status.lastError }),
      },
    };
  });
  return entries
    .filter(({ connector }) => connector.status === 'connected')
    .map(({ definition, connector }) => ({
      ...connector,
      tools: connector.tools
        .filter((tool) => isAgentPreviewListableTool(definition, tool))
        .filter((tool) => matchesConnectorToolUseCase(tool, context.useCase))
        .sort((left, right) => {
          const leftReadOnly = left.safety.sideEffect === 'read' && left.safety.approval === 'auto';
          const rightReadOnly = right.safety.sideEffect === 'read' && right.safety.approval === 'auto';
          if (leftReadOnly === rightReadOnly) return 0;
          return leftReadOnly ? -1 : 1;
        }),
    }))
    .map(connector => ({ ...connector, allowedToolNames: connector.tools.map(tool => tool.name) }))
    .filter((connector) => connector.tools.length > 0);
}

export async function executeConnectorTool(request: ConnectorExecuteRequest, context: ConnectorToolContext) {
  const service = context.service ?? connectorService;
  return await service.execute(request, {
    projectsRoot: context.projectsRoot,
    projectId: context.grant.projectId,
    runId: context.grant.runId,
    purpose: 'agent_preview',
  });
}
