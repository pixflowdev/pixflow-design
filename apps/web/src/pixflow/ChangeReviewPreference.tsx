import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { changeReviewDisabled, setChangeReviewDisabled, subscribeChangeReviewPreference } from './change-review-preference';
import styles from './BricksStylingOptions.module.css';

export function ChangeReviewPreference() {
  const t = useT();
  const [disabled, setDisabled] = useState(changeReviewDisabled);
  useEffect(() => subscribeChangeReviewPreference(() => setDisabled(changeReviewDisabled())), []);
  return <div className={styles.group}>
    <div className={styles.toggleRow}>
      <span>{t('pixflow.review.disable')}</span>
      <label className={`toggle-switch toggle-switch-sm ${styles.switch}`}>
        <input type="checkbox" role="switch" aria-label={t('pixflow.review.disable')} checked={disabled}
          onChange={event => setChangeReviewDisabled(event.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
    <p className={styles.hint}>{t('pixflow.review.disableHint')}</p>
  </div>;
}
