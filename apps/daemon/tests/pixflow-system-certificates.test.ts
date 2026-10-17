import { afterEach, expect, it, vi } from 'vitest';
const tls = vi.hoisted(() => ({ getCACertificates: vi.fn((kind: string) => kind === 'system' ? ['windows-root', 'shared-root'] : ['bundled-root', 'extra-root', 'shared-root']), setDefaultCACertificates: vi.fn() }));
vi.mock('node:tls', () => tls);
import { configurePixflowSystemCertificateTrust } from '../src/pixflow-system-certificates.js';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it.each(['win32', 'darwin'] as const)('adds %s system certificates while retaining bundled and extra trust', (platform) => {
  vi.stubEnv('NODE_USE_SYSTEM_CA', undefined);
  vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', undefined);
  configurePixflowSystemCertificateTrust(platform);
  expect(tls.setDefaultCACertificates).toHaveBeenCalledWith(['bundled-root', 'extra-root', 'shared-root', 'windows-root']);
  expect(process.env.NODE_USE_SYSTEM_CA).toBe('1');
  expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
});
it('leaves other platforms untouched', () => {
  configurePixflowSystemCertificateTrust('linux');
  expect(tls.setDefaultCACertificates).not.toHaveBeenCalled();
});
