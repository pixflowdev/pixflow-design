import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { configureComposioConfigStore, readComposioConfig, readComposioWritePolicy, setComposioAuthConfigId, writeComposioConfig, writeComposioWritePolicy } from '../src/connectors/composio-config.js';
import { connectorToolAccess } from '../src/connectors/write-policy.js';
import { type ConnectorCatalogDefinition, type ConnectorCatalogToolDefinition } from '../src/connectors/catalog.js';
import { ConnectorService, ConnectorStatusService } from '../src/connectors/service.js';
import { listConnectorTools } from '../src/tools/connectors.js';
import { toolTokenRegistry } from '../src/tool-tokens.js';

const read: ConnectorCatalogToolDefinition = { name: 'github.get_issue', title: 'Get issue', requiredScopes: [], safety: { sideEffect: 'read', approval: 'auto', reason: '' }, refreshEligible: true };
const write: ConnectorCatalogToolDefinition = { name: 'github.create_issue', providerToolId: 'GITHUB_CREATE_ISSUE', title: 'Create issue', requiredScopes: [], safety: { sideEffect: 'write', approval: 'confirm', reason: '' }, refreshEligible: false, inputSchemaJson: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } };
const definition: ConnectorCatalogDefinition = { id: 'github', name: 'GitHub', provider: 'composio', authentication: 'composio', category: 'code', tools: [read, write], allowedToolNames: [read.name], minimumApproval: 'auto' };
let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'pixflow-write-policy-')); configureComposioConfigStore(dir); writeComposioConfig({ apiKey: 'test-secret' }); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('Composio write consent', () => {
  it('defaults off, persists each scope, retains overrides under global, and resets with a new account key', () => {
    expect(readComposioWritePolicy()).toEqual({ allowWrites: false, connectorWrites: {} });
    writeComposioWritePolicy({ connectorId: 'github', allowWrites: true });
    writeComposioWritePolicy({ allowWrites: true });
    setComposioAuthConfigId('github', 'auth-test');
    writeComposioConfig({});
    configureComposioConfigStore(dir);
    expect(readComposioWritePolicy()).toEqual({ allowWrites: true, connectorWrites: { github: true } });
    writeComposioWritePolicy({ allowWrites: false });
    expect(connectorToolAccess(definition, write).allowed).toBe(true);
    expect(connectorToolAccess({ ...definition, id: 'other' }, write).allowed).toBe(false);
    expect(readComposioConfig().authConfigIds.github).toBe('auth-test');
    writeComposioConfig({ apiKey: 'new-account' });
    expect(readComposioWritePolicy()).toEqual({ allowWrites: false, connectorWrites: {} });
  });
  it.each([null, { allowWrites: 'true' }, { allowWrites: true, connectorId: '__proto__' }, { allowWrites: true, apiKey: 'replace' }])('rejects malformed updates: %j', input => {
    expect(() => writeComposioWritePolicy(input)).toThrow();
    expect(readComposioConfig().apiKey).toBe('test-secret');
  });
  it('keeps reads available and excludes destructive, disabled, unknown, non-Composio and refresh writes', () => {
    expect(connectorToolAccess(definition, read).allowed).toBe(true);
    expect(connectorToolAccess(definition, write).allowed).toBe(false);
    writeComposioWritePolicy({ allowWrites: true });
    expect(connectorToolAccess(definition, write).allowed).toBe(true);
    expect(connectorToolAccess(definition, write, 'artifact_refresh').allowed).toBe(false);
    expect(connectorToolAccess({ ...definition, provider: 'other' }, write).allowed).toBe(false);
    for (const tool of [
      { ...write, name: 'github.delete_repository' },
      { ...write, safety: { ...write.safety, sideEffect: 'unknown' as const } },
      { ...write, safety: { ...write.safety, approval: 'disabled' as const } },
    ]) expect(connectorToolAccess(definition, tool).allowed).toBe(false);
    writeFileSync(path.join(dir, 'connectors/composio-config.json'), 'invalid');
    expect(connectorToolAccess(definition, write).allowed).toBe(false);
  });
  it.each(['github.add_status_check_contexts', 'github.add_team_access_restrictions', 'github.set_repository_topics'])('does not let mutating names inherit a stale read classification: %s', name => {
    const tool = { ...read, name, providerToolId: name, title: name };
    const catalog = { ...definition, allowedToolNames: [name] };
    expect(connectorToolAccess(catalog, tool).allowed).toBe(false);
    writeComposioWritePolicy({ connectorId: 'github', allowWrites: true });
    expect(connectorToolAccess(catalog, tool).writeAllowed).toBe(true);
  });
  it('discovers and executes allowed writes, validates input, and revokes subsequent calls on the same run', async () => {
    const status = new ConnectorStatusService();
    status.connect(definition, 'test-account', { provider: 'composio', providerConnectionId: 'test' });
    const executeProvider = vi.fn(async () => ({ created: true }));
    class Fixture extends ConnectorService {
      override listFastDefinitions() { return [definition]; }
      override async getHydratedDefinition() { return definition; }
      protected override executeConnectorProviderTool = executeProvider;
    }
    const service = new Fixture(status);
    const grant = toolTokenRegistry.mint({ runId: 'policy-test', projectId: 'test', allowedEndpoints: [], allowedOperations: [] });
    const context = { service, grant, projectsRoot: dir };
    const request = { connectorId: 'github', toolName: write.name, input: { title: 'QA' } };
    const executionContext = { projectsRoot: dir, projectId: 'test', runId: 'policy-test', purpose: 'agent_preview' as const };
    expect((await listConnectorTools(context))[0]?.tools.map(t => t.name)).toEqual([read.name]);
    await expect(service.execute(request, executionContext)).rejects.toMatchObject({ code: 'CONNECTOR_SAFETY_DENIED' });
    writeComposioWritePolicy({ connectorId: 'github', allowWrites: true });
    expect((await listConnectorTools(context))[0]?.tools.map(t => t.name)).toEqual([read.name, write.name]);
    await expect(service.execute({ ...request, input: {} }, executionContext)).rejects.toMatchObject({ code: 'CONNECTOR_INPUT_SCHEMA_MISMATCH' });
    await expect(service.execute(request, executionContext)).resolves.toMatchObject({ ok: true });
    writeComposioWritePolicy({ connectorId: 'github', allowWrites: false });
    await expect(service.execute(request, executionContext)).rejects.toMatchObject({ code: 'CONNECTOR_SAFETY_DENIED' });
    expect(executeProvider).toHaveBeenCalledTimes(1);
  });
});
