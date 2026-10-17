// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  triggerDiagnosticsDownload,
  triggerDiagnosticsHttpDownload,
  validateDiagnosticsZip,
} from '../../src/components/ExportDiagnosticsButton';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Pixflow diagnostics ZIP validation', () => {
  it('rejects the WordPress HTML response that previously downloaded as a broken ZIP', async () => {
    const response = new Response('<!doctype html><html><body>WordPress</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
    });
    await expect(validateDiagnosticsZip(response)).rejects.toThrow('instead of a ZIP archive');
  });

  it('accepts a non-empty application/zip response with a valid PK signature', async () => {
    const response = new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]), {
      status: 200,
      headers: { 'Content-Type': 'application/zip' },
    });
    await expect(validateDiagnosticsZip(response)).resolves.toMatchObject({ size: 5 });
  });

  it('rejects a mislabeled non-ZIP payload', async () => {
    const response = new Response('not a zip', {
      status: 200,
      headers: { 'Content-Type': 'application/zip' },
    });
    await expect(validateDiagnosticsZip(response)).rejects.toThrow('not a valid ZIP archive');
  });

  it('keeps the Blob URL alive long enough for the browser to claim the download', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pixflow-diagnostics');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    triggerDiagnosticsDownload(new Blob(['zip']), 'pixflow-design-diagnostics.zip');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:pixflow-diagnostics');
  });

  it('uses a browser-owned HTTP link for Pixflow diagnostics tickets', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:unused');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    triggerDiagnosticsHttpDownload(
      'http://127.0.0.1:7456/api/pixflow/diagnostics/download/abc123',
      'pixflow-design-diagnostics.zip',
    );

    const link = document.querySelector<HTMLAnchorElement>(
      'a[download="pixflow-design-diagnostics.zip"]',
    );
    expect(link?.href).toBe('http://127.0.0.1:7456/api/pixflow/diagnostics/download/abc123');
    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(document.body.contains(link)).toBe(false);
  });
});
