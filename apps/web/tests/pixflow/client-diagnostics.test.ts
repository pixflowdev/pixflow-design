import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

describe('Pixflow client diagnostic privacy', () => {
  it('does not retain private error bodies, credentials or stack URLs in memory', async () => {
    vi.resetModules();
    const diagnostics = await import('../../src/pixflow/client-diagnostics');
    const secret = 'PRIVATE_CUSTOMER_TEXT_7531';
    const error = new TypeError(`Network failure: ${secret}`);
    error.stack = `TypeError: ${secret}\n at fetch (https://private.test/page?token=${secret}:1:2)`;
    diagnostics.recordPixflowClientDiagnostic('error', `Network failure ${secret}`, error);
    const snapshot = diagnostics.pixflowClientDiagnosticsSnapshot();
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(JSON.stringify(snapshot)).not.toContain('private.test');
    expect(JSON.stringify(snapshot)).toContain('network');
    expect(JSON.stringify(snapshot)).toContain('TypeError');
  });

  it.each(['error', 'unhandledrejection'])('summarizes %s before recording it', async (type) => {
    vi.resetModules();
    const target = Object.assign(new EventTarget(), { location: { origin: 'https://example.test', pathname: '/wp-admin/' } });
    vi.stubGlobal('window', target);
    const diagnostics = await import('../../src/pixflow/client-diagnostics');
    diagnostics.installPixflowClientDiagnostics();
    const event = new Event(type);
    Object.assign(event, { message: 'fetch PRIVATE_BODY_941', error: new Error('fetch PRIVATE_BODY_941'), reason: new Error('fetch PRIVATE_BODY_941') });
    target.dispatchEvent(event);
    const snapshot = JSON.stringify(diagnostics.pixflowClientDiagnosticsSnapshot());
    expect(snapshot).not.toContain('PRIVATE_BODY_941');
    expect(snapshot).toContain('fetch');
  });
});
