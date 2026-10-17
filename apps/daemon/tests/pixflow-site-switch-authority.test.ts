import { describe, expect, it } from 'vitest';
import { mayClaimPixflowDaemonSite as claim } from '../src/pixflow-site-switch-authority.js';

describe('daemon site ownership', () => {
  const site = { url: 'https://site.test/wordpress', origin: 'https://site.test' };
  it('preserves reconnects, canonical slashes and local provisioning', () => {
    expect(claim(site, site, site.origin)).toBe(true);
    expect(claim(site, { ...site, url: `${site.url}/` })).toBe(true);
    expect(claim(null, site)).toBe(true);
  });
  it('rejects origin replacement, another site, opaque senders and unpaired browser claims', () => {
    expect(claim(site, { ...site, origin: 'https://attacker.test' }, 'https://attacker.test')).toBe(false);
    expect(claim(site, { url: 'https://attacker.test', origin: 'https://attacker.test' }, 'https://attacker.test')).toBe(false);
    expect(claim(site, site, 'null')).toBe(false);
    expect(claim(site, site, 'https://attacker.test')).toBe(false);
    expect(claim(null, site, site.origin)).toBe(false);
    expect(claim(site, { ...site, url: 'https://site.test/other' })).toBe(false);
    expect(claim(site, { ...site, url: 'https://user:password@site.test/wordpress' })).toBe(false);
  });
});
