import { describe, expect, it } from 'vitest';
import { licenseKeyRequest } from '../src/pixflow-license-transport.js';

describe('explicit staging key transport', () => {
  const env = { PIXFLOW_DESIGN_LICENSE_TRANSPORT: 'https://staging.pixflow.dev', PIXFLOW_DESIGN_STAGING_BASIC_AUTH: 'test:password' };
  it('preserves production transport and never adds staging credentials', () => {
    const request = licenseKeyRequest('https://pixflow.dev', env);
    expect(request.url).toBe('https://pixflow.dev/api/licensing/v2/keys');
    expect(request.options.headers).toBeUndefined();
  });
  it('maps only an explicit staging transport and refuses redirects', () => {
    const request = licenseKeyRequest('https://preview.pixflow.dev', env);
    expect(request.url).toBe('https://staging.pixflow.dev/api/licensing/v2/keys');
    expect(request.options.headers).toEqual({ Authorization: 'Basic dGVzdDpwYXNzd29yZA==' });
    expect(request.options.redirect).toBe('error');
  });
  it('does not forward credentials to arbitrary transports', () => {
    const request = licenseKeyRequest('https://preview.pixflow.dev', { ...env, PIXFLOW_DESIGN_LICENSE_TRANSPORT: 'https://other.invalid' });
    expect(request.url).toBe('https://preview.pixflow.dev/api/licensing/v2/keys');
    expect(request.options.headers).toBeUndefined();
  });
  it('fails closed when explicitly selected staging credentials are missing', () => {
    expect(() => licenseKeyRequest('https://preview.pixflow.dev', { PIXFLOW_DESIGN_LICENSE_TRANSPORT: env.PIXFLOW_DESIGN_LICENSE_TRANSPORT })).toThrow('credentials');
  });
});
