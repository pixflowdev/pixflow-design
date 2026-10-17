import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';
import { pixflowWordPressRestFetch } from '../pixflow/runtime-fetch';
import { getPixflowWordPressConfig, hasPixflowWordPressContext } from '../pixflow/wordpress-context';
import { pixflowClientDiagnosticsSnapshot, recordPixflowClientDiagnostic } from '../pixflow/client-diagnostics';

// Mirrors what apps/desktop preload exposes via contextBridge. Kept inline
// so the web bundle does not import the desktop package.
type DesktopExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

interface OpenDesignDesktopApi {
  exportDiagnostics(): Promise<DesktopExportResult>;
}

declare global {
  interface Window {
    openDesignDesktop?: OpenDesignDesktopApi;
  }
}

const DIAGNOSTICS_EXPORT_PATH = '/api/diagnostics/export';
const DIAGNOSTICS_FILENAME_PREFIX = 'pixflow-design-diagnostics';
const STATUS_CLEAR_MS = 6000;
const MAX_PIXFLOW_DIAGNOSTICS_ZIP_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_OBJECT_URL_LIFETIME_MS = 60_000;

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

function fileNameFromHeader(header: string | null): string | null {
  if (header == null) return null;
  const match = /filename\*=UTF-8''([^;\n]+)|filename="([^"]+)"|filename=([^;\n]+)/i.exec(header);
  if (match == null) return null;
  const raw = match[1] ?? match[2] ?? match[3];
  if (raw == null) return null;
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

function fallbackFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${DIAGNOSTICS_FILENAME_PREFIX}-${stamp}.zip`;
}

function isZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && (
      (bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08)
    );
}

export async function validateDiagnosticsZip(res: Response): Promise<Blob> {
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/zip')) {
    throw new Error(`Diagnostics server returned ${contentType || 'an unknown content type'} instead of a ZIP archive.`);
  }
  const declaredLength = Number(res.headers.get('content-length') || 0);
  if (declaredLength > MAX_PIXFLOW_DIAGNOSTICS_ZIP_BYTES) {
    throw new Error('Diagnostics archive exceeded the 25 MiB download limit.');
  }
  const blob = await res.blob();
  if (blob.size <= 0 || blob.size > MAX_PIXFLOW_DIAGNOSTICS_ZIP_BYTES) {
    throw new Error(blob.size <= 0
      ? 'Diagnostics server returned an empty archive.'
      : 'Diagnostics archive exceeded the 25 MiB download limit.');
  }
  const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (!isZipSignature(signature)) {
    throw new Error('Diagnostics response was not a valid ZIP archive. Nothing was downloaded.');
  }
  return blob;
}

/**
 * Keep the object URL alive after the synthetic click. Chromium can defer
 * claiming a blob-backed download until after the current task; revoking it
 * synchronously leaves the download visible as "Stopped".
 */
export function triggerDiagnosticsDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_OBJECT_URL_LIFETIME_MS);
  }
}

/**
 * Start a browser-owned HTTP download. Pixflow WordPress surfaces use this
 * instead of a Blob URL because Chromium can abandon synthetic cross-surface
 * Blob downloads and leave them permanently marked as "Stopped".
 */
export function triggerDiagnosticsHttpDownload(downloadUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => link.remove(), DOWNLOAD_OBJECT_URL_LIFETIME_MS);
}

async function pixflowDiagnosticsPacket(): Promise<Record<string, unknown>> {
  const config = getPixflowWordPressConfig();
  let wordpress: Record<string, unknown> = {};
  try {
    const response = await pixflowWordPressRestFetch('/diagnostics/snapshot', { cache: 'no-store' });
    if (!response.ok) throw new Error(`WordPress diagnostics returned HTTP ${response.status}`);
    const payload = await response.json() as { snapshot?: unknown };
    if (payload.snapshot && typeof payload.snapshot === 'object' && !Array.isArray(payload.snapshot)) {
      wordpress = payload.snapshot as Record<string, unknown>;
    }
  } catch (error) {
    recordPixflowClientDiagnostic('warning', 'WordPress diagnostics snapshot could not be collected.', error);
    wordpress = {
      schema: 'pixflow.wordpress-diagnostics-unavailable.v1',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    pluginVersion: config?.version,
    wordpress,
    client: pixflowClientDiagnosticsSnapshot(),
    context: {
      schema: 'pixflow.diagnostics-surface-context.v1',
      generatedAt: new Date().toISOString(),
      surface: new URLSearchParams(window.location.search).get('pixflowBricksAgent') === '1'
        ? 'bricks-floating-panel'
        : new URLSearchParams(window.location.search).get('pixflowWpAdminAgent') === '1'
          ? 'wp-admin-floating-panel'
          : 'workspace',
      siteHash: config?.siteHash || null,
      siteOrigin: config?.siteOrigin || null,
      runtime: config?.runtime || null,
      runtimeMode: config?.runtimeMode || null,
      bridgeRequiredVersion: config?.bridgeRequiredVersion || null,
    },
  };
}

async function exportViaHttp(): Promise<{ filename: string }> {
  const pixflow = hasPixflowWordPressContext();
  if (pixflow) {
    const packet = await pixflowDiagnosticsPacket();
    const res = await pixflowWordPressRestFetch('/diagnostics/prepare', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: packet.client, context: packet.context }),
    });
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        if (body && typeof body.message === 'string') message = body.message;
      } catch {
        // ignore body parse errors
      }
      throw new Error(message);
    }
    const prepared = await res.json() as {
      downloadUrl?: unknown;
      filename?: unknown;
    };
    const downloadUrl = String(prepared.downloadUrl || '');
    const filename = String(prepared.filename || fallbackFilename());
    let parsedDownloadUrl: URL;
    try {
      parsedDownloadUrl = new URL(downloadUrl, window.location.href);
    } catch {
      throw new Error('WordPress returned an invalid diagnostics download ticket. Nothing was downloaded.');
    }
    const restRoute = String(parsedDownloadUrl.searchParams.get('rest_route') || '');
    const validDiagnosticsPath = /\/pixflow-design\/v1\/diagnostics\/download\/[a-f0-9]{64}$/u;
    if (
      parsedDownloadUrl.origin !== window.location.origin
      || (!validDiagnosticsPath.test(parsedDownloadUrl.pathname) && !validDiagnosticsPath.test(restRoute))
    ) {
      throw new Error('WordPress returned an invalid diagnostics download ticket. Nothing was downloaded.');
    }
    triggerDiagnosticsHttpDownload(parsedDownloadUrl.href, filename);
    return { filename };
  }

  const res = await fetch(DIAGNOSTICS_EXPORT_PATH, { credentials: 'same-origin' });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      // ignore body parse errors
    }
    throw new Error(message);
  }
  const blob = await validateDiagnosticsZip(res);
  const filename = fileNameFromHeader(res.headers.get('content-disposition')) ?? fallbackFilename();
  triggerDiagnosticsDownload(blob, filename);
  return { filename };
}

/**
 * Designed for the Settings → About panel. Renders a labeled button with a
 * short status line below it. Works in both the Electron shell (uses native
 * save dialog via window.openDesignDesktop) and the browser (triggers a
 * browser download via the daemon HTTP endpoint).
 */
export function ExportDiagnosticsRow() {
  const t = useT();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (clearTimer.current != null) clearTimeout(clearTimer.current);
  }, []);

  const scheduleClear = () => {
    if (clearTimer.current != null) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setStatus({ kind: 'idle' }), STATUS_CLEAR_MS);
  };

  const handleClick = async () => {
    if (status.kind === 'busy') return;
    setStatus({ kind: 'busy' });
    try {
      if (window.openDesignDesktop != null && !hasPixflowWordPressContext()) {
        const result = await window.openDesignDesktop.exportDiagnostics();
        if (result.ok) {
          setStatus({ kind: 'success', message: t('diagnostics.exportSuccess', { path: result.path }) });
          scheduleClear();
          return;
        }
        if (result.cancelled) {
          setStatus({ kind: 'idle' });
          return;
        }
        setStatus({ kind: 'error', message: t('diagnostics.exportFailed', { message: result.message }) });
        scheduleClear();
        return;
      }
      const { filename } = await exportViaHttp();
      setStatus({ kind: 'success', message: t('diagnostics.exportSuccess', { path: filename }) });
      scheduleClear();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({ kind: 'error', message: t('diagnostics.exportFailed', { message }) });
      scheduleClear();
    }
  };

  const busy = status.kind === 'busy';
  return (
    <div className="diagnostics-export-row">
      <button
        type="button"
        className="ghost diagnostics-export-button"
        onClick={() => void handleClick()}
        disabled={busy}
        data-status={status.kind}
      >
        <Icon name="download" size={14} />
        <span>{busy ? t('diagnostics.exporting') : t('diagnostics.exportButton')}</span>
      </button>
      {status.kind === 'success' || status.kind === 'error' ? (
        <p className={`diagnostics-export-status ${status.kind}`} role="status">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
