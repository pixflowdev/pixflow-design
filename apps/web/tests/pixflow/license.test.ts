import { afterEach, describe, expect, it, vi } from 'vitest';

const CACHE_KEY = 'pixflow-design:license-status-cache';

function createSessionStorage() {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    clear: vi.fn(() => {
      values.clear();
    }),
  };
}

function installWordPressWindow(
  sessionStorage = createSessionStorage(),
  restBaseUrl = 'https://example.test/wp-json/pixflow-design/v1',
  restRouteBaseUrl?: string,
) {
  const win = {
    location: { href: 'http://wp.test/' },
    __PIXFLOW_DESIGN_WORDPRESS__: {
      ajaxUrl: 'https://example.test/wp-admin/admin-ajax.php',
      restBaseUrl,
      ...(restRouteBaseUrl ? { restRouteBaseUrl } : {}),
      restNonce: 'nonce',
      version: '1.1.0-beta7',
    },
    wpApiSettings: { nonce: 'nonce' },
    sessionStorage,
  } as unknown as Window & typeof globalThis;
  win.parent = win;
  win.top = win;
  vi.stubGlobal('window', win);

  return { win, sessionStorage };
}

function licenseStatus(valid: boolean, extra: Record<string, unknown> = {}) {
  return {
    requires_license: true,
    license: {
      present: valid,
      valid,
      status: valid ? 'active' : 'missing',
      message: valid ? '' : 'Enter a Pixflow license key to continue.',
      license_key_masked: valid ? 'abcd****wxyz' : '',
    },
    ...extra,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('pairs through a browser one-time code without transferring a credential or grant', async () => {
  const { win } = installWordPressWindow();
  Object.assign(win.__PIXFLOW_DESIGN_WORDPRESS__!, { bridgeBaseUrl: 'http://127.0.0.1:17457' });
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/pairing/start')) return Response.json({requestId:'request',challenge:'challenge',siteUrl:'https://example.test',expiresAt:123});
    if (url.endsWith('/pairing/complete')) return Response.json({ok:true,valid:true});
    return Response.json({code:'a'.repeat(64)});
  });
  win.fetch = transport;
  win.dispatchEvent = vi.fn(() => true);
  vi.stubGlobal('fetch',transport);
  const { pairPixflowBridge } = await import('../../src/pixflow/license');
  await pairPixflowBridge();
  expect(transport).toHaveBeenCalledTimes(3);
  expect(win.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({type:'pixflow-design:bridge-reconnect-request'}));
  const calls = transport.mock.calls as unknown as Array<[string,RequestInit]>;
  expect(JSON.parse(String(calls[1]![1].body))).toEqual({challenge:'challenge',siteUrl:'https://example.test'});
  expect(JSON.parse(String(calls[2]![1].body))).toEqual({requestId:'request',code:'a'.repeat(64)});
});

describe('Pixflow license status cache', () => {
  it('waits for the pending validation instead of returning an older cached Free result', async () => {
    const { sessionStorage } = installWordPressWindow();
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), value: licenseStatus(false) }));
    let finishRead!: (value: unknown) => void, finishValidation!: (value: unknown) => void;
    const read = new Promise(done => { finishRead = done; });
    const mutation = new Promise(done => { finishValidation = done; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: () => url.endsWith('/validate') ? mutation : read })));
    const { fetchPixflowLicenseStatus, validatePixflowLicense } = await import('../../src/pixflow/license');
    const staleRead = fetchPixflowLicenseStatus({ force: true });
    const validating = validatePixflowLicense('saved-key');
    finishRead(licenseStatus(false));
    await Promise.resolve();
    finishValidation(licenseStatus(true));
    expect((await validating).license.valid).toBe(true);
    expect((await staleRead).license.valid).toBe(true);
  });
  it('upgrades an existing Free pairing when Pro is renewed', async () => {
    const { win } = installWordPressWindow();
    win.__PIXFLOW_DESIGN_WORDPRESS__!.bridgeBaseUrl = 'http://127.0.0.1:17457';
    const transport = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/license/status')) return Response.json(licenseStatus(true, {requires_license:false, runtime_ready:true, central_entitlement:{enabled:true,valid:true}}));
      if (url.endsWith('/central-entitlement')) return Response.json({valid:true, free_access:true, pro_valid:false});
      if (url.endsWith('/pairing/start')) return Response.json({requestId:'request',challenge:'challenge',siteUrl:'https://example.test',expiresAt:123});
      if (url.endsWith('/pairing/complete')) return Response.json({ok:true,valid:true});
      return Response.json({code:'a'.repeat(64)});
    });
    win.fetch = transport;
    vi.stubGlobal('fetch', transport);
    const { ensurePixflowLicenseEntitlement } = await import('../../src/pixflow/license');
    await ensurePixflowLicenseEntitlement();
    expect(transport.mock.calls.some(([url]) => String(url).endsWith('/pairing/complete'))).toBe(true);
  });
  it('does not let a late validation response undo a newer license reset', async () => {
    const { sessionStorage } = installWordPressWindow();
    let completeValidation!: (value: unknown) => void;
    const validation = new Promise((resolve) => { completeValidation = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200,
      json: async () => url.endsWith('/validate') ? validation : licenseStatus(false),
    })));
    const { validatePixflowLicense, resetPixflowLicense } = await import('../../src/pixflow/license');
    const pendingValidation = validatePixflowLicense('old-test-key');
    await resetPixflowLicense();
    completeValidation(licenseStatus(true));
    expect((await pendingValidation).license.valid).toBe(false);
    expect(JSON.parse(String(sessionStorage.getItem(CACHE_KEY))).value.license.valid).toBe(false);
  });

  it('checks central bridge readiness without requiring or posting a browser bearer token', async () => {
    const { win } = installWordPressWindow();
    win.__PIXFLOW_DESIGN_WORDPRESS__!.bridgeBaseUrl = 'http://127.0.0.1:17457';
    const status = licenseStatus(true, { runtime_ready: true, central_entitlement: { enabled: true, valid: true } });
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, status: 200,
      json: async () => url.endsWith('/license/status') ? status : { valid: true },
    }));
    vi.stubGlobal('fetch', fetchMock);
    win.fetch = fetchMock as unknown as typeof win.fetch;
    const { ensurePixflowLicenseEntitlement } = await import('../../src/pixflow/license');
    await expect(ensurePixflowLicenseEntitlement()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1:17457/api/pixflow/central-entitlement', expect.objectContaining({ method: 'GET' }));
    expect(fetchMock.mock.calls.every((call) => !call[0].endsWith('/license-entitlement'))).toBe(true);
  });

  it('rejects central onboarding when WordPress is valid but the paired bridge is denied', async () => {
    const { win } = installWordPressWindow();
    win.__PIXFLOW_DESIGN_WORDPRESS__!.bridgeBaseUrl = 'http://127.0.0.1:17457';
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, status: 200,
      json: async () => url.endsWith('/license/status')
        ? licenseStatus(true, { runtime_ready: true, central_entitlement: { enabled: true, valid: true } })
        : { valid: false },
    }));
    vi.stubGlobal('fetch', fetchMock);
    win.fetch = fetchMock as unknown as typeof win.fetch;
    const { ensurePixflowLicenseEntitlement } = await import('../../src/pixflow/license');
    await expect(ensurePixflowLicenseEntitlement()).rejects.toThrow('unexpected pairing response');
  });

  it('does not hydrate an expired central grant from a fresh browser cache', async () => {
    const { sessionStorage } = installWordPressWindow();
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), value: licenseStatus(true, {
      central_entitlement: { enabled: true, valid: true, expires_at: Math.floor(Date.now() / 1000) - 1 },
    }) }));
    const fresh = licenseStatus(false, { central_entitlement: { enabled: true, valid: false } });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => fresh }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchPixflowLicenseStatus } = await import('../../src/pixflow/license');
    expect((await fetchPixflowLicenseStatus()).license.valid).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps top-level framework requests on WordPress query REST transport', async () => {
    installWordPressWindow(
      createSessionStorage(),
      'http://wp.test/index.php?rest_route=/pixflow-design/v1',
      'http://wp.test/',
    );
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(
        'http://wp.test/?rest_route=%2Fpixflow-design%2Fv1%2Fframework%2Froute-context&postId=198',
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({ postId: 198, sources: { bricks: { available: true } } }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { requestWordPressRest } = await import('../../src/pixflow/license');
    const response = await requestWordPressRest('framework/route-context?postId=198');

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired nonce and retries a top-level WordPress REST request once', async () => {
    const { win } = installWordPressWindow();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://example.test/wp-admin/admin-ajax.php') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { restNonce: 'fresh-nonce' },
          }),
        };
      }

      if (url === 'https://example.test/wp-json/pixflow-design/v1/od/projects/project-1/conversations/chat-1/messages/message-1') {
        const nonce = new Headers(init?.headers).get('X-WP-Nonce');
        return nonce === 'fresh-nonce'
          ? {
              ok: true,
              status: 200,
              json: async () => ({ ok: true }),
            }
          : {
              ok: false,
              status: 403,
              json: async () => ({ code: 'rest_cookie_invalid_nonce' }),
            };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { requestWordPressRest } = await import('../../src/pixflow/license');
    const response = await requestWordPressRest(
      'od/projects/project-1/conversations/chat-1/messages/message-1',
      { method: 'PUT', body: { role: 'assistant' } },
    );

    expect(response).toEqual({ ok: true, status: 200, body: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(win.__PIXFLOW_DESIGN_WORDPRESS__?.restNonce).toBe('fresh-nonce');
    expect(win.wpApiSettings?.nonce).toBe('fresh-nonce');
  });

  it('bypasses a fresh invalid cache and rechecks the authoritative WordPress status', async () => {
    const { sessionStorage } = installWordPressWindow();
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      value: licenseStatus(false),
    }));

    const freshStatus = licenseStatus(true, {
      bridge_entitlement: {
        token: 'recovered-token',
        expires_at: '2026-07-13T00:00:00Z',
      },
    });
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://example.test/wp-json/pixflow-design/v1/license/status');
      return {
        ok: true,
        status: 200,
        json: async () => freshStatus,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPixflowLicenseStatus } = await import('../../src/pixflow/license');

    const status = await fetchPixflowLicenseStatus();
    expect(status).toBe(freshStatus);
    expect(status.license.valid).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not revoke the bridge entitlement for a transient invalid status', async () => {
    const { win, sessionStorage } = installWordPressWindow();
    win.__PIXFLOW_DESIGN_WORDPRESS__ = {
      ...win.__PIXFLOW_DESIGN_WORDPRESS__,
      bridge: { available: true },
      bridgeBaseUrl: 'http://127.0.0.1:7456',
    } as typeof win.__PIXFLOW_DESIGN_WORDPRESS__;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      value: licenseStatus(false),
    }));

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://example.test/wp-json/pixflow-design/v1/license/status') {
        return {
          ok: true,
          status: 200,
          json: async () => licenseStatus(false),
        };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    win.fetch = fetchMock as unknown as typeof win.fetch;

    const { fetchPixflowLicenseStatus } = await import('../../src/pixflow/license');

    const status = await fetchPixflowLicenseStatus();
    expect(status.license.valid).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/pixflow/license-entitlement',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('explicitly revokes the bridge entitlement after a successful license reset', async () => {
    const { win } = installWordPressWindow();
    win.__PIXFLOW_DESIGN_WORDPRESS__ = {
      ...win.__PIXFLOW_DESIGN_WORDPRESS__,
      bridge: { available: true },
      bridgeBaseUrl: 'http://127.0.0.1:7456',
    } as typeof win.__PIXFLOW_DESIGN_WORDPRESS__;

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://example.test/wp-json/pixflow-design/v1/license/reset') {
        return {
          ok: true,
          status: 200,
          json: async () => licenseStatus(false),
        };
      }
      if (url === 'http://127.0.0.1:7456/api/pixflow/license-entitlement') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    win.fetch = fetchMock as unknown as typeof win.fetch;

    const { resetPixflowLicense } = await import('../../src/pixflow/license');

    await resetPixflowLicense();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:7456/api/pixflow/license-entitlement',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('replaces stale invalid cache immediately after validation succeeds', async () => {
    const { sessionStorage } = installWordPressWindow();
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      value: licenseStatus(false),
    }));

    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://example.test/wp-json/pixflow-design/v1/license/validate');
      return {
        ok: true,
        status: 200,
        json: async () => licenseStatus(true),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPixflowLicenseStatus, validatePixflowLicense } = await import('../../src/pixflow/license');

    const validated = await validatePixflowLicense('abcd-wxyz');
    expect(validated.license.valid).toBe(true);

    const status = await fetchPixflowLicenseStatus();
    expect(status.license.valid).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const cached = JSON.parse(String(sessionStorage.getItem(CACHE_KEY)));
    expect(cached.value.license.valid).toBe(true);
  });

  it('returns the fresh valid status object used by the onboarding license form', async () => {
    const { sessionStorage } = installWordPressWindow();
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      value: licenseStatus(false),
    }));

    const freshStatus = licenseStatus(true, {
      bridge_entitlement: {
        token: 'onboarding-token',
        expires_at: '2026-07-09T00:00:00Z',
      },
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => freshStatus,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { validatePixflowLicense } = await import('../../src/pixflow/license');

    const next = await validatePixflowLicense('abcd-wxyz');
    expect(next).toBe(freshStatus);
    expect(next.license.valid).toBe(true);
    expect(next.bridge_entitlement?.token).toBe('onboarding-token');

    const cached = JSON.parse(String(sessionStorage.getItem(CACHE_KEY)));
    expect(cached.value.license.valid).toBe(true);
    expect(cached.value.bridge_entitlement.token).toBe('onboarding-token');
  });

  it('does not let an in-flight pre-validation status read reopen the license gate', async () => {
    const { sessionStorage } = installWordPressWindow();
    const freshStatus = licenseStatus(true, {
      bridge_entitlement: {
        token: 'onboarding-token',
        expires_at: '2026-07-09T00:00:00Z',
      },
    });
    const staleResponse = {
      ok: true,
      status: 200,
      json: async () => licenseStatus(false),
    };
    let releaseStaleStatus: ((value: typeof staleResponse) => void) | undefined;
    const pendingStaleStatus = new Promise<typeof staleResponse>((resolve) => {
      releaseStaleStatus = resolve;
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://example.test/wp-json/pixflow-design/v1/license/status') {
        return pendingStaleStatus;
      }
      if (url === 'https://example.test/wp-json/pixflow-design/v1/license/validate') {
        return {
          ok: true,
          status: 200,
          json: async () => freshStatus,
        };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPixflowLicenseStatus, validatePixflowLicense } = await import('../../src/pixflow/license');

    const staleRead = fetchPixflowLicenseStatus({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const validated = await validatePixflowLicense('abcd-wxyz');
    expect(validated).toBe(freshStatus);
    expect(validated.license.valid).toBe(true);

    releaseStaleStatus?.(staleResponse);
    const reconciled = await staleRead;
    expect(reconciled).toBe(freshStatus);
    expect(reconciled.license.valid).toBe(true);
    expect(JSON.parse(String(sessionStorage.getItem(CACHE_KEY))).value.license.valid).toBe(true);
  });


  it('replaces stale valid cache immediately after reset succeeds', async () => {
    const { sessionStorage } = installWordPressWindow();
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      value: licenseStatus(true),
    }));

    const fetchMock = vi.fn(async (url: string) => {
      expect([
        'https://example.test/wp-json/pixflow-design/v1/license/reset',
        'https://example.test/wp-json/pixflow-design/v1/license/status',
      ]).toContain(url);
      return {
        ok: true,
        status: 200,
        json: async () => licenseStatus(false),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPixflowLicenseStatus, resetPixflowLicense } = await import('../../src/pixflow/license');

    const reset = await resetPixflowLicense();
    expect(reset.license.valid).toBe(false);

    const status = await fetchPixflowLicenseStatus();
    expect(status.license.valid).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const cached = JSON.parse(String(sessionStorage.getItem(CACHE_KEY)));
    expect(cached.value.license.valid).toBe(false);
  });

  it('syncs a fresh bridge entitlement after validation succeeds', async () => {
    const { win, sessionStorage } = installWordPressWindow();
    win.__PIXFLOW_DESIGN_WORDPRESS__ = {
      ...win.__PIXFLOW_DESIGN_WORDPRESS__,
      bridge: { available: true },
      bridgeBaseUrl: 'http://127.0.0.1:7456',
    } as typeof win.__PIXFLOW_DESIGN_WORDPRESS__;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      checkedAt: Date.now(),
      value: licenseStatus(false),
    }));

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://example.test/wp-json/pixflow-design/v1/license/validate') {
        return {
          ok: true,
          status: 200,
          json: async () => licenseStatus(true, {
            bridge_entitlement: {
              token: 'fresh-token',
              expires_at: '2026-07-09T00:00:00Z',
            },
          }),
        };
      }

      if (url === 'http://127.0.0.1:7456/api/pixflow/license-entitlement') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    win.fetch = fetchMock as unknown as typeof win.fetch;

    const { validatePixflowLicense } = await import('../../src/pixflow/license');

    const validated = await validatePixflowLicense('abcd-wxyz');
    expect(validated.license.valid).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:7456/api/pixflow/license-entitlement',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'fresh-token' }),
      }),
    );

    const cached = JSON.parse(String(sessionStorage.getItem(CACHE_KEY)));
    expect(cached.value.bridge_entitlement.token).toBe('fresh-token');
  });
});
it('exports only the public recovery request and preserves an unapproved error', async () => {
  installWordPressWindow();
  const exported = {request: {schema: 'pixflow.installation-recovery.v1', installation_id: 'new-id', public_key_pem: 'PUBLIC', site_url: 'https://example.test'}, account_url: 'https://pixflow.dev/account/licenses'};
  const transport = vi.fn().mockResolvedValueOnce(Response.json(exported)).mockResolvedValueOnce(Response.json({message: 'Owner approval required'}, {status: 409}));
  vi.stubGlobal('fetch', transport);
  const {preparePixflowInstallationRecovery, completePixflowInstallationRecovery} = await import('../../src/pixflow/license');
  expect(await preparePixflowInstallationRecovery()).toEqual(exported);
  await expect(completePixflowInstallationRecovery('new-id')).rejects.toThrow('Owner approval required');
  expect(JSON.parse(transport.mock.calls[1]![1].body)).toEqual({installation_id: 'new-id'});
});

it('uses the Etch admin REST context before the floating panel opens', async () => {
  const { win } = installWordPressWindow();
  Object.assign(win, { pixflowDesignWpAdmin: win.__PIXFLOW_DESIGN_WORDPRESS__ });
  delete win.__PIXFLOW_DESIGN_WORDPRESS__;
  const transport = vi.fn(async () => Response.json({ collections: [] }));
  vi.stubGlobal('fetch', transport);
  const { requestWordPressRest } = await import('../../src/pixflow/license');
  expect(await requestWordPressRest('icons/packs/etch-collections')).toMatchObject({ ok: true, body: { collections: [] } });
  expect(transport.mock.calls.length).toBe(1);
});
