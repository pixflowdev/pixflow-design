// @ts-nocheck
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { todoSnapshotHasUnfinishedWork } from '@open-design/contracts';
import { normalizeMediaExecutionPolicyForRun } from './media-policy.js';
import {
  normalizeRunToolBundleForRun,
  summarizeRunToolBundle,
} from './run-tool-bundle.js';
import { projectWorkspaceProvenance } from './workspace-contract.js';

export const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

export function defaultSignalWindowsProcessTree(pid, signal) {
  const args = ['/PID', String(pid), '/T'];
  if (signal === 'SIGKILL') args.push('/F');
  const result = spawnSync('taskkill.exe', args, {
    stdio: 'ignore',
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

function readString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractErrorDetails(data) {
  const payload = data && typeof data === 'object' ? data : {};
  const nested = payload.error && typeof payload.error === 'object' ? payload.error : {};
  return {
    error: readString(nested.message) ?? readString(payload.message),
    errorCode: readString(nested.code) ?? readString(payload.code),
  };
}

export function createChatRunService({
  createSseResponse,
  createSseErrorPayload,
  maxEvents = 2_000,
  ttlMs = 30 * 60 * 1000,
  shutdownGraceMs = 3_000,
  // Absolute directory under which per-run event JSONL logs are written
  // (one file per run at <runsLogDir>/<runId>/events.jsonl). When null,
  // event persistence is disabled and statusBody.eventsLogPath = null —
  // legacy behavior. The path is surfaced through MCP get_run so an
  // external coding agent can `tail` the file in its own shell during
  // a long OD generation, instead of polling blindly and giving up.
  runsLogDir = null,
  onEventEmitted = null,
  runtimePlatform = process.platform,
  signalWindowsProcessTree = defaultSignalWindowsProcessTree,
}) {
  const runs = new Map();

  const create = (meta = {}) => {
    const now = Date.now();
    const id = randomUUID();
    const run = {
      id,
      projectId: typeof meta.projectId === 'string' && meta.projectId ? meta.projectId : null,
      conversationId: typeof meta.conversationId === 'string' && meta.conversationId ? meta.conversationId : null,
      assistantMessageId: typeof meta.assistantMessageId === 'string' && meta.assistantMessageId ? meta.assistantMessageId : null,
      clientRequestId: typeof meta.clientRequestId === 'string' && meta.clientRequestId ? meta.clientRequestId : null,
      agentId: typeof meta.agentId === 'string' && meta.agentId ? meta.agentId : null,
      projectMetadata:
        meta.projectMetadata && typeof meta.projectMetadata === 'object' && !Array.isArray(meta.projectMetadata)
          ? meta.projectMetadata
          : null,
      // Plan §3.A1 / spec §11.5. The applied plugin snapshot id pins
      // every prompt fragment and tool gate to a frozen view so replay
      // is byte-equal across plugin upgrades. Runs are in-memory in
      // v1 — the id lives on the run object plus on the
      // `applied_plugin_snapshots` row (FK back via run_id).
      appliedPluginSnapshotId:
        typeof meta.appliedPluginSnapshotId === 'string' && meta.appliedPluginSnapshotId
          ? meta.appliedPluginSnapshotId
          : null,
      pluginId:
        typeof meta.pluginId === 'string' && meta.pluginId ? meta.pluginId : null,
      mediaExecution: normalizeMediaExecutionPolicyForRun(meta.mediaExecution),
      toolBundle: normalizeRunToolBundleForRun(meta.toolBundle),
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      events: [],
      nextEventId: 1,
      clients: new Set(),
      waiters: new Set(),
      child: null,
      acpSession: null,
      childPid: null,
      processGroupId: null,
      childExitObservedAt: null,
      exitCode: null,
      signal: null,
      error: null,
      errorCode: null,
      cancelRequested: false,
      lastTodoSnapshot: null,
      truncatedMidTurn: false,
      endedWithUnfinishedWork: false,
      eventsLogPath: runsLogDir ? path.join(runsLogDir, id, 'events.jsonl') : null,
      eventsLogStream: null,
      eventsLogClosed: false,
      onFinalize: null,
    };
    runs.set(run.id, run);
    return run;
  };

  const get = (id) => runs.get(id) ?? null;

  const scheduleCleanup = (run) => {
    setTimeout(() => {
      if (TERMINAL_RUN_STATUSES.has(run.status)) runs.delete(run.id);
    }, ttlMs).unref?.();
  };

  // Lazily open the per-run event log on first emit. The directory may
  // not exist yet; mkdir is recursive so it's safe to call repeatedly.
  // Disk failures are best-effort — if we can't write, the run still
  // proceeds (SSE clients keep getting events from memory).
  const ensureLogStream = (run) => {
    if (!run.eventsLogPath) return null;
    if (run.eventsLogStream) return run.eventsLogStream;
    if (run.eventsLogClosed) return null;
    try {
      fs.mkdirSync(path.dirname(run.eventsLogPath), { recursive: true });
      run.eventsLogStream = fs.createWriteStream(run.eventsLogPath, { flags: 'a' });
      // Don't crash the daemon on a stream-level error; just stop
      // trying to use this stream so subsequent emits silently skip.
      run.eventsLogStream.on('error', () => {
        try { run.eventsLogStream?.destroy(); } catch { /* ignore */ }
        run.eventsLogStream = null;
      });
      return run.eventsLogStream;
    } catch {
      return null;
    }
  };

  const emit = (run, event, data) => {
    if (event === 'error') {
      const details = extractErrorDetails(data);
      if (details.error) run.error = details.error;
      if (details.errorCode) run.errorCode = details.errorCode;
    }
    const id = run.nextEventId++;
    const record = { id, event, data, timestamp: Date.now() };
    if (onEventEmitted) {
      try { onEventEmitted(run, record); } catch { /* observer must not break streaming */ }
    }
    run.events.push(record);
    if (run.events.length > maxEvents) run.events.splice(0, run.events.length - maxEvents);
    run.updatedAt = Date.now();
    const stream = ensureLogStream(run);
    if (stream) {
      try {
        stream.write(JSON.stringify(record) + '\n');
      } catch {
        // Stream-level write errors are caught by the on('error') above;
        // swallowing here keeps the SSE fan-out below from being skipped.
      }
    }
    for (const sse of run.clients) sse.send(event, data, id);
    return record;
  };

  const statusBody = (run) => ({
    id: run.id,
    projectId: run.projectId,
    conversationId: run.conversationId,
    assistantMessageId: run.assistantMessageId,
    agentId: run.agentId,
    appliedPluginSnapshotId: run.appliedPluginSnapshotId ?? null,
    pluginId: run.pluginId ?? null,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    cancelRequested: !!run.cancelRequested,
    childPid: typeof run.child?.pid === 'number' ? run.child.pid : run.childPid ?? null,
    processGroupId: run.processGroupId ?? null,
    childExited: !run.child || run.child.exitCode !== null || run.child.signalCode !== null,
    childExitObservedAt: run.childExitObservedAt ?? null,
    exitCode: run.exitCode,
    signal: run.signal,
    error: run.error ?? null,
    errorCode: run.errorCode ?? null,
    resumable: run.resumable ?? false,
    endedWithUnfinishedWork: !!run.endedWithUnfinishedWork,
    eventsLogPath: run.eventsLogPath ?? null,
    workspace: projectWorkspaceProvenance(run.projectMetadata),
    mediaExecution: run.mediaExecution ?? normalizeMediaExecutionPolicyForRun(null),
    toolBundle: summarizeRunToolBundle(run.toolBundle),
  });

  const finish = (run, status, code: number | null = null, signal: string | null = null) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return;
    run.status = status;
    run.exitCode = code;
    run.signal = signal;
    run.updatedAt = Date.now();
    if (typeof run.onFinalize === 'function') {
      const finalize = run.onFinalize;
      run.onFinalize = null;
      try { finalize(); } catch { /* best-effort */ }
    }
    run.endedWithUnfinishedWork =
      Boolean(run.truncatedMidTurn)
      || todoSnapshotHasUnfinishedWork(run.lastTodoSnapshot);
    emit(run, 'end', {
      code,
      signal,
      status,
      resumable: run.resumable ?? false,
      endedWithUnfinishedWork: run.endedWithUnfinishedWork,
    });
    for (const sse of run.clients) sse.end();
    run.clients.clear();
    for (const waiter of run.waiters) waiter(statusBody(run));
    run.waiters.clear();
    // Close the event log stream now that no more events will be
    // emitted for this run. The file stays on disk for tail/grep.
    try { run.eventsLogStream?.end(); } catch { /* ignore */ }
    run.eventsLogStream = null;
    run.eventsLogClosed = true;
    scheduleCleanup(run);
  };

  const fail = (run, code, message, init = {}) => {
    emit(run, 'error', createSseErrorPayload(code, message, init));
    finish(run, 'failed', 1, null);
  };

  const start = (run, starter) => {
    run.analyticsTelemetry = {
      ...(run.analyticsTelemetry ?? {}),
      startRequestedAt: Date.now(),
    };
    void starter(run).catch((err) => {
      fail(run, 'AGENT_EXECUTION_FAILED', err instanceof Error ? err.message : String(err));
    });
    return run;
  };

  const stream = async (run, req, res) => {
    const sse = createSseResponse(res);
    const requested = Number(req.get('Last-Event-ID') || req.query.after || 0);
    let lastEventId = Number.isFinite(requested) && requested >= 0 ? requested : 0;
    const snapshot = [...run.events];
    const first = snapshot[0]?.id ?? run.nextEventId;
    const live = [];
    let replaying = true, closed = false;
    const send = (record) => {
      if (closed || record.id <= lastEventId) return;
      sse.send(record.event, record.data, record.id);
      lastEventId = record.id;
    };
    // Subscribe before asynchronous disk reads so completion and new deltas
    // cannot fall between the replay snapshot and the live subscription.
    const client = { ...sse, send: (event, data, id) => {
      const record={event,data,id};
      if (replaying) live.push(record); else send(record);
    }, end: () => { if (!replaying) sse.end(); } };
    run.clients.add(client);
    res.on('close', () => { closed=true; run.clients.delete(client); sse.cleanup(); });
    if (lastEventId + 1 < first) {
      try {
        if (!run.eventsLogPath) throw new Error('No durable replay');
        const input=fs.createReadStream(run.eventsLogPath,{encoding:'utf8'});
        const lines=createInterface({input,crlfDelay:Infinity});
        try {
          for await (const line of lines) {
            if (closed) break;
            const record=JSON.parse(line);
            if (record.id>=first) break;
            if (record.id<=lastEventId) continue;
            if (record.id!==lastEventId+1) throw new Error('Incomplete durable replay');
            send(record);
          }
        } finally { lines.close(); input.destroy(); }
        if (!closed && lastEventId+1<first) throw new Error('Incomplete durable replay');
      } catch {
        // Do not masquerade a truncated answer as a successful recovery.
        sse.send('error',createSseErrorPayload('RUN_REPLAY_UNAVAILABLE','The complete reply could not be recovered. Keep this tab open and retry.'),null);
        sse.end(); run.clients.delete(client); return;
      }
    }
    let sent = 0;
    for (const record of [...snapshot,...live]) {
      if (record.id > lastEventId) {
        send(record);
        sent++;
      }
    }
    replaying=false;
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      // Guarantee a reattaching client sees a terminal signal even if its
      // cursor is at or past the final event id — otherwise the SSE
      // stream ends silently and the client falls back to status-only fetch.
      if (sent === 0 && run.events.length > 0) {
        const last = run.events[run.events.length - 1];
        sse.send(last.event, last.data, last.id);
      }
      sse.end();
      run.clients.delete(client);
      return;
    }
  };

  const list = ({ projectId, conversationId, status } = {}) => Array.from(runs.values()).filter((run) => {
    if (typeof projectId === 'string' && projectId && run.projectId !== projectId) return false;
    if (typeof conversationId === 'string' && conversationId && run.conversationId !== conversationId) return false;
    if (status === 'active') return !TERMINAL_RUN_STATUSES.has(run.status);
    if (typeof status === 'string' && status) return run.status === status;
    return true;
  });

  const childHasExited = (child) =>
    !child || child.exitCode !== null || child.signalCode !== null;

  const recordChildExitObserved = (run) => {
    if (!run.childExitObservedAt) run.childExitObservedAt = Date.now();
  };

  const waitForChildExit = (child, timeoutMs) => {
    if (!child) return Promise.resolve(true);
    if (childHasExited(child)) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (exited) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.off?.('close', onClose);
        child.off?.('exit', onClose);
        resolve(exited);
      };
      const onClose = () => done(true);
      const timer = setTimeout(() => done(false), timeoutMs);
      timer.unref?.();
      child.once?.('close', onClose);
      child.once?.('exit', onClose);
    });
  };

  const forceWaitMs = () => {
    const raw = Number(process.env.OD_CHAT_RUN_CANCEL_FORCE_WAIT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 500;
  };

  const signalChildProcess = (child, processGroupId, signal) => {
    if (!child || childHasExited(child)) return false;
    if (runtimePlatform === 'win32' && Number.isInteger(child.pid)) {
      try {
        if (signalWindowsProcessTree(child.pid, signal)) return true;
      } catch {
        // Fall through to direct-child signalling if taskkill is unavailable.
      }
    }
    if (runtimePlatform !== 'win32' && Number.isInteger(processGroupId)) {
      try {
        process.kill(-processGroupId, signal);
        return true;
      } catch {
        // Fall through to direct-child signalling if the group is already
        // gone or could not be signalled.
      }
    }
    try {
      return child.kill(signal);
    } catch {
      return false;
    }
  };

  const signalProcessGroup = (processGroupId, signal) => {
    if (runtimePlatform === 'win32' || !Number.isInteger(processGroupId)) return false;
    try {
      process.kill(-processGroupId, signal);
    } catch {
      // The group may already be gone or permission may have changed. The
      // group signal was still the correct best-effort action.
    }
    return true;
  };

  const killChild = (run, signal) =>
    signalChildProcess(run.child, run.processGroupId, signal)
    || signalProcessGroup(run.processGroupId, signal);

  const cancelGraceMs = () => {
    const raw = Number(
      process.env.OD_CHAT_RUN_CANCEL_GRACE_MS
      || process.env.OD_CHAT_RUN_SHUTDOWN_GRACE_MS,
    );
    return Number.isFinite(raw) && raw > 0 ? raw : shutdownGraceMs;
  };

  const reapProcessGroup = (processGroupId) => {
    if (!signalProcessGroup(processGroupId, 'SIGTERM')) return false;
    const timer = setTimeout(() => {
      signalProcessGroup(processGroupId, 'SIGKILL');
    }, cancelGraceMs());
    timer.unref?.();
    return true;
  };

  const finishCanceledFromChildState = (run, fallbackSignal = 'SIGTERM') => {
    const child = run.child;
    if (childHasExited(child)) recordChildExitObserved(run);
    finish(run, 'canceled', child?.exitCode ?? null, child?.signalCode ?? fallbackSignal);
    return statusBody(run);
  };

  const cancel = async (run) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return statusBody(run);
    run.cancelRequested = true;
    run.updatedAt = Date.now();
    if (run.stdinOpen && run.child?.stdin && !run.child.stdin.destroyed) {
      try { run.child.stdin.end(); } catch { /* signal fallback below */ }
      run.stdinOpen = false;
    }
    if (!run.child) {
      finish(run, 'canceled', null, 'SIGTERM');
      return statusBody(run);
    }

    if (run.acpSession?.abort) {
      try {
        run.acpSession.abort();
      } catch {
        // Process signalling below owns eventual termination.
      }
      const graceMs = Number(process.env.PI_ABORT_GRACE_MS) || cancelGraceMs();
      if (await waitForChildExit(run.child, graceMs)) {
        return finishCanceledFromChildState(run, 'SIGTERM');
      }
      killChild(run, 'SIGTERM');
      if (await waitForChildExit(run.child, graceMs)) {
        return finishCanceledFromChildState(run, 'SIGTERM');
      }
      killChild(run, 'SIGKILL');
      await waitForChildExit(run.child, forceWaitMs());
      return finishCanceledFromChildState(run, 'SIGKILL');
    }

    killChild(run, 'SIGTERM');
    if (await waitForChildExit(run.child, cancelGraceMs())) {
      return finishCanceledFromChildState(run, 'SIGTERM');
    }
    killChild(run, 'SIGKILL');
    await waitForChildExit(run.child, forceWaitMs());
    return finishCanceledFromChildState(run, 'SIGKILL');
  };

  const shutdownActive = async ({ graceMs = shutdownGraceMs } = {}) => {
    const activeRuns = Array.from(runs.values()).filter((run) => !TERMINAL_RUN_STATUSES.has(run.status));
    await Promise.all(activeRuns.map(async (run) => {
      run.cancelRequested = true;
      run.updatedAt = Date.now();
      if (run.acpSession?.abort) {
        try {
          run.acpSession.abort();
        } catch {
          // Process signals below are the shutdown fallback.
        }
      }
      killChild(run, 'SIGTERM');
      finish(run, 'canceled', null, 'SIGTERM');
      if (run.child && !(await waitForChildExit(run.child, graceMs))) {
        killChild(run, 'SIGKILL');
        await waitForChildExit(run.child, 500);
      }
    }));
  };

  const wait = (run) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return Promise.resolve(statusBody(run));
    return new Promise((resolve) => run.waiters.add(resolve));
  };

  // Drop a run from the in-memory registry without emitting any terminal
  // event. Used by callers that prepared a run optimistically (created the
  // record before some external precondition was checked) and need to undo
  // the create without surfacing the run via `/api/runs`. Only valid before
  // the run reaches a terminal status — terminal runs use scheduleCleanup
  // and would already have notified any subscribers.
  const drop = (run) => {
    if (!run) return;
    if (TERMINAL_RUN_STATUSES.has(run.status)) return;
    if (typeof run.onFinalize === 'function') {
      const finalize = run.onFinalize;
      run.onFinalize = null;
      try { finalize(); } catch { /* best-effort */ }
    }
    runs.delete(run.id);
    for (const sse of run.clients) {
      try { sse.end(); } catch { /* best-effort detach */ }
    }
    run.clients.clear();
    // Resolve any pending waiters with a synthetic "canceled" status so
    // they unblock instead of hanging forever — the run is being dropped
    // because nothing will ever start.
    run.status = 'canceled';
    run.updatedAt = Date.now();
    for (const waiter of run.waiters) waiter(statusBody(run));
    run.waiters.clear();
  };

  return {
    create,
    start,
    get,
    list,
    stream,
    cancel,
    shutdownActive,
    wait,
    emit,
    finish,
    fail,
    drop,
    signalChild: killChild,
    signalChildProcess,
    signalProcessGroup,
    reapProcessGroup,
    statusBody,
    isTerminal(status) {
      return TERMINAL_RUN_STATUSES.has(status);
    },
  };
}
