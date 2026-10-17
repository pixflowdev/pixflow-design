import { Button } from '@open-design/components';
import { useState, type ReactNode } from 'react';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import { Icon } from '../Icon';
import styles from './SharedRunFailureCard.module.css';

interface SharedRunFailureCardProps {
  title: string;
  message: string;
  diagnostic?: string | null;
  actions?: ReactNode;
  compact?: boolean;
  detailsLabel?: string;
  copyLabel?: string;
  copiedLabel?: string;
}

export function SharedRunFailureCard({
  title,
  message,
  diagnostic,
  actions,
  compact = false,
  detailsLabel = 'Technical details',
  copyLabel = 'Copy details',
  copiedLabel = 'Copied',
}: SharedRunFailureCardProps) {
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function copyDiagnostic() {
    if (!diagnostic) return;
    const ok = await copyToClipboard(diagnostic);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className={`${styles.card}${compact ? ` ${styles.compact}` : ''}`} role="alert" aria-live="assertive">
      <span className={styles.icon} aria-hidden="true">
        <Icon name="alert-triangle" size={16} />
      </span>
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
        {diagnostic ? (
          <div className={styles.details}>
            <Button variant="ghost" className={styles.detailsToggle} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}>
              <Icon name="chevron-right" size={14} className={detailsOpen ? styles.chevronOpen : undefined} />
              {detailsLabel}
            </Button>
            <div className={styles.detailsBody} data-open={detailsOpen} aria-hidden={!detailsOpen}>
            <div className={styles.detailsInner}>
            <pre className={styles.diagnostic}>{diagnostic}</pre>
            <Button className={styles.copy} variant="ghost" tabIndex={detailsOpen ? 0 : -1} onClick={() => void copyDiagnostic()}>
              <Icon name={copied ? 'check' : 'copy'} size={12} />
              {copied ? copiedLabel : copyLabel}
            </Button>
            </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
