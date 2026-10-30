import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@open-design/components';
import type { ClaudeSignInStatus } from '@open-design/contracts';
import { claudeSignInRequest } from '../providers/daemon';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import styles from './ClaudeSignIn.module.css';

export function ClaudeSignIn({ onConnected, authenticated = false, testAction }: { onConnected: () => void; authenticated?: boolean; testAction?: ReactNode }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ClaudeSignInStatus>({state:'idle',source:null});
  const [busy, setBusy] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [code, setCode] = useState('');
  const codeId = useId();
  const notified = useRef(false);
  const revision = useRef(0);
  const connected = useRef(onConnected); connected.current = onConnected;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    const initialRevision = revision.current;
    void claudeSignInRequest('status', controller.signal).then(status => {
      if (!live.current || controller.signal.aborted || initialRevision !== revision.current) return;
      if (status.state === 'waiting') setStatus(status);
      if (status.state === 'connected' && !authenticated && !notified.current) {
        notified.current = true; setStatus(status); connected.current();
      }
    }).catch(() => {});
    return () => { live.current = false; controller.abort(); };
  }, []);
  const waiting = status.state === 'waiting';
  useEffect(() => { setCode(''); }, [status.attemptId]);
  useEffect(() => {
    if (!waiting) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let failures = 0;
    const poll = async () => {
      const pollRevision = revision.current;
      try {
        const result = await claudeSignInRequest('status', controller.signal);
        if (controller.signal.aborted) return;
        if (pollRevision !== revision.current) { timer = setTimeout(poll, 1500); return; }
        setStatus(result); setConnectionLost(false); failures = 0;
        if (result.state === 'connected' && !notified.current) { notified.current = true; connected.current(); }
        if (result.state === 'idle') setActionError(true);
        if (result.state === 'waiting') timer = setTimeout(poll, 1500);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (pollRevision !== revision.current) { timer = setTimeout(poll, 1500); return; }
        if ([401,403,404].includes(Number((error as {status?:number})?.status))) { setStatus({state:'failed',source:null}); return; }
        setConnectionLost(true);
        timer = setTimeout(poll, Math.min(15000, 1000 * 2 ** Math.min(++failures, 4)));
      }
    };
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [waiting]);
  const act = async (action: 'start' | 'cancel' | 'open-browser' | 'code') => {
    if (busy) return; setBusy(true);
    ++revision.current;
    setActionError(false);
    if (action === 'start') notified.current = false;
    const input = ['code','open-browser'].includes(action) && status.attemptId ? {attemptId:status.attemptId,...(action==='code'?{code}: {})} : undefined;
    if (action === 'code') setCode('');
    try {
      const result = await (input ? claudeSignInRequest(action, undefined, input) : claudeSignInRequest(action));
      if (live.current) {
        setStatus(result); setConnectionLost(false);
        if (result.state === 'connected' && !notified.current) { notified.current=true; connected.current(); }
      }
    }
    catch (error) {
      if (!live.current) return;
      const httpStatus = Number((error as {status?:number})?.status);
      if ([401,403,404].includes(httpStatus) || (httpStatus && action==='start')) setStatus({state:'failed',source:null});
      else if (httpStatus) setActionError(true);
      else { setStatus(current=>({...current,state:'waiting'})); setConnectionLost(true); }
    }
    finally { ++revision.current; if (live.current) setBusy(false); }
  };
  return <div className={styles.root}>
    <div className={styles.actions}>
      <Button className={styles.signIn} disabled={busy || waiting} onClick={() => void act('start')}>
        {waiting ? <><Icon name="spinner" size={14} className="icon-spin" />{t('settings.claudeWaiting')}</> : t(authenticated || status.state === 'connected' ? 'settings.claudeSignInAgain' : 'settings.claudeSignIn')}
      </Button>
      {waiting ? <Button variant="ghost" disabled={busy} onClick={() => void act('cancel')}>{t('common.cancel')}</Button> : null}
      {!waiting ? testAction : null}
    </div>
    {status.state === 'failed' || status.state === 'timed-out' || actionError ? <span role="alert" className={styles.hint}>{t('settings.claudeSignInFailed')}</span> : null}
    {waiting ? <span role="status" className={styles.hint}>{t(connectionLost ? 'settings.claudeConnectionRecovery' : 'settings.claudeBrowserHint')}</span> : null}
    {waiting && status.attemptId && (status.canOpenBrowser || status.acceptsCode) ? <div className={styles.recovery}>
      {status.canOpenBrowser ? <Button variant="ghost" disabled={busy || connectionLost} onClick={()=>void act('open-browser')}>{t('settings.claudeOpenSignIn')}</Button> : null}
      {status.acceptsCode ? <>
        <label htmlFor={codeId}>{t('settings.claudeCodeLabel')}</label>
        <div className={styles.codeRow}>
          <input id={codeId} aria-describedby={`${codeId}-hint`} type="password" autoComplete="off" spellCheck={false} value={code} disabled={busy || connectionLost} onChange={event=>setCode(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(code.trim()&&!busy&&!connectionLost)void act('code');}}}/>
          <Button disabled={busy || connectionLost || !code.trim()} onClick={()=>void act('code')}>{t('settings.claudeCompleteSignIn')}</Button>
        </div>
        <span id={`${codeId}-hint`}>{t('settings.claudeCodeHint')}</span>
      </> : null}
    </div> : null}
  </div>;
}
