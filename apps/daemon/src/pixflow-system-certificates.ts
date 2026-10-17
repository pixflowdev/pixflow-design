import * as tls from 'node:tls';

// Runtime target Node24 exposes these APIs; the shared Node type baseline is older.
type CertificateStore = {
  getCACertificates?: (type: 'default' | 'system') => string[];
  setDefaultCACertificates?: (certificates: string[]) => void;
};

/** Honor Windows/macOS system trust without replacing bundled or extra CAs. */
export function configurePixflowSystemCertificateTrust(platform = process.platform): void {
  if (platform !== 'win32' && platform !== 'darwin') return;
  const store = tls as CertificateStore;
  if (!store.getCACertificates || !store.setDefaultCACertificates) return;
  // Browser trust is independent of Node's default CA list. On macOS, Node's
  // system store reads trusted Keychain certificates (including Local's CA).
  // Set this before any pairing requests create TLS connections.
  store.setDefaultCACertificates([...new Set([
    ...store.getCACertificates('default'),
    ...store.getCACertificates('system'),
  ])]);
  // Native agents launch Node helpers in child shells; those processes need the
  // same host trust as the daemon, without disabling certificate verification.
  process.env.NODE_USE_SYSTEM_CA = '1';
}
