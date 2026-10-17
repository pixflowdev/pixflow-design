import { describe, expect, it } from 'vitest';
import { workspaceAccessAllowed } from '../../src/pixflow/workspace-access';
import type { PixflowLicenseStatus } from '../../src/pixflow/license';

const status = (valid: boolean, extra = {}) => ({ license: { valid }, ...extra }) as PixflowLicenseStatus;
describe('WordPress Workspace Pro access', () => {
  it('denies pending, Free, missing add-on and expired states', () => {
    expect(workspaceAccessAllowed(true, true, null)).toBe(false);
    expect(workspaceAccessAllowed(true, false, status(true))).toBe(false);
    expect(workspaceAccessAllowed(true, true, status(false))).toBe(false);
    expect(workspaceAccessAllowed(true, true, status(true, { runtime_ready: false }))).toBe(false);
    expect(workspaceAccessAllowed(true, true, status(true, { central_entitlement: { enabled: true, valid: false } }))).toBe(false);
  });
  it('allows verified Pro and preserves the standalone app', () => {
    expect(workspaceAccessAllowed(true, true, status(true))).toBe(true);
    expect(workspaceAccessAllowed(false, false, null)).toBe(true);
  });
});
