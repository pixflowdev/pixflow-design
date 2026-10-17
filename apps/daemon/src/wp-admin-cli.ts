// @ts-nocheck
import { captureAgentPage } from './pixflow/agent-visual-capture.js';

/**
 * Headless WP Admin capability client. The panel and this CLI speak the same
 * Pixflow REST contracts; the CLI never reuses a browser nonce or site hash as
 * authentication. A pairing token is supplied explicitly or through the
 * PIXFLOW_WP_ADMIN_TOKEN environment variable.
 */

type ParsedArgs = {
  command: string;
  flags: Record<string, string | boolean>;
};

function parseArgs(args: string[]): ParsedArgs {
  const positional = args.filter((value) => !value.startsWith('-'));
  const command = positional[0] || 'help';
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith('-')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function stringFlag(flags: Record<string, string | boolean>, key: string, fallback = ''): string {
  const value = flags[key];
  return typeof value === 'string' ? value : fallback;
}

function requireSite(flags: Record<string, string | boolean>): string {
  const site = stringFlag(flags, 'site-url', process.env.PIXFLOW_WP_ADMIN_SITE || '').trim().replace(/\/+$/, '');
  if (!site) throw new Error('Pass --site-url <https://site.example> or set PIXFLOW_WP_ADMIN_SITE.');
  const parsed = new URL(site);
  const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'https:' && !local) throw new Error('Remote WP Admin CLI pairing requires HTTPS. HTTP is allowed only for localhost development.');
  return site.endsWith('/wp-json') ? site.slice(0, -'/wp-json'.length) : site;
}

function requireToken(flags: Record<string, string | boolean>): string {
  const token = stringFlag(flags, 'token', process.env.PIXFLOW_WP_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error('Pass --token <pairing-token> or set PIXFLOW_WP_ADMIN_TOKEN. Browser REST nonces are not accepted by the CLI.');
  return token;
}

async function readJsonInput(flags: Record<string, string | boolean>): Promise<Record<string, unknown>> {
  const inline = stringFlag(flags, 'arguments-json');
  const file = stringFlag(flags, 'arguments-file');
  const promptFile = stringFlag(flags, 'prompt-file');
  let raw = inline;
  if (!raw && file) raw = await (await import('node:fs/promises')).readFile(file, 'utf8');
  if (!raw && promptFile) {
    const prompt = promptFile === '-' ? await readStdin() : await (await import('node:fs/promises')).readFile(promptFile, 'utf8');
    return { prompt };
  }
  if (!raw) return {};
  const parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Capability arguments must be a JSON object.');
  return parsed;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function request(site: string, token: string, path: string, init: RequestInit = {}, namespace: 'wp-admin' | 'license' = 'wp-admin'): Promise<unknown> {
  const [routePath, query = ''] = path.replace(/^\//, '').split('?');
  const restRoute = `/pixflow-design/v1/${namespace}/${routePath}`;
  const endpoint = new URL(`${site}/`);
  endpoint.searchParams.set('rest_route', restRoute);
  if (query) {
    for (const [key, value] of new URLSearchParams(query)) endpoint.searchParams.append(key, value);
  }
  const response = await fetch(endpoint.toString(), {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload ? payload.message : `WP Admin request failed (${response.status}).`;
    throw new Error(String(message));
  }
  return payload;
}

function print(payload: unknown, json: boolean): void {
  process.stdout.write(`${json ? JSON.stringify(payload) : JSON.stringify(payload, null, 2)}\n`);
}

function help(): void {
  process.stdout.write('Installation recovery:\n  od wp-admin installation-recovery --action prepare --json\n  od wp-admin installation-recovery --action complete --prompt-file <path|-> --json\n  Complete accepts JSON {installation_id} after the owner approves the public request in their Pixflow account.\n\n');
  process.stdout.write('Visual inspection:\n  od wp-admin capture --daemon-url http://127.0.0.1:7456 --arguments-file capture.json --output-dir . --json\n  capture.json: {"url":"https://example.com","viewports":[{"id":"mobile","width":390,"height":844}],"captureMode":"live-reference"}\n  Returns local PNG paths; no WordPress credentials are sent to the capture service. Each viewport may include actions:[{type:"click",selector:".menu-toggle"}] or type:"hover" to capture a chosen interaction state.\n\n');
  process.stdout.write('Live Bricks tools:\n  od wp-admin site-tool --tool bricks.canvases --mode ask --json\n  od wp-admin site-tool --tool bricks.context --canvas-id <tab-id> --mode ask --json\n  od wp-admin site-tool --tool bricks.mutate --canvas-id <tab-id> --arguments-file edits.json --json\n  od wp-admin site-tool --tool bricks.run --canvas-id <tab-id> --arguments-file javascript.json --json\n  Also available: bricks.read, bricks.select, bricks.refresh, bricks.undo, bricks.redo, bricks.save.\n\n');
  process.stdout.write('Direct site access:\n  od wp-admin access-mode [--set direct|guarded] --json\n  od wp-admin site-tool --tool files.read --arguments-json \'{"path":"wp-content/example.css"}\' --json\n  od wp-admin site-tool --tool help --json\n  Site tools accept --arguments-file for JSON; --prompt-file supplies a prompt argument.\n\n');
  process.stdout.write(`Usage:\n  od wp-admin <context|capabilities|capability|approve|execute|operation|audit|rollback|pairings> [options]\n\nOptions:\n  --site-url <url>       WordPress site URL (or PIXFLOW_WP_ADMIN_SITE)\n  --token <token>        Revocable site/user pairing token (or PIXFLOW_WP_ADMIN_TOKEN)\n  --json                 Machine-readable JSON output\n  --prompt-file <path|-> Long prompt input for preflight-capable commands\n\nExamples:\n  od wp-admin context --site-url http://127.0.0.1:8088 --token "$PIXFLOW_WP_ADMIN_TOKEN" --json\n  od wp-admin capabilities --site-url https://example.com --token <pairing-token> --json\n  od wp-admin execute --capability-id pixflow/wp-admin/get-post --arguments-json '{"postId":1}' --mode ask --session-id s1\n`);
}

export async function runWpAdminCli(args: string[]): Promise<{ exitCode: number }> {
  const { command, flags } = parseArgs(args);
  const json = flags.json === true;
  if (command === 'help' || flags.help === true || flags.h === true) {
    help();
    return { exitCode: 0 };
  }
  try {
    if (command === 'capture') {
      const daemon = stringFlag(flags, 'daemon-url', process.env.OD_DAEMON_URL || '').replace(/\/+$/, '');
      if (!daemon) throw new Error('Pass --daemon-url for the running local daemon.');
      const result = await captureAgentPage(`${daemon}/api/pixflow/visual-capture`, await readJsonInput(flags), stringFlag(flags, 'output-dir', process.cwd()));
      print(result, json);
      return { exitCode: result.ok ? 0 : 1 };
    }
    const site = requireSite(flags);
    const token = requireToken(flags);
    if (command === 'installation-recovery') {
      const action = stringFlag(flags, 'action');
      if (!['prepare', 'complete'].includes(action)) throw new Error('Choose --action prepare or complete.');
      let input = await readJsonInput(flags);
      if (typeof input.prompt === 'string') input = JSON.parse(input.prompt);
      if (action === 'complete' && typeof input.installation_id !== 'string') throw new Error('Provide JSON {installation_id} with --prompt-file or --arguments-file.');
      print(await request(site, token, `recovery/${action}`, {method: 'POST', body: JSON.stringify(input)}, 'license'), json);
    } else if (command === 'access-mode') {
      const mode = stringFlag(flags, 'set');
      if (mode && mode !== 'direct' && mode !== 'guarded') throw new Error('--set must be direct or guarded.');
      print(await request(site, token, 'direct/settings', mode ? { method: 'POST', body: JSON.stringify({ guarded: mode === 'guarded' }) } : {}), json);
    } else if (command === 'site-tool') {
      const tool = stringFlag(flags, 'tool', 'help');
      const session = await request(site, token, 'direct/sessions', { method: 'POST', body: JSON.stringify({ mode: stringFlag(flags, 'mode', 'design') }) }) as { token: string };
      try {
        const call = (name: string, input: Record<string, unknown>) => request(site, session.token, 'direct/tools', { method: 'POST', body: JSON.stringify({ tool: name, arguments: input }) }) as Promise<{ pending?: boolean; commandId?: string; ok?: boolean; error?: string }>;
        const input = await readJsonInput(flags);
        if (stringFlag(flags, 'canvas-id')) input.canvasId = stringFlag(flags, 'canvas-id');
        let result = await call(tool, input);
        if (result.pending && result.commandId) {
          const commandId = result.commandId;
          const deadline = Date.now() + 125000;
          do {
            await new Promise(resolve => setTimeout(resolve, 400));
            result = await call('bricks.result', { commandId });
          } while (result.pending && Date.now() < deadline);
          if (result.pending) throw new Error('Builder response timed out; inspect the canvas before retrying. The change may have happened.');
        }
        if (result.ok === false) throw new Error(result.error || 'The live builder rejected the operation.');
        print(result, json);
      } finally {
        await request(site, session.token, 'direct/session', { method: 'DELETE' });
      }
    } else if (command === 'context') print(await request(site, token, 'context'), json);
    else if (command === 'capabilities') print(await request(site, token, 'capabilities'), json);
    else if (command === 'capability' || command === 'detail') {
      const id = stringFlag(flags, 'capability-id', stringFlag(flags, 'id'));
      if (!id) throw new Error('--capability-id is required.');
      const capabilityPath = id.split('/').map((segment) => encodeURIComponent(segment)).join('/');
      print(await request(site, token, `capabilities/${capabilityPath}`), json);
    } else if (command === 'approve') {
      const body = {
        surface: 'wp_admin',
        sessionId: stringFlag(flags, 'session-id', 'od-cli'),
        mode: stringFlag(flags, 'mode', 'design'),
        capabilityId: stringFlag(flags, 'capability-id', stringFlag(flags, 'id')),
        arguments: await readJsonInput(flags),
      };
      if (!body.capabilityId) throw new Error('--capability-id is required.');
      print(await request(site, token, 'approvals', { method: 'POST', body: JSON.stringify(body) }), json);
    } else if (command === 'execute') {
      const body = {
        surface: 'wp_admin',
        sessionId: stringFlag(flags, 'session-id', 'od-cli'),
        mode: stringFlag(flags, 'mode', 'ask'),
        capabilityId: stringFlag(flags, 'capability-id', stringFlag(flags, 'id')),
        arguments: await readJsonInput(flags),
        approvalToken: stringFlag(flags, 'approval-token') || undefined,
        operationId: stringFlag(flags, 'operation-id') || undefined,
        idempotencyKey: stringFlag(flags, 'idempotency-key') || undefined,
      };
      if (!body.capabilityId) throw new Error('--capability-id is required.');
      print(await request(site, token, 'execute', { method: 'POST', body: JSON.stringify(body) }), json);
    } else if (command === 'operation') {
      const id = stringFlag(flags, 'operation-id', stringFlag(flags, 'id'));
      if (!id) throw new Error('--operation-id is required.');
      print(await request(site, token, `operations/${encodeURIComponent(id)}`), json);
    } else if (command === 'audit') {
      const limit = stringFlag(flags, 'limit', '100');
      print(await request(site, token, `audit?limit=${encodeURIComponent(limit)}`), json);
    } else if (command === 'rollback') {
      const body = {
        operationId: stringFlag(flags, 'operation-id', stringFlag(flags, 'id')),
        expectedAfterFingerprint: stringFlag(flags, 'expected-after-fingerprint'),
        reason: stringFlag(flags, 'reason', 'user_requested'),
      };
      if (!body.operationId || !body.expectedAfterFingerprint) throw new Error('--operation-id and --expected-after-fingerprint are required.');
      print(await request(site, token, 'rollback', { method: 'POST', body: JSON.stringify(body) }), json);
    } else if (command === 'pairings') {
      print(await request(site, token, 'pairing'), json);
    } else {
      throw new Error(`Unknown WP Admin command: ${command}`);
    }
    return { exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = { ok: false, error: { code: 'wp_admin_cli_error', message } };
    if (json) process.stdout.write(`${JSON.stringify(payload)}\n`);
    else process.stderr.write(`${message}\n`);
    return { exitCode: 4 };
  }
}
