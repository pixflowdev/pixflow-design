import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import type { ClaudeSignInStatus } from '@open-design/contracts';
import { claudeSignInRequest } from '../providers/daemon';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import styles from './ClaudeSignIn.module.css';

export function ClaudeSignIn({ onConnected }: { onConnected: () => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<ClaudeSignInStatus['state']>('idle');
  const [busy, setBusy] = useState(false);
  const connected = useRef(onConnected); connected.current = onConnected;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    void claudeSignInRequest('status', controller.signal).then(status => {
      if (live.current && status.state === 'waiting') setState('waiting');
    }).catch(() => {});
    return () => { live.current = false; controller.abort(); };
  }, []);
  useEffect(() => {
    if (state !== 'waiting') return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await claudeSignInRequest('status', controller.signal);
        if (controller.signal.aborted) return;
        setState(result.state);
        if (result.state === 'connected') connected.current();
        if (result.state === 'waiting') timer = setTimeout(poll, 1500);
      } catch { if (!controller.signal.aborted) setState('failed'); }
    };
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [state]);
  const act = async (action: 'start' | 'cancel') => {
    if (busy) return; setBusy(true);
    try { const result = await claudeSignInRequest(action); if (live.current) setState(result.state); }
    catch { if (live.current) setState('failed'); }
    finally { if (live.current) setBusy(false); }
  };
  const waiting = state === 'waiting';
  return <div className={styles.root}>
    <div className={styles.actions}>
      <Button className={styles.signIn} disabled={busy || waiting || state === 'connected'} onClick={() => void act('start')}>
        {waiting ? <><Icon name="spinner" size={14} className="icon-spin" />{t('settings.claudeWaiting')}</> : t(state === 'connected' ? 'settings.claudeSignedIn' : 'settings.claudeSignIn')}
      </Button>
      {waiting ? <Button variant="ghost" disabled={busy} onClick={() => void act('cancel')}>{t('common.cancel')}</Button> : null}
    </div>
    {state === 'failed' || state === 'timed-out' ? <span role="alert" className={styles.hint}>{t('settings.claudeSignInFailed')}</span> : null}
    {waiting ? <span role="status" className={styles.hint}>{t('settings.claudeBrowserHint')}</span> : null}
  </div>;
}
