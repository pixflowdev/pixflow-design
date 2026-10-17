/** Installation guidance only; never an entitlement or an authorisation input. */
export interface PixflowProInstallation {
  eligible: boolean;
  installation: 'missing' | 'inactive' | 'incompatible' | 'incomplete' | 'active';
  account_url: string;
  plugins_url: string;
  upload_url: string;
  /** Account discovery link, not evidence of eligibility or a local trial switch. */
  trial_url?: string;
  /** Account history is unknown until verified; absence of a site licence is not eligibility. */
  trial_status?: 'unknown' | 'eligible' | 'ineligible' | 'used' | 'expired' | 'active';
}
