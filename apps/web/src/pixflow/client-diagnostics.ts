import { observeSupport, supportTimeline, persistBrowserEvent } from './support-timeline';
import { getPixflowWordPressConfig } from './wordpress-context';

const MAX_ENTRIES = 200;
const MAX_PACKET_BYTES = 512 * 1024;
const MAX_MESSAGE_CHARS = 8_000;

export type PixflowClientDiagnosticEntry = {
  timestamp: string;
  level: 'error' | 'warning';
  source: 'window-error' | 'unhandled-rejection' | 'manual';
  message: string;
};

const entries: PixflowClientDiagnosticEntry[] = [];
let installed = false;

function summarize(value: unknown, error?: unknown): string {
  // Errors may include response bodies, user content and signed URLs. Keep
  // only known categories before storing anything in the diagnostic ring.
  const cause = error instanceof Error ? error : value instanceof Error ? value : null;
  const text = (typeof value === 'string' ? value : cause?.message ?? '').slice(0, MAX_MESSAGE_CHARS);
  const categories = ['network', 'timeout', 'fetch', 'permission', 'quota', 'storage', 'bridge', 'diagnostics', 'abort', 'cors']
    .filter(category => new RegExp(`\\b${category}\\b`, 'iu').test(text));
  const name = cause && ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'AbortError'].includes(cause.name)
    ? cause.name : 'Error';
  return [name, ...categories].join(' · ');
}

function add(entry: PixflowClientDiagnosticEntry): void {
  entries.push(entry);
  while (entries.length > MAX_ENTRIES) entries.shift();
  while (entries.length > 1 && JSON.stringify(entries).length > MAX_PACKET_BYTES) entries.shift();
}

export function recordPixflowClientDiagnostic(
  level: PixflowClientDiagnosticEntry['level'],
  message: unknown,
  error?: unknown,
): void {
  add({
    timestamp: new Date().toISOString(),
    level,
    source: 'manual',
    message: summarize(message, error),
  });
}

export function installPixflowClientDiagnostics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pixflow-design:bridge-status', event => {
    const state = (event as CustomEvent).detail;
    if (!state) return;
    observeSupport('bridge-connection', state.siteMismatch ? 'site-mismatch' : state.updateRequired ? 'update-required'
      : state.running && state.state === 'connected' ? (state.connectionRoute === 'chrome-extension' ? 'connected-extension'
        : state.connectionRoute === 'direct' ? 'connected-direct' : 'connected') : 'disconnected');
  });
  window.addEventListener('error', (event) => {
    const file = ownedErrorFile(event.filename, event.error);
    if (!file) return;
    persistBrowserEvent('browser', 'error', 0, undefined, file, event.lineno);
    add({
      timestamp: new Date().toISOString(),
      level: 'error',
      source: 'window-error',
      message: summarize(event.message, event.error),
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const file = ownedErrorFile(undefined, reason);
    if (!file) return;
    persistBrowserEvent('browser', 'error', 0, undefined, file);
    add({
      timestamp: new Date().toISOString(),
      level: 'error',
      source: 'unhandled-rejection',
      message: summarize(reason),
    });
  });
}

export function pixflowClientDiagnosticsSnapshot(): Record<string, unknown> {
  const location = typeof window === 'undefined'
    ? null
    : `${window.location.origin}${window.location.pathname}`;
  return {
    schema: 'pixflow.client-diagnostics.v1',
    supportTimeline: supportTimeline(),
    generatedAt: new Date().toISOString(),
    location,
    visibilityState: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
    online: typeof navigator === 'undefined' ? null : navigator.onLine,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    entries: entries.slice(),
    limits: { maxEntries: MAX_ENTRIES, maxPacketBytes: MAX_PACKET_BYTES },
  };
}
function ownedErrorFile(filename: string | undefined, error: unknown): string | null {
  const frame = error instanceof Error ? error.stack?.split('\n').slice(1).find(line => line.trim()) : undefined;
  const location = filename || frame?.match(/https?:\/\/[^\s)]+/)?.[0];
  if (!location) return null;
  try {
    const url = new URL(filename ? location : location.replace(/:\d+(?::\d+)?$/, ''));
    const base = new URL(getPixflowWordPressConfig()?.pluginUrl || '/', window.location.origin);
    const owned = url.origin === base.origin && ((base.pathname !== '/' && url.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/assets/'))
      || /\/plugins\/(?:pixflow-ai|pixflow-design-pro)\/assets\//.test(url.pathname));
    const file = url.pathname.split('/').pop() || '';
    return owned && /^[\w.-]{1,96}\.m?js$/.test(file) ? file : null;
  } catch { return null; }
}
