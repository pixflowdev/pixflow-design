import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Express, Request, Response } from 'express';

type SyncModule = {
  exportProject: (options: Record<string, unknown>) => Promise<unknown>;
  importProject: (options: Record<string, unknown>) => Promise<unknown>;
  readSyncState: (context: Record<string, unknown>) => Promise<unknown>;
  resolveSyncContext: (options: Record<string, unknown>) => Record<string, unknown>;
};

export function registerPixflowProjectSyncRoutes(app: Express): void {
  // Pixflow-owned: local/WordPress project sync routes are isolated from OD's
  // generation and chat routes so pre-handoff behavior remains unchanged.
  app.get('/api/pixflow-sync/projects', async (_req: Request, res: Response) => {
    try {
      const sync = await loadSyncModule();
      const context = sync.resolveSyncContext(defaultSyncOptions());
      const state = await sync.readSyncState(context);
      res.json({ ok: true, available: true, context: publicContext(context), state });
    } catch (error) {
      if (isMissingSyncRuntime(error)) {
        res.json({
          ok: true,
          available: false,
          context: null,
          state: { schema: 1, projects: {} },
        });
        return;
      }
      sendError(res, error);
    }
  });

  app.post('/api/pixflow-sync/projects/:projectId/export', async (req: Request, res: Response) => {
    try {
      const sync = await loadSyncModule();
      const body = objectBody(req.body);
      const result = await sync.exportProject({
        ...defaultSyncOptions(),
        projectId: req.params.projectId,
        wpProjectUuid: stringBody(body, 'wpProjectUuid'),
        restBaseUrl: stringBody(body, 'restBaseUrl'),
        nonce: stringBody(body, 'nonce'),
        token: stringBody(body, 'token'),
        title: stringBody(body, 'title'),
        kind: stringBody(body, 'kind') || 'project',
        visibility: stringBody(body, 'visibility') || 'site',
        summary: stringBody(body, 'summary'),
        previewPath: stringBody(body, 'previewPath'),
        expectedVersionNumber: numberBody(body, 'expectedVersionNumber'),
        expectedFileHash: stringBody(body, 'expectedFileHash'),
        lockSessionId: stringBody(body, 'lockSessionId'),
        saveAsNewVersion: body.saveAsNewVersion === true,
        allowConflict: body.allowConflict === true,
        context: objectValue(body.context),
        metadata: objectValue(body.metadata),
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/pixflow-sync/projects/import', async (req: Request, res: Response) => {
    try {
      const sync = await loadSyncModule();
      const body = objectBody(req.body);
      const result = await sync.importProject({
        ...defaultSyncOptions(),
        wpProjectUuid: stringBody(body, 'wpProjectUuid'),
        projectId: stringBody(body, 'projectId'),
        restBaseUrl: stringBody(body, 'restBaseUrl'),
        nonce: stringBody(body, 'nonce'),
        token: stringBody(body, 'token'),
        versionNumber: numberBody(body, 'versionNumber'),
        overwrite: body.overwrite === true,
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });
}

async function loadSyncModule(): Promise<SyncModule> {
  const modulePath = resolveSyncModulePath();
  return await import(pathToFileURL(modulePath).href) as SyncModule;
}

export function resolveSyncModulePath(): string {
  const explicitWorkspaceRoot = process.env.PIXFLOW_DESIGN_WORKSPACE_ROOT?.trim();
  if (explicitWorkspaceRoot) {
    return syncModulePathUnder(explicitWorkspaceRoot);
  }

  const cwd = process.cwd();
  const installRoot = process.env.PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT?.trim();
  const candidates = [
    syncModulePathUnder(cwd),
    ...(installRoot ? [syncModulePathUnder(path.join(installRoot, 'app'))] : []),
    syncModulePathUnder(path.join(cwd, 'resources', 'open-design')),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

function syncModulePathUnder(root: string): string {
  return path.join(root, 'tools', 'pixflow-design-bridge', 'sync', 'index.mjs');
}

function defaultSyncOptions(): Record<string, unknown> {
  const installRoot = process.env.PIXFLOW_DESIGN_BRIDGE_INSTALL_ROOT || '';
  const odDataDir = process.env.OD_DATA_DIR || process.env.PIXFLOW_DESIGN_OD_DATA_DIR || '';
  const dataDir = odDataDir && path.basename(odDataDir).toLowerCase() === 'od'
    ? path.dirname(odDataDir)
    : '';

  return {
    ...(installRoot ? { installRoot } : {}),
    ...(dataDir ? { dataDir } : {}),
    ...(odDataDir ? { odDataDir } : {}),
  };
}

function publicContext(context: Record<string, unknown>): Record<string, unknown> {
  return {
    dataDir: context.dataDir,
    odDataDir: context.odDataDir,
    projectsRoot: context.projectsRoot,
    syncRoot: context.syncRoot,
  };
}

function objectBody(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringBody(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? body[key] as string : '';
}

function numberBody(body: Record<string, unknown>, key: string): number | null {
  const value = body[key];
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function sendError(res: Response, error: unknown): void {
  if (isMissingSyncRuntime(error)) {
    res.status(503).json({
      ok: false,
      code: 'pixflow_sync_unavailable',
      message: 'This Pixflow Design Bridge installation does not include project sync. Update the Bridge and retry.',
    });
    return;
  }
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? (error as { status: number }).status
    : 400;
  const body = (error as { body?: unknown })?.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    res.status(status).json({
      ok: false,
      ...(body as Record<string, unknown>),
    });
    return;
  }

  res.status(status).json({
    ok: false,
    code: 'pixflow_sync_failed',
    message: error instanceof Error ? error.message : String(error),
  });
}

function isMissingSyncRuntime(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /Cannot find module.+pixflow-design-bridge[\\/]sync[\\/]index\.mjs/i.test(message);
}
