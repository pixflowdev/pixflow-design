import { requestWordPressRest } from './license';
import {
  normalizePixflowOptionalBridgeError,
  notifyPixflowOptionalBridgeDisconnected,
  pixflowOptionalBridgeApiUrl,
  probePixflowOptionalBridge,
} from './optional-bridge';
import {
  createPixflowBricksAgentMessage,
  isPixflowBricksAgentMessage,
  PIXFLOW_BRICKS_AGENT_FRAME_SOURCE,
  PIXFLOW_BRICKS_AGENT_SHELL_SOURCE,
} from './bricks-agent-frame-protocol';

export type PixflowSyncProject = {
  localProjectId: string;
  wpProjectUuid?: string;
  title?: string;
  latestVersion?: number | null;
  lastSyncedHash?: string;
  lastSyncedAt?: string;
  restBaseUrl?: string;
};

export type PixflowWordPressProjectLock = {
  id?: number;
  projectId?: number;
  userId?: number;
  userName?: string;
  sessionId?: string;
  status?: string;
  lockedAt?: string;
  updatedAt?: string;
  expiresAt?: string;
};

export type PixflowWordPressProject = {
  uuid: string;
  title?: string;
  latestVersion?: { versionNumber?: number; fileHash?: string } | null;
  lock?: PixflowWordPressProjectLock | null;
};

export type PixflowSyncAuth = {
  ok: boolean;
  restBaseUrl: string;
  token: string;
  expiresIn?: number;
  message?: string;
};

export type PixflowSyncState = {
  schema?: number;
  projects?: Record<string, PixflowSyncProject>;
  updatedAt?: string;
};

export type PixflowSyncStatus = {
  ok: boolean;
  context?: Record<string, unknown>;
  state?: PixflowSyncState;
};

export type PixflowProjectSyncConflict = {
  ok: false;
  code: 'remote_changed' | 'project_locked' | 'version_exists' | string;
  message?: string;
  latestVersion?: {
    versionNumber?: number;
    fileHash?: string;
    archivePathUrl?: string;
    manifestPathUrl?: string;
  };
  lock?: PixflowWordPressProjectLock | null;
  resolution?: {
    openLatest?: boolean;
    saveAsNewVersion?: boolean;
    keepLocalCopy?: boolean;
  };
};

export async function fetchPixflowSyncStatus(): Promise<PixflowSyncStatus> {
  const health = await probePixflowOptionalBridge({ timeoutMs: 750 }).catch(() => null);
  if (!health?.available) {
    return {
      ok: true,
      state: {
        schema: 1,
        projects: {},
        updatedAt: new Date(0).toISOString(),
      },
    };
  }

  const response = await fetchOptionalBridge(pixflowOptionalBridgeApiUrl('/pixflow-sync/projects'));
  if (!response.ok) {
    throw new Error(`Pixflow project sync status failed (${response.status})`);
  }
  return await response.json() as PixflowSyncStatus;
}

export async function fetchPixflowWordPressProjects(): Promise<PixflowWordPressProject[]> {
  const response = await requestWordPressRest<{ ok?: boolean; projects?: PixflowWordPressProject[] }>('projects');
  if (!response.ok || response.body?.ok === false) {
    throw new Error('Could not load shared Pixflow projects.');
  }
  return response.body.projects ?? [];
}

export async function fetchPixflowWordPressProject(uuid: string): Promise<PixflowWordPressProject | null> {
  const response = await requestWordPressRest<{ ok?: boolean; project?: PixflowWordPressProject }>(
    `projects/${encodeURIComponent(uuid)}`,
  );
  if (!response.ok || response.body?.ok === false) {
    throw new Error('Could not load shared Pixflow project.');
  }
  return response.body.project ?? null;
}

export async function fetchPixflowWordPressProjectLock(
  wpProjectUuid: string,
): Promise<PixflowWordPressProjectLock | null> {
  const response = await requestWordPressRest<{ ok?: boolean; lock?: PixflowWordPressProjectLock | null }>(
    `projects/${encodeURIComponent(wpProjectUuid)}/lock`,
  );
  if (!response.ok || response.body?.ok === false) {
    throw new Error('Could not read shared Pixflow project lock.');
  }
  return response.body.lock ?? null;
}

export async function acquirePixflowWordPressProjectLock(input: {
  wpProjectUuid: string;
  sessionId: string;
  ttlSeconds?: number;
  metadata?: Record<string, unknown>;
}): Promise<PixflowWordPressProjectLock | null> {
  const response = await requestWordPressRest<{
    ok?: boolean;
    message?: string;
    lock?: PixflowWordPressProjectLock | null;
  }>(`projects/${encodeURIComponent(input.wpProjectUuid)}/lock`, {
    method: 'POST',
    body: {
      sessionId: input.sessionId,
      ttlSeconds: input.ttlSeconds ?? 180,
      metadata: input.metadata ?? {},
    },
  });
  if (!response.ok || response.body?.ok === false) {
    throw new Error(response.body?.message ?? 'Could not lock shared Pixflow project.');
  }
  return response.body.lock ?? null;
}

export async function releasePixflowWordPressProjectLock(input: {
  wpProjectUuid: string;
  sessionId: string;
}): Promise<void> {
  await requestWordPressRest(`projects/${encodeURIComponent(input.wpProjectUuid)}/lock`, {
    method: 'DELETE',
    body: { sessionId: input.sessionId },
  });
}

export async function exportPixflowProjectToWordPress(input: {
  projectId: string;
  restBaseUrl: string;
  nonce?: string;
  token?: string;
  wpProjectUuid?: string;
  title?: string;
  summary?: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  expectedVersionNumber?: number | null;
  expectedFileHash?: string;
  lockSessionId?: string;
  saveAsNewVersion?: boolean;
  allowConflict?: boolean;
}): Promise<unknown> {
  const response = await fetchOptionalBridge(pixflowOptionalBridgeApiUrl(`/pixflow-sync/projects/${encodeURIComponent(input.projectId)}/export`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload && payload.ok === false)) {
    throw new PixflowProjectSyncError(
      payload?.message || `Pixflow project export failed (${response.status})`,
      payload,
      response.status,
    );
  }
  return payload;
}

export async function requestPixflowSyncAuth(): Promise<PixflowSyncAuth> {
  if (typeof window === 'undefined') {
    throw new Error('Pixflow WordPress sync bridge is not available.');
  }

  if (isHostedBricksAgentFrame()) {
    return requestHostedBricksAgentSyncAuth();
  }

  if (window.parent === window) {
    const shell = window.__PIXFLOW_DESIGN_WORDPRESS__ || window.pixflowDesignShell;
    const restBaseUrl = String(shell?.restBaseUrl || '').replace(/\/+$/, '');
    const restNonce = String(shell?.restNonce || '');
    if (!restBaseUrl || !restNonce) {
      throw new Error('Pixflow WordPress sync context is not available.');
    }
    const response = await fetch(`${restBaseUrl}/projects/sync-token`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-WP-Nonce': restNonce,
      },
      body: '{}',
    });
    const body = await response.json().catch(() => ({})) as { ok?: boolean; token?: string; expiresIn?: number; message?: string };
    const auth = {
      ok: response.ok && body.ok !== false,
      restBaseUrl,
      token: String(body.token || ''),
      expiresIn: Number(body.expiresIn || 0),
      message: String(body.message || ''),
    };
    if (!auth.ok || !auth.token) {
      throw new Error(auth.message || 'WordPress sync credentials are unavailable.');
    }
    return auth;
  }

  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pixflow-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const response = new Promise<PixflowSyncAuth>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('WordPress sync credentials request timed out.'));
    }, 10000);

    function onMessage(event: MessageEvent): void {
      const data = event.data as {
        source?: string;
        type?: string;
        requestId?: string;
        payload?: PixflowSyncAuth;
      } | null;
      if (
        !data
        || data.source !== 'pixflow-design-shell'
        || data.type !== 'pixflow-design:wp-sync-auth-response'
        || data.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(data.payload ?? { ok: false, restBaseUrl: '', token: '' });
    }

    window.addEventListener('message', onMessage);
  });

  // Pixflow-owned: request auth only for explicit shared project sync actions;
  // the parent WordPress frame exchanges its nonce/cookie for a short-lived
  // bridge token instead of exposing cookie-bound auth to the daemon.
  window.parent.postMessage({
    source: 'pixflow-design',
    type: 'pixflow-design:wp-sync-auth-request',
    requestId,
  }, '*');

  const auth = await response;
  if (!auth.ok || !auth.restBaseUrl || !auth.token) {
    throw new Error(auth.message || 'WordPress sync credentials are unavailable.');
  }
  return auth;
}

function isHostedBricksAgentFrame(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('pixflowBricksAgent') === '1';
}

async function requestHostedBricksAgentSyncAuth(): Promise<PixflowSyncAuth> {
  if (!window.parent || window.parent === window) {
    throw new Error('Pixflow WordPress sync bridge is not available.');
  }

  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `pixflow-sync:${crypto.randomUUID()}`
      : `pixflow-sync:${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const response = new Promise<{ ok?: boolean; status?: number; body?: unknown }>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('WordPress sync credentials request timed out.'));
    }, 15000);

    function onMessage(event: MessageEvent): void {
      if (!isPixflowBricksAgentMessage(event.data)) return;
      if (event.data.source !== PIXFLOW_BRICKS_AGENT_SHELL_SOURCE) return;
      if (event.data.type !== 'pixflow-bricks-agent:wp-rest-response') return;
      if (event.data.requestId !== requestId) return;

      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      if (event.data.error) {
        reject(new Error(event.data.error.message || 'WordPress sync credentials request failed.'));
        return;
      }
      resolve((event.data.payload || {}) as { ok?: boolean; status?: number; body?: unknown });
    }

    window.addEventListener('message', onMessage);
  });

  // Pixflow-owned: hosted Bricks Agent iframe has no WordPress nonce. Ask the
  // builder shell to issue the same short-lived sync token through the
  // authenticated REST broker it already uses for Bricks Agent calls.
  window.parent.postMessage(createPixflowBricksAgentMessage(
    PIXFLOW_BRICKS_AGENT_FRAME_SOURCE,
    'pixflow-bricks-agent:wp-rest-request',
    {
      path: 'projects/sync-token',
      method: 'POST',
      headers: {},
      body: {},
    },
    { requestId },
  ), '*');

  const payload = await response;
  const body = (payload.body && typeof payload.body === 'object' ? payload.body : {}) as {
    ok?: boolean;
    token?: string;
    expiresIn?: number;
    message?: string;
  };
  const restBaseUrl = String(window.pixflowDesignShell?.restBaseUrl || '');
  const auth = {
    ok: Boolean(payload.ok) && body.ok !== false,
    restBaseUrl,
    token: String(body.token || ''),
    expiresIn: Number(body.expiresIn || 0),
    message: String(body.message || ''),
  };
  if (!auth.ok || !auth.restBaseUrl || !auth.token) {
    throw new Error(auth.message || 'WordPress sync credentials are unavailable.');
  }
  return auth;
}

export async function importPixflowProjectFromWordPress(input: {
  wpProjectUuid: string;
  restBaseUrl: string;
  nonce?: string;
  token?: string;
  projectId?: string;
  versionNumber?: number;
  overwrite?: boolean;
}): Promise<unknown> {
  const response = await fetchOptionalBridge(pixflowOptionalBridgeApiUrl('/pixflow-sync/projects/import'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload && payload.ok === false)) {
    throw new PixflowProjectSyncError(
      payload?.message || `Pixflow project import failed (${response.status})`,
      payload,
      response.status,
    );
  }
  return payload;
}

export class PixflowProjectSyncError extends Error {
  body: unknown;
  status: number;

  constructor(message: string, body: unknown, status: number) {
    super(message);
    this.name = 'PixflowProjectSyncError';
    this.body = body;
    this.status = status;
  }
}

async function fetchOptionalBridge(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, {
      cache: 'no-store',
      targetAddressSpace: 'loopback',
      ...init,
    } as RequestInit);
  } catch (error) {
    const normalized = normalizePixflowOptionalBridgeError(error);
    notifyPixflowOptionalBridgeDisconnected(normalized);
    throw normalized;
  }
}
