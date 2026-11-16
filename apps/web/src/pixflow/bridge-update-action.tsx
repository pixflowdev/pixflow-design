import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { PixflowBridgeUpdateStatus } from '@open-design/contracts';
import { useT } from '../i18n';
import { installerUrlForPlatform } from './bridge-update';
import { ensurePixflowOptionalBridgeSiteContext, pixflowOptionalBridgeJson, probePixflowOptionalBridge } from './optional-bridge';
import { pixflowWordPressRestFetch } from './runtime-fetch';
import { hasPixflowWordPressContext } from './wordpress-context';

const route = 'pixflow/bridge-update';
const receiptKey = 'pixflow:windows-bridge-update';
const receiptLifetimeMs = 20 * 60_000;
function readReceipt(): { version?: string; started: number } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(receiptKey) || 'null');
    return typeof value?.started === 'number' && Date.now() - value.started < receiptLifetimeMs ? value : null;
  } catch { return null; }
}
function saveReceipt(value?: { version?: string; started: number }) {
  try {
    if (value) sessionStorage.setItem(receiptKey, JSON.stringify(value));
    else sessionStorage.removeItem(receiptKey);
  } catch { /* The desktop update can continue without this receipt. */ }
}
const running = (status: PixflowBridgeUpdateStatus) => ['checking', 'downloading', 'opening', 'installing'].includes(status.state);

export function isWindowsBridgeClient() {
  return typeof navigator !== 'undefined' && hasPixflowWordPressContext() &&
    /windows|win32|win64/i.test(`${navigator.platform} ${navigator.userAgent}`);
}

export function BridgeUpdateAction({ onDownload }: { onDownload?: () => void }) {
  const t = useT();
  const [health, setHealth] = useState<{ supported: boolean; version?: string }>();
  const [receipt] = useState(readReceipt);
  const [status, setStatus] = useState<PixflowBridgeUpdateStatus>({ state: receipt ? 'installing' : 'idle' });
  const requestInFlight = useRef(false);
  const [authorizing, setAuthorizing] = useState(false);
  useEffect(() => {
    let active = true;
    void probePixflowOptionalBridge({ force: true }).then(async current => {
      if (!active) return;
      const supported = current.available && current.windowsUpdate === true;
      setHealth({ supported: supported || Boolean(receipt), version: receipt?.version ?? current.version });
      if (supported && !receipt) {
        const next = await pixflowOptionalBridgeJson<PixflowBridgeUpdateStatus>(route).catch(() => null);
        if (active && !requestInFlight.current && next) setStatus(next);
      }
    });
    return () => { active = false; };
  }, [receipt]);

  const poll = running(status);
  useEffect(() => {
    if (!poll) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let retryingConnection = false;
    const deadline = (readReceipt()?.started ?? Date.now()) + receiptLifetimeMs;
    async function refresh() {
      let next: PixflowBridgeUpdateStatus | undefined;
      try {
        next = await pixflowOptionalBridgeJson<PixflowBridgeUpdateStatus>(route, { signal: controller.signal });
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (!retryingConnection && (status === 403 || status === 409)) {
          retryingConnection = true;
          await ensurePixflowOptionalBridgeSiteContext({ timeoutMs: 12_000 })
            .catch(() => { retryingConnection = false; });
        }
      }
      if (controller.signal.aborted) return;
      if (!next || next.state === 'idle') {
        // The replacement may be healthy before its updater endpoint is available.
        const current = await probePixflowOptionalBridge({ force: true, timeoutMs: 2000 });
        if (controller.signal.aborted) return;
        if (current.available && current.version && health?.version && current.version !== health.version) {
          window.dispatchEvent(new CustomEvent('pixflow-design:bridge-status', {
            detail: { checked: true, version: current.version, running: true, state: 'connected' },
          }));
          next = { state: 'up-to-date' };
        } else if (next?.state === 'idle') {
          next = { state: 'failed' };
        }
      }
      if (Date.now() > deadline) next = { state: 'failed' };
      if (next && !running(next)) {
        saveReceipt();
        setStatus(next);
        return;
      }
      timer = setTimeout(refresh, 2000);
    }
    timer = setTimeout(refresh, 1500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [poll, health?.version]);

  async function install() {
    if (requestInFlight.current || poll) return;
    requestInFlight.current = true;
    setAuthorizing(true);
    try {
      const response = await pixflowWordPressRestFetch('/wp-admin/direct/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: 'bridge-update' }),
      });
      if (!response.ok) throw new Error('Could not authorize Bridge update.');
      const { token } = await response.json() as { token?: string };
      if (!token) throw new Error('Missing Bridge update ticket.');
      saveReceipt({ version: health?.version, started: Date.now() });
      const next = await pixflowOptionalBridgeJson<PixflowBridgeUpdateStatus>(route, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      }, { timeoutMs: 12_000 });
      if (!running(next)) saveReceipt();
      setStatus(next);
    } catch {
      saveReceipt();
      setStatus({ state: 'failed' });
    } finally {
      requestInFlight.current = false;
      setAuthorizing(false);
    }
  }

  function download() {
    if (onDownload) { onDownload(); return; }
    window.open(installerUrlForPlatform('win32', null), '_blank', 'noopener');
  }

  const active = authorizing || poll;

  const complete = status.state === 'up-to-date';
  const message = authorizing ? t('updater.checking')
    : poll ? t('updater.installingRestart')
    : complete ? t('updater.upToDate')
    : status.state === 'busy' ? t('ui.designSystemFlow.pixflowDesignIsStillWorking')
    : status.state === 'failed' ? t('updater.failed') : null;
  return <span className="pixflow-bridge-update-action">
    <Button variant="subtle" type="button" disabled={!health || active || complete}
      onClick={() => health?.supported ? void install() : download()}>
      {t(health?.supported === false ? 'updater.download' : 'updater.installRestart')}
    </Button>
    {message ? <span role="status">{message}</span> : null}
  </span>;
}
