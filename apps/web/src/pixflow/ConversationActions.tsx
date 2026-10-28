import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { useT } from '../i18n';
import { Icon } from '../components/Icon';
import { readChatHistory, type ChatHistoryBinding } from './chat-history-client';
import { selectFloatingConversation } from './floating-conversation';
import { getPixflowWordPressConfig } from './wordpress-context';
import styles from './ConversationActions.module.css';

/** Opens the host's existing panel; never creates a second execution surface. */
function openPanel() {
  const host = (window as Window & { pixflowDesignBricks?: { openPanel?: (reason: string) => void } }).pixflowDesignBricks;
  if (host?.openPanel) host.openPanel('continue-conversation');
  else if (!document.querySelector('#pixflow-wp-admin-agent-shell.is-open')) {
    window.dispatchEvent(new CustomEvent('pixflow-design:host-panel-toggle'));
  }
}

export function ConversationActions({ binding, disabled = false, workspace = true, onOpened }: {
  binding: ChatHistoryBinding; disabled?: boolean; workspace?: boolean; onOpened?: () => void;
}) {
  const t = useT();
  const request = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'waiting' | 'error'>('idle');
  useEffect(() => { setStatus('idle'); return () => { request.current?.abort(); }; }, [binding.projectId, binding.conversationId]);
  async function open(destination: 'panel' | 'workspace') {
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    setStatus('loading');
    try {
      await readChatHistory(binding);
      if (controller.signal.aborted) return;
      if (destination === 'workspace') {
        window.dispatchEvent(new CustomEvent('pixflow-design:open-saved-conversation', { detail: binding }));
      } else {
        openPanel();
        await selectFloatingConversation(binding, { signal: controller.signal, onWaiting: () => setStatus('waiting') });
        if (controller.signal.aborted) return;
        window.postMessage({ source: 'pixflow-design', type: 'pixflow-design:close-workspace', preserveAgentPanel: true }, window.location.origin);
      }
      window.dispatchEvent(new CustomEvent('pixflow-design:conversation-opened'));
      setStatus('idle'); onOpened?.();
    } catch { if (!controller.signal.aborted) setStatus('error'); }
  }
  const pending = status === 'loading' || status === 'waiting';
  return <div className={styles.actions}>
    <Button variant="subtle" disabled={disabled || pending} onClick={() => void open('panel')}>{t('history.continuePanel')}</Button>
    {workspace && getPixflowWordPressConfig()?.workspaceAvailable && <Button variant="subtle" disabled={disabled || pending} onClick={() => void open('workspace')}>{t('ui.wpAdminOnboardingHost.openWorkspace')}</Button>}
    {pending && <span role="status"><Icon name="spinner" size={14} /> {t(status === 'waiting' ? 'history.switchWaiting' : 'common.loading')}</span>}
    {status === 'error' && <span role="alert">{t('history.switchError')}</span>}
  </div>;
}
