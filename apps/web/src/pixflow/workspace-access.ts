import type { PixflowLicenseStatus } from './license';

/** Free onboarding/settings stay reachable; creative Workspace requires live Pro. */
export function workspaceAccessAllowed(wordpress: boolean, workspace: boolean, status: PixflowLicenseStatus | null): boolean {
  if (!wordpress) return true;
  return workspace && status?.license.valid === true && status.runtime_ready !== false
    && (!status.central_entitlement?.enabled || status.central_entitlement.valid === true);
}
