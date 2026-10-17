import { useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { App } from '../App';
import { WpAdminAgentFrameApp } from './WpAdminAgentFrameApp';
import styles from '../components/EntryShellOnboarding.module.css';
import { loadConfig } from '../state/config';
import type { AppConfig } from '../types';

/** Admin and Bricks use the same App onboarding; completion is per WP user. */
export function WpAdminOnboardingHost({ completed, route }: { completed: boolean; route?: unknown }) {
  const translateUi = usePixflowUiTranslation();
  const [needsSetup, setNeedsSetup] = useState(!completed || route === 'none');
  const [dismissed, setDismissed] = useState(false);
  const [completedConfig, setCompletedConfig] = useState<AppConfig>();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const open = () => setDismissed(false);
    const close = () => setDismissed(true);
    window.addEventListener('pixflow-design:wp-admin-panel-open', open);
    window.addEventListener('pixflow-design:wp-admin-panel-close', close);
    return () => {
      window.removeEventListener('pixflow-design:wp-admin-panel-open', open);
      window.removeEventListener('pixflow-design:wp-admin-panel-close', close);
    };
  }, []);
  useEffect(() => {
    if (dismissed || !needsSetup) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); }
      if (event.key !== 'Tab' || !dialog.current) return;
      const targets = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(item => item.getClientRects().length);
      const first = targets[0]; const last = targets.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [dismissed, needsSetup]);
  useEffect(() => {
    function changed(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.source === 'pixflow-design' && event.data.type === 'pixflow-design:close-workspace') {
        setDismissed(true);
        if (event.data.preserveAgentPanel !== true) window.dispatchEvent(new CustomEvent('pixflow-design:wp-admin-close'));
        return;
      }
      if (event.data?.source !== 'pixflow-design' || event.data.type !== 'pixflow-design:onboarding-completed') return;
      // The page's PHP bootstrap predates setup. Hand the composer the saved
      // selection instead of letting that stale bootstrap restore defaults.
      if (event.data.completed === true) setCompletedConfig(loadConfig());
      setNeedsSetup(event.data.completed !== true || event.data.route === 'none');
      setDismissed(false);
    }
    window.addEventListener('message', changed);
    return () => window.removeEventListener('message', changed);
  }, []);
  if (!needsSetup) return <WpAdminAgentFrameApp initialConfig={completedConfig} />;
  return <>
    <div className={styles.launch}><strong>{translateUi("ui.wpAdminOnboardingHost.welcomeToPixflowDesign")}</strong><p>{translateUi("ui.wpAdminOnboardingHost.finishYourSetupToGetStarted")}</p><Button onClick={() => setDismissed(false)}>{translateUi("ui.wpAdminOnboardingHost.continueSetup")}</Button></div>
    {!dismissed && createPortal(<div className="pixflow-design-token-scope"><div className={styles.adminBackdrop}>
      <div ref={dialog} tabIndex={-1} className={styles.adminDialog} role="dialog" aria-modal="true" aria-label={translateUi("ui.wpAdminOnboardingHost.setUpPixflowDesign")}>
        <App />
      </div>
    </div></div>, document.body)}
  </>;
}
