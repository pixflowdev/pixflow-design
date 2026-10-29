import { useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { Dict } from '../i18n/types';

export type BridgeStatusPayload = {
  connectionRoute?: 'direct' | 'chrome-extension';
  checked?: boolean;
  running?: boolean;
  state?: string;
  status?: string;
  updateRequired?: boolean;
  siteMismatch?: boolean;
  reconnecting?: boolean;
  error?: unknown;
};

type RenderedBridgeStatus = {
  state: 'checking' | 'connected' | 'disconnected' | 'update';
  label: keyof Dict;
  actionLabel: keyof Dict | null;
};

type PixflowBridgeWindow = Window & {
  pixflowDesignBridgeStatus?: BridgeStatusPayload;
};

export function normalizeBridgeStatus(payload: BridgeStatusPayload): RenderedBridgeStatus {
  const explicitState = String(payload.state ?? payload.status ?? '').trim().toLowerCase();
  const checked = payload.checked === true || explicitState !== '';
  const updateRequired = payload.updateRequired === true || explicitState === 'update';
  const siteMismatch = payload.siteMismatch === true || explicitState === 'mismatch';
  const connected = payload.running === true || explicitState === 'connected';
  const reconnecting = explicitState === 'checking'
    || explicitState === 'switching'
    || payload.reconnecting === true;

  if (updateRequired) {
    return { state: 'update', label: 'ui.finalAnnotation.bridgeUpdate', actionLabel: 'ui.finalAnnotation.update' };
  }
  if (reconnecting || !checked) {
    return { state: 'checking', label: 'ui.finalAnnotation.bridgeChecking', actionLabel: null };
  }
  if (connected && !siteMismatch && !payload.error) {
    return { state: 'connected', label: 'ui.finalAnnotation.bridgeConnected', actionLabel: null };
  }
  return {
    state: 'disconnected',
    label: siteMismatch ? 'ui.finalAnnotation.bridgeOtherSite' : 'ui.finalAnnotation.bridgeDisconnected',
    actionLabel: 'ui.xaiOAuthControl.reconnect',
  };
}

function initialBridgeStatus(): RenderedBridgeStatus | null {
  if (typeof window === 'undefined') return null;
  const payload = (window as PixflowBridgeWindow).pixflowDesignBridgeStatus;
  return payload ? normalizeBridgeStatus(payload) : null;
}

/**
 * React counterpart of the shared floating-panel Bridge control. The host
 * heartbeat remains the sole connection authority; this component renders
 * its published state and sends the same site-aware reconnect request.
 */
export function WorkspaceBridgeStatus() {
  const translateUi = usePixflowUiTranslation();
  const shared = typeof window !== 'undefined' ? (window as Window & {
    PixflowDesignFloatingPanel?: { createBridgeStatusControl(options: { surface: string; showReconnect?: boolean }): HTMLElement & { destroy(): void } };
  }).PixflowDesignFloatingPanel : undefined;
  const mount = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!shared || !mount.current) return;
    const control = shared.createBridgeStatusControl({ surface: 'workspace-header' });
    mount.current.appendChild(control);
    return () => { control.destroy(); control.remove(); };
  }, [shared]);
  const [status, setStatus] = useState<RenderedBridgeStatus | null>(initialBridgeStatus);

  useEffect(() => {
    function onBridgeStatus(event: Event) {
      const detail = event instanceof CustomEvent
        ? event.detail as BridgeStatusPayload
        : {};
      setStatus(normalizeBridgeStatus(detail));
    }

    window.addEventListener('pixflow-design:bridge-status', onBridgeStatus);
    return () => window.removeEventListener('pixflow-design:bridge-status', onBridgeStatus);
  }, []);

  if (shared) return <span ref={mount} />;
  if (!status) return null;

  function requestReconnect() {
    if (status?.state === 'checking') return;
    window.dispatchEvent(new CustomEvent('pixflow-design:bridge-reconnect-request', {
      detail: { source: 'workspace-header' },
    }));
  }

  return (
    <div
      className="pixflow-agent-bridge-status pixflow-design-token-scope"
      data-state={status.state}
      role="status"
      aria-live="polite"
      aria-label={translateUi(status.label)}
      title={translateUi(status.label)}
    >
      <span className="pixflow-agent-bridge-status__identity">
        {translateUi("ui.settingsDialog.bridge")} <span className="pixflow-agent-bridge-status__dot" aria-hidden />
      </span>
      {status.actionLabel && <button
        type="button"
        className="pixflow-agent-bridge-status__reconnect"
        disabled={status.state === 'checking'}
        onClick={requestReconnect}
      >
        {translateUi(status.actionLabel)}
      </button>}
    </div>
  );
}
