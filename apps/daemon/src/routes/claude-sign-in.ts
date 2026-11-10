import type { Express, RequestHandler } from 'express';
import { availableParallelism, release, totalmem } from 'node:os';
import type { PixflowBridgeSupport } from '@open-design/contracts';
import { createClaudeSignIn } from '../runtimes/claude-sign-in.js';
import { resolveAgentLaunch, agentRuntimeSource } from '../runtimes/launch.js';
import { claudeAgentDef } from '../runtimes/defs/claude.js';

export function registerClaudeSignInRoutes(app: Express, authorize: RequestHandler, env: () => Record<string, string>, activeSite: () => string = () => '', dataDir?: string, activeOrigin: () => string = () => '') {
  const login = createClaudeSignIn(env, dataDir);
  const route = '/api/agents/claude/sign-in';
  app.options([route, `${route}/cancel`, `${route}/open-browser`, `${route}/code`], authorize, (_req, res) => { res.sendStatus(204); });
  app.get(route, authorize, (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(login.status()); });
  app.post(route, authorize, (req, res) => {
    res.json(login.start(req.headers['x-pixflow-site-key'] === activeSite() ? activeSite() : ''));
  });
  app.post(`${route}/cancel`, authorize, (_req, res) => { res.json(login.cancel()); });
  app.post(`${route}/open-browser`, authorize, (req, res) => {
    try { res.json(login.openLoginPage(req.body?.attemptId)); }
    catch { res.status(409).json({ error: 'The sign-in page is unavailable for this attempt. Check its current status.' }); }
  });
  app.post(`${route}/code`, authorize, (req, res) => {
    try { res.json(login.submitCode(req.body?.attemptId, req.body?.code)); }
    catch { res.status(409).json({ error: 'The code was not accepted for this attempt. Check its current status.' }); }
  });
  function support(): PixflowBridgeSupport {
    const runtime = resolveAgentLaunch(claudeAgentDef, env());
    const version = process.env.PIXFLOW_DESIGN_BRIDGE_VERSION ?? '';
    return {
      schema: 'pixflow.bridge-support.v1', capturedAt: new Date().toISOString(),
      platform: process.platform, arch: process.arch, osRelease: release().match(/^\d+(?:\.\d+){0,3}/)?.[0] ?? null,
      nodeVersion: process.versions.node, bridgeVersion: /^\d+(?:\.\d+){1,3}$/.test(version) ? version : null,
      uptimeSeconds: Math.floor(process.uptime()), logicalCpus: availableParallelism(), memoryGiB: Math.round(totalmem() / 2 ** 30),
      claude: { desktopRuntimeDetected: !!runtime.appBundlePath, cliOnPath: !!runtime.pathResolvedPath,
        selectedSource: runtime.launchPath ? agentRuntimeSource(runtime) : null, ...login.diagnostics(activeSite()) },
    };
  }
  app.get('/api/pixflow/diagnostics/support', authorize, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!activeSite() || req.headers['x-pixflow-site-key'] !== activeSite()
      || (req.headers.origin && req.headers.origin !== activeOrigin())) {
      res.status(403).json({ error: 'paired_site_required' }); return;
    }
    res.json(support());
  });
  return { stop: () => login.cancel(), support };
}
