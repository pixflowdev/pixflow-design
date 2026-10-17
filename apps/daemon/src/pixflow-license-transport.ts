/** Keep staging transport separate from the signed entitlement issuer. */
export function licenseKeyRequest(issuer: string, env: NodeJS.ProcessEnv = process.env): {
  url: string; options: RequestInit;
} {
  const options: RequestInit = { redirect: 'error', signal: AbortSignal.timeout(15000) };
  if (issuer === 'https://preview.pixflow.dev'
    && env.PIXFLOW_DESIGN_LICENSE_TRANSPORT === 'https://staging.pixflow.dev') {
    const basic = env.PIXFLOW_DESIGN_STAGING_BASIC_AUTH;
    if (!basic || /[\r\n]/u.test(basic)) throw new Error('Staging transport credentials missing or invalid');
    options.headers = { Authorization: `Basic ${Buffer.from(basic).toString('base64')}` };
    return { url: 'https://staging.pixflow.dev/api/licensing/v2/keys', options };
  }
  return { url: `${issuer}/api/licensing/v2/keys`, options };
}
