import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import {
  APP_KEYS,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type SidecarStamp,
} from '@open-design/sidecar-proto';
import type { SidecarRuntimeContext } from '@open-design/sidecar';

import {
  STANDALONE_LAUNCH_WARNING,
  createDiagnosticsExportHandler,
} from '../src/diagnostics-export.js';

interface MockResponse {
  status(code: number): MockResponse;
  setHeader(name: string, value: string): MockResponse;
  end(payload: Buffer): void;
  json(payload: unknown): void;
  capturedStatus?: number;
  capturedPayload?: Buffer;
  capturedJson?: unknown;
  capturedHeaders?: Record<string, string>;
}

function mockResponse(): MockResponse {
  const res: MockResponse = {
    status(code) { res.capturedStatus = code; return res; },
    setHeader(name, value) { (res.capturedHeaders ??= {})[name.toLowerCase()] = value; return res; },
    end(payload) { res.capturedPayload = payload; },
    json(payload) { res.capturedJson = payload; },
  };
  return res;
}

interface DiagnosticsManifestFile {
  name: string;
}

describe('diagnostics export handler — non-sidecar launch', () => {
  // Reviewer-requested regression spec: `runDaemonCliStartup()` calls
  // `startDaemonRuntime()` without a runtime context, so plain `od` users
  // hit the diagnostics handler with `options.runtime == null`. The bundle
  // must still produce a valid zip AND surface a manifest warning that
  // file-based logs were not captured, so the operator can tell the
  // diff between "no logs because plain launch" and "no logs because
  // something genuinely broke."
  it('emits a standalone-launch warning when runtime is null', async () => {
    const handler = createDiagnosticsExportHandler({ runtime: null, projectRoot: '/tmp/test-project' });
    const res = mockResponse();
    // Express RequestHandler signature wants three args; the handler only
    // reads `res`, so casting through `unknown` keeps the test focused.
    await handler({} as never, res as never, () => undefined);

    expect(res.capturedStatus).toBe(200);
    expect(res.capturedPayload).toBeInstanceOf(Buffer);
    const zip = await JSZip.loadAsync(res.capturedPayload!);
    const manifestRaw = await zip.file('summary/manifest.json')!.async('string');
    const manifest = JSON.parse(manifestRaw) as {
      warnings: string[];
      files: DiagnosticsManifestFile[];
    };
    expect(manifest.warnings).toContain(STANDALONE_LAUNCH_WARNING);
    // Standalone launches intentionally omit sidecar-managed daemon/web/desktop
    // log files, but real developer machines may still contribute matching
    // macOS crash reports from /Library/Logs/DiagnosticReports. Keep the test
    // focused on the contract that no sidecar log files are bundled.
    expect(
      manifest.files.filter((file) => file.name.startsWith('logs/')),
    ).toEqual([]);
  });
});

describe('diagnostics export handler — packaged (runtime) layout', () => {
  // Regression for the namespaceRoot off-by-one that left every packaged
  // bundle without daemon/web logs (the agent-run flow lives in the daemon
  // log). In packaged builds the orchestrator launches each child with
  // `base = <namespaceRoot>/runtime` while the logs live a level up at
  // `<namespaceRoot>/logs`. The old `resolveNamespaceRoot(base, namespace)`
  // resolved the daemon log to `<namespaceRoot>/runtime/<namespace>/logs/...`
  // → ENOENT, so the bundle silently captured nothing.
  it('captures the daemon log from the real <namespaceRoot>/logs tree', async () => {
    const root = join(tmpdir(), `od-diag-${randomUUID()}`);
    const namespaceRoot = join(root, 'namespaces', 'release-stable');
    const daemonLogPath = join(namespaceRoot, 'logs', APP_KEYS.DAEMON, 'latest.log');
    const marker = 'DAEMON-LOG-MARKER critique runId=rc100-poster';
    try {
      await mkdir(dirname(daemonLogPath), { recursive: true });
      await writeFile(daemonLogPath, `${marker}\n`, 'utf8');

      const runtime: SidecarRuntimeContext<SidecarStamp> = {
        app: APP_KEYS.DAEMON,
        // packaged launches children with base == <namespaceRoot>/runtime
        base: join(namespaceRoot, 'runtime'),
        ipc: '/tmp/od-diag-test-daemon.sock',
        mode: SIDECAR_MODES.RUNTIME,
        namespace: 'release-stable',
        source: SIDECAR_SOURCES.PACKAGED,
      };

      const handler = createDiagnosticsExportHandler({ runtime, projectRoot: '/tmp/test-project' });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);

      // The log must be present with its real contents, not a missing-file
      // placeholder.
      const daemonEntry = zip.file('logs/daemon/latest.log');
      expect(daemonEntry).not.toBeNull();
      expect(await daemonEntry!.async('string')).toContain(marker);

      const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
        files: { name: string; bytes: number; error?: string }[];
      };
      const daemonFile = manifest.files.find((f) => f.name === 'logs/daemon/latest.log');
      expect(daemonFile?.error).toBeUndefined();
      expect(daemonFile?.bytes ?? 0).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports missing packaged log files under logical log paths without duplicating runtime segments', async () => {
    const root = join(tmpdir(), `od-diag-missing-${randomUUID()}`);
    const namespaceRoot = join(root, 'namespaces', 'release-beta');
    const daemonLogPath = join(namespaceRoot, 'logs', APP_KEYS.DAEMON, 'latest.log');
    try {
      await mkdir(dirname(daemonLogPath), { recursive: true });
      await writeFile(daemonLogPath, 'daemon ok\n', 'utf8');

      const runtime: SidecarRuntimeContext<SidecarStamp> = {
        app: APP_KEYS.DAEMON,
        base: join(namespaceRoot, 'runtime'),
        ipc: '/tmp/od-diag-missing.sock',
        mode: SIDECAR_MODES.RUNTIME,
        namespace: 'release-beta',
        source: SIDECAR_SOURCES.PACKAGED,
      };

      const handler = createDiagnosticsExportHandler({ runtime, projectRoot: '/tmp/test-project' });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);
      const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
        files: Array<{ name: string; bytes?: number; error?: string }>;
      };
      const fileNames = manifest.files.map((file) => file.name);
      expect(fileNames).toContain('logs/daemon/latest.log');
      expect(fileNames).toContain('logs/web/latest.log');
      expect(fileNames).toContain('logs/desktop/latest.log');
      expect(fileNames.some((name) => name.includes('runtime/release-beta/logs'))).toBe(false);

      const webLog = manifest.files.find((file) => file.name === 'logs/web/latest.log');
      const desktopLog = manifest.files.find((file) => file.name === 'logs/desktop/latest.log');
      expect(webLog?.error).toBeTruthy();
      expect(desktopLog?.error).toBeTruthy();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});

describe('diagnostics export handler — run event logs', () => {
  it('bundles recent per-run events.jsonl logs for agent stream forensics', async () => {
    const root = join(tmpdir(), `od-diag-runs-${randomUUID()}`);
    const runsDir = join(root, 'runs');
    const runLogPath = join(runsDir, 'run-3165', 'events.jsonl');
    const marker = 'Agent stalled without emitting any new output for 600s';
    try {
      await mkdir(dirname(runLogPath), { recursive: true });
      await writeFile(
        runLogPath,
        JSON.stringify({
          event: 'agent',
          data: { type: 'raw', line: marker },
        }) + '\n',
        'utf8',
      );

      const handler = createDiagnosticsExportHandler({
        runtime: null,
        projectRoot: '/tmp/test-project',
        runsDir,
      });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);
      const runEntry = zip.file('runs/run-3165/events.jsonl');
      expect(runEntry).not.toBeNull();
      expect(await runEntry!.async('string')).toContain(marker);

      const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
        files: { name: string; bytes: number; error?: string }[];
      };
      const runFile = manifest.files.find((file) => file.name === 'runs/run-3165/events.jsonl');
      expect(runFile?.error).toBeUndefined();
      expect(runFile?.bytes ?? 0).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('diagnostics export handler — Pixflow profile', () => {
  it('redacts hostile nested credentials and signed URLs in POST attachments', async () => {
    const handler = createDiagnosticsExportHandler({ runtime: null, projectRoot: '/tmp/test-project', profile: 'pixflow' });
    const res = mockResponse();
    await handler({ method: 'POST', body: {
      pluginVersion: '2.0.2',
      wordpress: { nested: [{ authorization: 'Bearer CANARY_AUTH_9372', cookie: 'CANARY_COOKIE_9372' }] },
      client: { entries: [{ message: 'Authorization: Bearer CANARY_HEADER_9372' }] },
      context: { url: 'https://example.test/download?token=CANARY_URL_9372', password: 'CANARY_PASSWORD_9372' },
    } } as never, res as never, () => undefined);
    expect(res.capturedStatus).toBe(200);
    expect(res.capturedHeaders?.['x-content-type-options']).toBe('nosniff');
    expect(res.capturedHeaders?.['cache-control']).toBe('no-store');
    const zip = await JSZip.loadAsync(res.capturedPayload!);
    const contents = await Promise.all(Object.values(zip.files).filter(file => !file.dir).map(file => file.async('string')));
    expect(contents.join('\n')).not.toContain('CANARY_');
  });

  it('rejects oversized POST attachments without returning their contents', async () => {
    const handler = createDiagnosticsExportHandler({ runtime: null, projectRoot: '/tmp/test-project', profile: 'pixflow' });
    const res = mockResponse();
    await handler({ method: 'POST', body: { client: { message: 'CANARY_OVERSIZE_' + 'x'.repeat(1024 * 1024) } } } as never, res as never, () => undefined);
    expect(res.capturedStatus).toBe(500);
    expect(res.capturedPayload).toBeUndefined();
    expect(JSON.stringify(res.capturedJson)).not.toContain('CANARY_');
    expect(res.capturedJson).toMatchObject({ error: 'DIAGNOSTICS_EXPORT_FAILED' });
  });

  it('does not copy private prompt or page text echoed in provider errors into summaries', async () => {
    const root = join(tmpdir(), `od-diag-private-${randomUUID()}`);
    const runsDir = join(root, 'runs');
    const log = join(runsDir, 'run-private', 'events.jsonl');
    const privateText = 'CUSTOMER_UNPUBLISHED_PAGE_8273';
    try {
      await mkdir(dirname(log), { recursive: true });
      await writeFile(log, [
        { event: 'agent', data: { type: 'error', message: `Provider error while rendering ${privateText}`, label: privateText } },
        { event: 'stderr', data: { chunk: `fatal: rejected content ${privateText}` } },
      ].map(row => JSON.stringify(row)).join('\n'));
      const res = mockResponse();
      await createDiagnosticsExportHandler({ runtime: null, projectRoot: root, runsDir, profile: 'pixflow' })({} as never, res as never, () => undefined);
      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);
      const summary = await zip.file('agent/run-summaries.json')!.async('string');
      expect(summary).not.toContain(privateText);
      expect(summary).toContain('error');
      expect(summary).toContain('fatal');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brands the archive, includes bounded WordPress evidence, and omits host identity', async () => {
    const handler = createDiagnosticsExportHandler({
      runtime: null,
      projectRoot: '/tmp/test-project',
      profile: 'pixflow',
    });
    const res = mockResponse();
    await handler({
      method: 'POST',
      body: {
        pluginVersion: '1.1.5',
        wordpress: { schema: 'pixflow.wordpress-diagnostics.v1', token: 'secret-value' },
        client: { schema: 'pixflow.client-diagnostics.v1', entries: [] },
        context: { surface: 'wp-admin-floating-panel' },
      },
    } as never, res as never, () => undefined);

    expect(res.capturedStatus).toBe(200);
    expect(res.capturedHeaders?.['content-type']).toBe('application/zip');
    expect(res.capturedHeaders?.['content-disposition']).toContain('pixflow-design-diagnostics-');
    const zip = await JSZip.loadAsync(res.capturedPayload!);
    expect(zip.file('wordpress/environment.json')).not.toBeNull();
    expect(await zip.file('wordpress/environment.json')!.async('string')).not.toContain('secret-value');
    const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as { app: { name: string } };
    expect(manifest.app.name).toBe('pixflow-design');
    const machine = JSON.parse(await zip.file('summary/machine-info.json')!.async('string')) as Record<string, unknown>;
    expect(machine.hostname).toBeUndefined();
    expect(machine.username).toBeUndefined();
    expect(res.capturedPayload!.byteLength).toBeLessThanOrEqual(25 * 1024 * 1024);
  });

});
