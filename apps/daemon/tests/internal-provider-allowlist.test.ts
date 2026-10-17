import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  validateBaseUrlResolved,
  validateUserProviderBaseUrl,
} from '../src/connectionTest.js';
import { configuredAllowedInternalHosts } from '../src/origin-validation.js';

describe('operator-controlled internal provider allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('normalizes host, host:port and URL entries while rejecting CIDR', () => {
    const warnings: string[] = [];
    expect(configuredAllowedInternalHosts({
      OD_ALLOWED_INTERNAL_HOSTS:
        '10.0.0.5, litellm.internal:4000 https://GW.corp/v1 10.0.0.0/24',
    }, (message) => warnings.push(message))).toEqual([
      '10.0.0.5',
      'litellm.internal',
      'gw.corp',
    ]);
    expect(warnings).toHaveLength(1);
  });

  it('allows an explicitly trusted private provider endpoint', async () => {
    vi.stubEnv('OD_ALLOWED_INTERNAL_HOSTS', '10.0.0.5');
    const result = await validateUserProviderBaseUrl('http://10.0.0.5:4000/v1');
    expect(result.error).toBeUndefined();
  });

  it('allows a trusted hostname that resolves into private space', async () => {
    vi.stubEnv('OD_ALLOWED_INTERNAL_HOSTS', 'litellm.internal');
    const result = await validateUserProviderBaseUrl(
      'http://litellm.internal:4000/v1',
      vi.fn(async () => [{ address: '10.0.0.5', family: 4 }]),
    );
    expect(result.error).toBeUndefined();
  });

  it('keeps the untrusted asset resolver strict', async () => {
    vi.stubEnv('OD_ALLOWED_INTERNAL_HOSTS', '10.0.0.5');
    const result = await validateBaseUrlResolved('http://10.0.0.5:4000/asset');
    expect(result).toMatchObject({ error: 'Internal IPs blocked', forbidden: true });
  });
});
