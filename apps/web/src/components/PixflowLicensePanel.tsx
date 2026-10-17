import { IconArrowUpRight, IconCheck, IconChevronDown, IconCopy, IconRefresh, IconShieldCheck } from '@tabler/icons-react';
import { TranslatedText } from '../i18n/TranslatedText';
import { useT as usePixflowUiTranslation } from '../i18n';
import { useEffect, useId, useRef, useState } from 'react';
import styles from './PixflowLicensePanel.module.css';
import { Button } from '@open-design/components';
import { PixflowProMigration } from './PixflowProMigration';
import {
  fetchPixflowLicenseStatus,
  isPixflowWordPressEmbed,
  resetPixflowLicense,
  validatePixflowLicense,
  preparePixflowInstallationRecovery,
  completePixflowInstallationRecovery,
  type PixflowInstallationRecovery,
  type PixflowLicenseStatus,
} from '../pixflow/license';

// Pixflow-owned: shared license UI for WordPress onboarding, Settings, and
// the blocking revalidation modal. Upstream OD does not own this surface.
type Props = {
  status?: PixflowLicenseStatus | null;
  mode?: 'onboarding' | 'settings' | 'modal';
  onStatusChange?: (status: PixflowLicenseStatus) => void;
  showProNotice?: boolean;
};

function usageLabel(status: PixflowLicenseStatus | null): string {
  const license = status?.license;
  if (!license || license.activation_limit == null || license.activations_count == null) {
    return '';
  }

  return `${license.activations_count} / ${license.activation_limit} activations`;
}

export function PixflowLicensePanel({ status, mode = 'settings', onStatusChange, showProNotice = true }: Props) {
  const translateUi = usePixflowUiTranslation();
  const [current, setCurrent] = useState<PixflowLicenseStatus | null>(status ?? null);
  const [loading, setLoading] = useState(
    status == null && isPixflowWordPressEmbed(),
  );
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recoveryId = useId();
  const [recoveryOpen, setRecoveryOpen] = useState(mode !== 'settings');
  const [recovery, setRecovery] = useState<PixflowInstallationRecovery | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryAction, setRecoveryAction] = useState<'prepare' | 'complete' | null>(null);
  const modalRecoveryAttempted = useRef(false);

  useEffect(() => {
    setCurrent(status ?? null);
    if (status) setLoading(false);
  }, [status]);

  useEffect(() => {
    const sync = (event: Event) => {
      setCurrent((event as CustomEvent<PixflowLicenseStatus>).detail);
      setLoading(false);
    };
    window.addEventListener('pixflow-design:license-changed', sync);
    return () => window.removeEventListener('pixflow-design:license-changed', sync);
  }, []);

  useEffect(() => {
    if (status || !isPixflowWordPressEmbed()) return;
    let cancelled = false;
    setLoading(true);
    void fetchPixflowLicenseStatus()
      .then((next) => {
        if (cancelled) return;
        setCurrent(next);
        onStatusChange?.(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : translateUi("ui.pixflowLicensePanel.feedback61"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onStatusChange, status]);

  useEffect(() => {
    if (
      mode !== 'modal'
      || current?.license.valid === true
      || modalRecoveryAttempted.current
      || !isPixflowWordPressEmbed()
    ) {
      return;
    }

    // A blocking modal is the last-resort gate. Give it one uncached
    // WordPress reconciliation before asking a licensed user for their key.
    modalRecoveryAttempted.current = true;
    let cancelled = false;
    setBusy(true);
    setError('');
    void fetchPixflowLicenseStatus({ force: true })
      .then((next) => {
        if (cancelled) return;
        setCurrent(next);
        onStatusChange?.(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : translateUi("ui.pixflowLicensePanel.feedback61"));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [current?.license.valid, mode, onStatusChange]);

  // Pixflow-owned: Pixflow Design does not support a standalone licensed mode.
  // Only a WordPress-returned valid site license should unlock the wizard.
  const valid = current?.license.valid === true && (!current.central_entitlement?.enabled || current.central_entitlement.valid === true);
  const checking = loading && current === null;
  const maskedKey = current?.license.license_key_masked ?? '';
  const usage = usageLabel(current);

  async function handleValidate() {
    if (busy) return;
    const key = licenseKey.trim();
    if (!key) {
      setError(translateUi("ui.pixflowLicensePanel.enterAPixflowLicenseKey"));
      return;
    }

    setBusy(true);
    setError('');
    try {
      const next = await validatePixflowLicense(key);
      setCurrent(next);
      setLicenseKey('');
      onStatusChange?.(next);
      if (next.license.valid !== true || (next.central_entitlement?.enabled && next.central_entitlement.valid !== true)) {
        setError(next.license.message || translateUi('ui.pixflowLicensePanel.validateYourPixflowLicenseBeforeUsingThe'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : translateUi("ui.pixflowLicensePanel.feedback62"));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await resetPixflowLicense();
      setCurrent(next);
      onStatusChange?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : translateUi("ui.pixflowLicensePanel.feedback63"));
    } finally {
      setBusy(false);
    }
  }

  if (!isPixflowWordPressEmbed()) {
    return <section className={styles.panel}>
      <p role="status">{translateUi('ui.pixflowLicensePanel.openWordPressAdmin')}</p>
    </section>;
  }

  return (
    <section className={`${styles.panel} pixflow-license-panel pixflow-license-panel--${mode}`}>
      {showProNotice && (mode === 'settings' || (!current?.pro?.eligible && current?.pro?.trial_url)) && <PixflowProMigration status={current?.pro}/>}
      <div className={styles.licenseCard}>
      <div className={styles.licenseHead}>
        <div>
          <h3>{translateUi("ui.pixflowLicensePanel.pixflowDesignProLicense")}</h3>
          <p>
            {checking
              ? translateUi("ui.pixflowLicensePanel.checkingThisSiteSPixflowLicense")
              : valid
              ? translateUi("ui.pixflowLicensePanel.yourSiteIsLicensedForPixflowDesign")
              : current?.requires_license === false ? translateUi("ui.pixflowLicensePanel.freeWordpressAndGutenbergEditingRemainAvailable") : translateUi("ui.pixflowLicensePanel.validateYourPixflowLicenseBeforeUsingThe")}
          </p>
        </div>
      </div>

      <div className={styles.licenseSummary}>
        <span className={styles.badge} data-state={valid ? 'active' : checking ? 'checking' : 'inactive'}><i aria-hidden="true" />
          {checking ? translateUi("ui.pixflowLicensePanel.checkingLicense") : valid ? translateUi("chat.importDesignSystemActive") : translateUi("ui.bricksExtensionsSection.inactive")}
        </span>
        {maskedKey ? <code className={styles.maskedKey} dir="ltr">{maskedKey}</code> : null}
        {usage ? <span className={styles.usage}>{usage}</span> : null}
      </div>

      {(mode !== 'onboarding' || !valid) && <><label className={styles.licenseField}>
        <span>{translateUi("ui.pixflowLicensePanel.licenseKey")}</span>
        <input
          type="password"
          autoComplete="new-password"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          placeholder={translateUi("ui.pixflowLicensePanel.pasteYourPixflowLicenseKey")}
          disabled={checking}
          value={licenseKey}
          onChange={(event) => setLicenseKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleValidate();
            }
          }}
        />
      </label>

      {error ? <p className={styles.licenseError} role="alert">{error}</p> : null}

      <div className={styles.licenseActions}>
        <Button
          className={styles.primaryAction}
          onClick={() => void handleValidate()}
          disabled={checking || busy || !licenseKey.trim()}
        >
          {busy && !recoveryAction ? translateUi("ui.pixflowLicensePanel.checking") : valid ? translateUi("ui.pixflowLicensePanel.updateLicense") : translateUi("ui.pixflowLicensePanel.validateLicense")}
        </Button>
        {valid ? (
          <Button
            className={styles.secondaryAction}
            onClick={() => void handleReset()}
            disabled={busy}
          >
            {translateUi("settings.memoryIndexReset")}</Button>
        ) : null}
      </div></>}
      </div>
      {(mode !== 'onboarding' || !valid) && isPixflowWordPressEmbed() && current?.central_entitlement?.enabled ? (
        <section className={styles.card} aria-label={translateUi("ui.pixflowLicensePanel.siteRecovery")}>
          <button type="button" className={styles.disclosure} aria-label={translateUi("ui.pixflowLicensePanel.siteRecovery")} aria-controls={recoveryId} aria-expanded={recoveryOpen} onClick={() => setRecoveryOpen(open => !open)}>
            <span className={styles.symbol}><IconShieldCheck size={20} stroke={1.6} aria-hidden="true" /></span>
            <span className={styles.heading}><strong>{translateUi("ui.pixflowLicensePanel.siteRecovery")}</strong><span>{translateUi("ui.pixflowLicensePanel.reconnectADisabledSite")}</span></span>
            <IconChevronDown size={16} stroke={1.7} className={styles.chevron} aria-hidden="true" />
          </button>
          <div className={styles.collapsible} id={recoveryId} data-open={recoveryOpen} aria-hidden={!recoveryOpen} ref={element => { if (element) element.inert = !recoveryOpen; }}>
          <div className={styles.clip}><div className={styles.body}>
          <p className={styles.intro}>{translateUi("ui.pixflowLicensePanel.disabledThisSiteInYourAccountOr")}</p>
          <ol className={styles.steps} hidden={!!recoveryMessage}>
          <li aria-current={!recovery ? 'step' : undefined} data-complete={!!recovery}>
          <span className={styles.number}>{recovery ? <IconCheck size={14} stroke={2} aria-hidden="true" /> : '1'}</span>
          <div className={styles.stepContent}><h5>{translateUi("ui.pixflowLicensePanel.prepareYourRequest")}</h5>
          <p>{translateUi("ui.pixflowLicensePanel.enterYourLicenseKeyAboveThenGenerate")}</p>
          <Button className={styles.action} disabled={busy} onClick={async () => {
            setBusy(true); setError(''); setRecoveryAction('prepare'); setRecoveryError(''); setRecoveryMessage(''); setCopied(false);
            try { setRecovery(await preparePixflowInstallationRecovery(licenseKey)); }
            catch (err) { setRecoveryError(err instanceof Error ? err.message : translateUi("ui.pixflowLicensePanel.feedbackExtra25")); }
            finally { setBusy(false); setRecoveryAction(null); }
          }}>{recoveryAction === 'prepare' ? translateUi("ui.pixflowLicensePanel.preparingRequest") : recovery ? translateUi("ui.pixflowLicensePanel.refreshRequest") : translateUi("ui.pixflowLicensePanel.prepareRecoveryRequest")}</Button>
          </div></li>
          <li aria-current={recovery && recoveryAction !== 'complete' ? 'step' : undefined} className={!recovery ? styles.pending : undefined}>
          <span className={styles.number}>2</span><div className={styles.stepContent}><h5>{translateUi("ui.pixflowLicensePanel.approveInYourPixflowAccount")}</h5>
          {recovery ? (
            <>
              <p><TranslatedText id="ui.pixflowLicensePanel.copyThisRequestOpenYourAccountAnd" values={{ site: <strong>{recovery.request.site_url}</strong>, action: <strong>{translateUi('ui.pixflowLicensePanel.recoverInstallation')}</strong> }} /></p>
              <div className={styles.actions}>
              <Button className={styles.action} onClick={async () => {
                try { await navigator.clipboard.writeText(JSON.stringify(recovery.request, null, 2)); setCopied(true); setRecoveryError(''); }
                catch { setRecoveryError(translateUi("ui.pixflowLicensePanel.feedbackExtra26")); }
              }}>{copied ? <IconCheck size={15} aria-hidden="true" /> : <IconCopy size={15} aria-hidden="true" />}{copied ? translateUi("promptTemplates.copyDone") : translateUi("ui.pixflowLicensePanel.copyRecoveryRequest")}</Button>
              <a className={styles.accountLink} href={recovery.account_url} target="_blank" rel="noopener noreferrer">{translateUi("ui.pixflowLicensePanel.openPixflowAccount").replace(/\s*↗$/, '')}<IconArrowUpRight size={15} aria-hidden="true" /></a>
              </div>
              <details className={styles.requestDetails}>
                <summary>{translateUi("ui.pixflowLicensePanel.publicRecoveryRequest")}<IconChevronDown size={14} aria-hidden="true" /></summary>
              <label className={styles.requestField}>
                <span>{translateUi("ui.pixflowLicensePanel.publicRecoveryRequest")}</span>
                <textarea className={styles.request} readOnly rows={4} onFocus={event => event.currentTarget.select()} value={JSON.stringify(recovery.request, null, 2)} />
              </label>
              <p className={styles.hint}>{translateUi("ui.pixflowLicensePanel.thisPublicRequestContainsNoLicenseKey")}</p>
              </details>
            </>
          ) : <p>{translateUi("ui.pixflowLicensePanel.yourRequestAndAccountLinkWillAppear")}</p>}
          </div></li>
          <li aria-current={recoveryAction === 'complete' ? 'step' : undefined} className={!recovery ? styles.pending : undefined}><span className={styles.number}>3</span><div className={styles.stepContent}><h5>{translateUi("ui.pixflowLicensePanel.returnHereAndReconnect")}</h5>
              <p>{translateUi("ui.pixflowLicensePanel.onceApprovedInYourAccountFinishReconnecting")}</p>
              <Button className={styles.action} disabled={busy || !recovery} onClick={async () => {
                setBusy(true); setError(''); setRecoveryAction('complete'); setRecoveryError('');
                try {
                  if (!recovery) return;
                  const next = await completePixflowInstallationRecovery(recovery.request.installation_id);
                  setCurrent(next); onStatusChange?.(next); setRecovery(null);
                  setRecoveryMessage(translateUi("ui.pixflowLicensePanel.feedbackExtra27"));
                } catch (err) { setRecoveryError(err instanceof Error ? err.message : translateUi("ui.pixflowLicensePanel.feedbackExtra28")); }
                finally { setBusy(false); setRecoveryAction(null); }
              }}><IconRefresh size={15} aria-hidden="true" />{recoveryAction === 'complete' ? translateUi("ui.pixflowLicensePanel.reconnecting") : translateUi("ui.pixflowLicensePanel.iVeApprovedItReconnect")}</Button>
          </div></li>
          </ol>
          {recoveryError ? <p className={styles.error} role="alert">{recoveryError}</p> : null}
          {recoveryMessage ? <p className={styles.notice} role="status"><IconCheck size={18} aria-hidden="true" />{recoveryMessage}</p> : null}
          </div></div></div>
        </section>
      ) : null}
    </section>
  );
}
