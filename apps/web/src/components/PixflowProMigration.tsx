import { useT as usePixflowUiTranslation } from '../i18n';
import type { PixflowProInstallation } from '@open-design/contracts';
import { Icon } from './Icon';
import styles from './PixflowProMigration.module.css';

/** An account download link, never an external installer inside Free. */
export function PixflowProMigration({ status }: { status?: PixflowProInstallation }) {
  const translateUi = usePixflowUiTranslation();
  if (status && !status.eligible && status.trial_url) return <section className={styles.card} aria-label={translateUi("ui.pixflowProMigration.tryPro")}>
    <div className={styles.heading}><h4>{translateUi("ui.pixflowProMigration.explorePixflowDesignPro")}</h4></div>
    <p>{translateUi("ui.pixflowProMigration.checkYourAccountForASevenDay")}</p>
    <p className={styles.detail}>{translateUi("ui.pixflowProMigration.yourTrialStartsOnlyAfterYouConfirm")}</p>
    <div className={styles.actions}><a className={styles.primary} href={status.trial_url} target="_blank" rel="noopener noreferrer">{translateUi("ui.pixflowProMigration.checkTrialAvailability")}<Icon name="external-link" width={15} height={15}/></a></div>
  </section>;
  if (!status?.eligible || status.installation === 'active') return null;
  const inactive = status.installation === 'inactive';
  const repair = status.installation === 'incomplete' || status.installation === 'incompatible';
  return <section className={styles.card} aria-label={translateUi("ui.pixflowProMigration.yourProAccess")}>
    <div className={styles.heading}><Icon name="check" width={18} height={18}/><h4>{translateUi("ui.pixflowProMigration.yourLicenceIncludesPro")}</h4></div>
    <p>{inactive ? translateUi("ui.pixflowProMigration.proIsInstalledActivateItToRestore")
      : repair ? translateUi("ui.pixflowProMigration.yourProInstallationNeedsAttentionDownloadThe")
      : translateUi("ui.pixflowProMigration.yourPremiumFeaturesNowLiveInThe")}</p>
    <p className={styles.detail}>{translateUi("ui.pixflowProMigration.noNewPurchaseOrTrialIsNeeded")}</p>
    <div className={styles.actions}>
      <a className={styles.primary} href={inactive ? status.plugins_url : status.account_url} target="_blank" rel="noopener noreferrer">
        {inactive ? translateUi("ui.pixflowProMigration.activateProInPlugins") : translateUi("ui.pixflowProMigration.downloadProFromYourAccount")}<Icon name="external-link" width={15} height={15}/>
      </a>
      {!inactive && <a className={styles.secondary} href={status.upload_url} target="_blank" rel="noopener noreferrer">{translateUi("ui.pixflowProMigration.uploadProInWordpress")}</a>}
    </div>
    <p className={styles.detail}>{translateUi("ui.pixflowProMigration.afterActivationReloadPixflowToLoadYour")}</p>
    <p className={styles.detail}>{translateUi("ui.pixflowProMigration.usingPixflowSBricksTwoFactorAuthentication")}</p>
  </section>;
}
