'use client';

import { useT as usePixflowUiTranslation } from '../i18n';
import { TranslatedText } from '../i18n/TranslatedText';
// xAI / SuperGrok OAuth control rendered inside the Grok provider row in
// the Settings → Media Providers panel.
//
// Mirrors the shape of McpOAuthControl in McpClientSection.tsx (state
// machine, polling cadence, CSS classes), but skips the postMessage /
// BroadcastChannel handshake because the xAI callback is served by the
// one-shot listener on 127.0.0.1:56121 — a separate process that can't
// talk to the OD UI directly. Polling /api/xai/auth/status is the only
// delivery channel for "auth completed".
//
// TODO(i18n): the visible strings are hardcoded English for the PoC;
// migrate to apps/web/src/i18n/types.ts before stable release.



import { useEffect, useRef, useState } from 'react';

interface XaiAuthStatus {
  connected: boolean;
  listening?: boolean;
  expiresAt?: number | null;
  scope?: string | null;
  savedAt?: number;
}

interface StartResponse {
  authorizeUrl: string;
  state: string;
  callback: { host: string; port: number };
}

type Busy =
  | 'idle'
  | 'starting'
  | 'awaiting'
  | 'disconnecting'
  | 'refreshing';

async function fetchStatus(): Promise<XaiAuthStatus | null> {
  try {
    const r = await fetch('/api/xai/auth/status', { credentials: 'same-origin' });
    if (!r.ok) return null;
    return (await r.json()) as XaiAuthStatus;
  } catch {
    return null;
  }
}

async function startOAuth(): Promise<
  { ok: true; response: StartResponse } | { ok: false; message: string }
> {
  try {
    const r = await fetch('/api/xai/oauth/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: '{}',
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const message =
        typeof body?.error === 'string' && body.error
          ? body.error
          : `daemon returned HTTP ${r.status}`;
      return { ok: false, message };
    }
    return { ok: true, response: body as StartResponse };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function disconnectOAuth(): Promise<boolean> {
  try {
    const r = await fetch('/api/xai/oauth/disconnect', {
      method: 'POST',
      credentials: 'same-origin',
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function cancelInFlightOAuth(): Promise<void> {
  // Best-effort. If the daemon is unreachable the listener will still
  // self-close on its 30 min timeout; we don't surface a failure to
  // the user because Cancel is a UX affordance, not a critical action.
  try {
    await fetch('/api/xai/oauth/cancel', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // ignore
  }
}

async function completeOAuthManual(
  state: string,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const r = await fetch('/api/xai/oauth/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ state, code }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const message =
        typeof body?.error === 'string' && body.error
          ? body.error
          : `daemon returned HTTP ${r.status}`;
      return { ok: false, message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function XaiOAuthControl() {
  const translateUi = usePixflowUiTranslation();
  const [status, setStatus] = useState<XaiAuthStatus | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<string | null>(null);
  // Authorize URL kept around as a fallback link in case the popup blocker
  // ate window.open or the user closed the tab and wants to re-open it.
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  // State emitted by /oauth/start. Needed to complete a paste-back when
  // xAI shows a manual code instead of redirecting to the loopback.
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [pasteCode, setPasteCode] = useState('');
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    const data = await fetchStatus();
    if (data) setStatus(data);
    return data;
  };

  useEffect(() => {
    void refresh();
    return () => stopPoll();
  }, []);

  function stopPoll() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function startPoll() {
    stopPoll();
    let elapsed = 0;
    pollTimer.current = setInterval(() => {
      elapsed += 2000;
      void (async () => {
        const data = await refresh();
        if (data?.connected) {
          setBusy('idle');
          setError(null);
          setPendingAuthUrl(null);
          setPendingState(null);
          setPasteCode('');
          stopPoll();
        }
        // Intentionally NOT auto-clearing the awaiting state when
        // `data.listening` flips false. xAI commonly shows a paste-back
        // page instead of redirecting, in which case the loopback
        // listener never receives a callback and self-closes after its
        // 30 min timeout — but the user still has a valid code in their
        // clipboard. Keeping pendingState live lets them paste it; the
        // `Cancel` button is the manual way out.
      })();
      // Hard cap at 30 min — same as the daemon-side listener timeout.
      if (elapsed >= 30 * 60 * 1000) stopPoll();
    }, 2000);
  }

  const onConnect = async () => {
    setError(null);
    setPendingAuthUrl(null);
    setPendingState(null);
    setPasteCode('');
    setBusy('starting');
    const result = await startOAuth();
    if (!result.ok) {
      setBusy('idle');
      setError(result.message);
      return;
    }
    setBusy('awaiting');
    setPendingAuthUrl(result.response.authorizeUrl);
    setPendingState(result.response.state);
    startPoll();
    try {
      // noopener,noreferrer breaks the auth.x.ai tab's reference back to
      // this Settings tab, defending against reverse-tabnabbing if the
      // remote page (or any redirect-target along the OAuth chain) ever
      // turns hostile. The xAI flow doesn't use postMessage — the
      // callback comes back through the daemon's :56121 listener (or
      // the paste-back input below), so opener access is unnecessary.
      window.open(
        result.response.authorizeUrl,
        '_blank',
        'noopener,noreferrer',
      );
    } catch {
      // Fallback anchor is always rendered while pending.
    }
  };

  const onPasteSubmit = async () => {
    const trimmed = pasteCode.trim();
    if (!pendingState || !trimmed) return;
    setBusy('refreshing');
    setError(null);
    const result = await completeOAuthManual(pendingState, trimmed);
    if (!result.ok) {
      setBusy('awaiting');
      setError(result.message);
      return;
    }
    setBusy('idle');
    setPendingAuthUrl(null);
    setPendingState(null);
    setPasteCode('');
    stopPoll();
    await refresh();
  };

  const onRefreshStatus = async () => {
    setBusy('refreshing');
    const data = await refresh();
    setBusy('idle');
    if (data?.connected) {
      setError(null);
      setPendingAuthUrl(null);
      stopPoll();
    } else if (busy === 'awaiting' || pendingAuthUrl) {
      setBusy('awaiting');
    }
  };

  const onCancelPending = () => {
    // Tell the daemon to stop its one-shot 127.0.0.1:56121 listener so
    // the singleton port doesn't sit pinned for the full 30 min server
    // timeout. Fire-and-forget — UI state clears immediately either way.
    void cancelInFlightOAuth();
    setPendingAuthUrl(null);
    setPendingState(null);
    setPasteCode('');
    setBusy('idle');
    setError(null);
    stopPoll();
  };

  const onDisconnect = async () => {
    setBusy('disconnecting');
    const ok = await disconnectOAuth();
    setBusy('idle');
    if (ok) {
      setError(null);
      setPendingAuthUrl(null);
      setStatus({ connected: false });
    } else {
      setError(translateUi("ui.xaiOAuthControl.disconnectFailedCheckDaemonLogs"));
    }
  };

  const connected = Boolean(status?.connected);
  const expiresLabel =
    status?.expiresAt && status.expiresAt > 0
      ? new Date(status.expiresAt).toLocaleString()
      : null;
  // "Awaiting" once we've started the dance: the authorize URL is open OR
  // a state is pending OR the daemon is processing a paste-back. Stays
  // true even when the loopback listener self-closes, so the paste-back
  // input stays interactive until the user cancels or the token lands.
  const isAwaiting =
    busy === 'awaiting'
    || busy === 'refreshing'
    || (Boolean(pendingState) && !connected)
    || (Boolean(pendingAuthUrl) && !connected);

  return (
    <div className={`mcp-oauth-control${connected ? ' connected' : ''}`}>
      <div className="mcp-oauth-status" aria-live="polite">
        {connected ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-ok" aria-hidden />
            <span>
              <strong>{translateUi("ui.xaiOAuthControl.signedInWithX")}</strong>{' '}
              {expiresLabel ? (
                <span className="hint">
                  {translateUi("ui.xaiOAuthControl.supergrokSubscriptionTokenExpires", { expires: expiresLabel })} </span>
              ) : (
                <span className="hint">
                  {translateUi("ui.xaiOAuthControl.supergrokSubscriptionConnectedYouCanCloseAny")} </span>
              )}
            </span>
          </>
        ) : isAwaiting ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-pending" aria-hidden />
            <span>
              <strong>{translateUi("ui.xaiOAuthControl.waitingForAuthorization")}</strong>{' '}
              <span className="hint">
                <TranslatedText id="ui.xaiOAuthControl.pixflowDesignIsListeningForTheCallback" values={{ signedIn: <em>{translateUi("settings.amrSignedIn")}</em> }} /> </span>
            </span>
          </>
        ) : (
          <>
            <span className="mcp-oauth-dot" aria-hidden />
            <span>
              <strong>{translateUi("ui.xaiOAuthControl.notSignedIn")}</strong>{' '}
              <span className="hint">
                {translateUi("ui.xaiOAuthControl.clickSignInWithXToUse")} </span>
            </span>
          </>
        )}
      </div>

      {isAwaiting ? (
        <div className="xai-oauth-warning" role="status">
          <strong>{translateUi("ui.xaiOAuthControl.headsUp")}</strong>  <TranslatedText id="ui.xaiOAuthControl.xaiMayShowAPageThatSays" values={{ signedIn: <em>{translateUi("ui.xaiOAuthControl.signedInWithX2")}</em> }} /> </div>
      ) : null}

      <div className="mcp-oauth-actions">
        {connected ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={onConnect}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
              title={translateUi("ui.xaiOAuthControl.reAuthenticateReplacesTheExistingToken")}
            >
              {busy === 'starting' || busy === 'awaiting'
                ? translateUi("ui.xaiOAuthControl.connecting")
                : translateUi("ui.xaiOAuthControl.reconnect")}
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy !== 'idle'}
            >
              {busy === 'disconnecting' ? translateUi("ui.xaiOAuthControl.disconnecting") : translateUi("connectors.disconnect")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="primary"
              onClick={onConnect}
              disabled={busy !== 'idle'}
            >
              {busy === 'starting' ? translateUi("ui.xaiOAuthControl.openingBrowser") : translateUi("ui.xaiOAuthControl.signInWithX")}
            </button>
            {isAwaiting ? (
              <>
                <button type="button" onClick={onRefreshStatus} disabled={busy === 'refreshing'}>
                  {busy === 'refreshing' ? translateUi("ui.xaiOAuthControl.checking") : translateUi("ui.xaiOAuthControl.refreshStatus")}
                </button>
                <button type="button" onClick={onCancelPending}>
                  {translateUi("dictationCancel")} </button>
              </>
            ) : null}
          </>
        )}
      </div>

      {pendingAuthUrl && !connected ? (
        <div className="mcp-oauth-fallback hint">
          {translateUi("ui.xaiOAuthControl.browserTabDidnTOpen")}{' '}
          <a href={pendingAuthUrl} target="_blank" rel="noopener noreferrer">
            {translateUi("ui.xaiOAuthControl.clickHereToOpenTheAuthorizeUrl")} </a>
          .
        </div>
      ) : null}

      {isAwaiting && pendingState ? (
        <div className="xai-oauth-paste">
          <p className="hint">
            {translateUi("ui.xaiOAuthControl.xaiMayShowACodeInsteadOf")} </p>
          <div className="xai-oauth-paste-row">
            <input
              type="text"
              value={pasteCode}
              placeholder={translateUi("ui.xaiOAuthControl.pasteAuthCodeFromXai")}
              onChange={(e) => setPasteCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pasteCode.trim()) {
                  void onPasteSubmit();
                }
              }}
              disabled={busy === 'refreshing'}
              aria-label={translateUi("ui.xaiOAuthControl.pasteAuthCodeFromXai")}
            />
            <button
              type="button"
              onClick={onPasteSubmit}
              disabled={!pasteCode.trim() || busy === 'refreshing'}
            >
              {busy === 'refreshing' ? translateUi("ui.xaiOAuthControl.submitting") : translateUi("ui.xaiOAuthControl.submitCode")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mcp-oauth-error" role="alert">
          {error}
        </div>
      ) : null}

      {status?.scope ? (
        <div className="mcp-oauth-scope hint">
          {translateUi("ui.xaiOAuthControl.grantedScopes")} <code>{status.scope}</code>
        </div>
      ) : null}
    </div>
  );
}
