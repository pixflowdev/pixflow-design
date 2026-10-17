import { useT as usePixflowUiTranslation } from '../i18n';
import { motion } from 'motion/react';
import { Button } from '@open-design/components';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import { startVelaLogin, formatVelaBalanceUsd } from '../providers/daemon';
import { amrConsoleUrlForProfile } from '../runtime/amr-guidance';
import { setAmrLowBalanceWarnOptedOut } from '../runtime/amr-balance-gate';
import { modalContent, modalOverlay } from '../motion';
import styles from './AmrRunGateDialog.module.css';

export type AmrRunGateDecision = 'proceed' | 'cancel' | 'recheck';

export function AmrRunGateDialog({
  kind,
  reason,
  snapshot,
  onDecision,
}: {
  kind: 'hard' | 'soft';
  reason?: 'insufficient' | 'signed_out';
  snapshot: AmrWalletSnapshot;
  onDecision: (decision: AmrRunGateDecision) => void;
}) {
  const translateUi = usePixflowUiTranslation();
  const signedOut = kind === 'hard' && reason === 'signed_out';
  const balance = formatVelaBalanceUsd(snapshot.balanceUsd);
  const openWallet = () => {
    window.open(amrConsoleUrlForProfile(snapshot.profile), '_blank', 'noopener,noreferrer');
  };
  return (
    <motion.div
      className="modal-backdrop"
      onClick={() => onDecision('cancel')}
      variants={modalOverlay}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className={`modal ${styles.panel}`}
        role="alertdialog"
        aria-label={signedOut ? translateUi("ui.amrRunGateDialog.signInBeforeStarting") : translateUi("ui.amrRunGateDialog.checkYourOpenDesignCloudBalance")}
        onClick={(event) => event.stopPropagation()}
        variants={modalContent}
      >
      <h2 className={styles.title}>
        {signedOut
          ? translateUi("ui.amrRunGateDialog.signInToStartThisRun")
          : kind === 'hard'
            ? translateUi("ui.amrRunGateDialog.addBalanceBeforeStarting")
            : translateUi("ui.amrRunGateDialog.yourBalanceIsRunningLow")}
      </h2>
      <p className={styles.message}>
        {signedOut
          ? translateUi("ui.amrRunGateDialog.yourPromptIsStillHereSignIn")
          : kind === 'hard'
            ? translateUi("ui.amrRunGateDialog.yourCurrentBalanceIsTopUpThen", { value1: balance ?? '$0.00' })
            : translateUi("ui.amrRunGateDialog.yourCurrentBalanceIsThisRunMay", { value1: balance ?? 'low' })}
      </p>
      <div className={styles.actions}>
        {signedOut ? (
          <Button variant="primary" onClick={() => void startVelaLogin()}>
            {translateUi("settings.amrSignIn")} </Button>
        ) : (
          <Button variant={kind === 'hard' ? 'primary' : 'default'} onClick={openWallet}>
            {kind === 'hard' ? translateUi("ui.amrRunGateDialog.topUpBalance") : translateUi("ui.amrRunGateDialog.rechargeFirst")}
          </Button>
        )}
        {kind === 'hard' ? (
          <Button variant="default" onClick={() => onDecision('recheck')}>
            {translateUi("ui.amrRunGateDialog.checkAgain")} </Button>
        ) : (
          <Button variant="primary" onClick={() => onDecision('proceed')}>
            {translateUi("ui.amrRunGateDialog.startAnyway")} </Button>
        )}
        {kind === 'soft' ? (
          <Button
            variant="ghost"
            onClick={() => {
              setAmrLowBalanceWarnOptedOut();
              onDecision('proceed');
            }}
          >
            {translateUi("ui.amrRunGateDialog.donTRemindMeAgain")} </Button>
        ) : null}
        <Button variant="ghost" onClick={() => onDecision('cancel')}>
          {translateUi("ui.amrRunGateDialog.notNow")} </Button>
      </div>
      </motion.div>
    </motion.div>
  );
}
