// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PixflowLicensePanel } from '../../src/components/PixflowLicensePanel';
import { isPixflowWordPressEmbed, resetPixflowLicense, validatePixflowLicense, completePixflowInstallationRecovery, preparePixflowInstallationRecovery } from '../../src/pixflow/license';
import type { PixflowLicenseStatus } from '../../src/pixflow/license';

vi.mock('../../src/pixflow/license', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/pixflow/license')>();
  return {
    ...original,
    preparePixflowInstallationRecovery: vi.fn(),
    completePixflowInstallationRecovery: vi.fn(),
    validatePixflowLicense: vi.fn(),
    resetPixflowLicense: vi.fn(),
    isPixflowWordPressEmbed: vi.fn(() => true),
    fetchPixflowLicenseStatus: vi.fn(() => new Promise<PixflowLicenseStatus>(() => {})),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const activeLicense: PixflowLicenseStatus = {
  requires_license: true,
  license: {
    present: true,
    valid: true,
    status: 'active',
    license_key_masked: '5298************************BB90',
  },
};

describe('PixflowLicensePanel', () => {
  it.each([
    { ...activeLicense, license: { ...activeLicense.license, valid: false } },
    { ...activeLicense, central_entitlement: { enabled: true, valid: false } },
  ])('does not display an active badge for an unactivated saved licence', status => {
    render(<PixflowLicensePanel status={status} />);
    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(screen.queryByText('Active')).toBeNull();
  });
  it('reports incomplete central activation after validation instead of implying success', async () => {
    vi.mocked(validatePixflowLicense).mockResolvedValue({ ...activeLicense, central_entitlement: { enabled: true, valid: false } });
    render(<PixflowLicensePanel status={{ ...activeLicense, license: { present: true, valid: false, status: 'active' } }} />);
    fireEvent.change(screen.getByLabelText('License key'), { target: { value: 'saved-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate license' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Active')).toBeNull();
  });
  it.each(['settings', 'onboarding', 'modal'] as const)('offers the account trial entry in %s without a licence', mode => {
    render(<PixflowLicensePanel mode={mode} status={{...activeLicense, license:{present:false,valid:false,status:'missing'}, pro:{eligible:false,installation:'missing',account_url:'https://pixflow.dev/account',plugins_url:'',upload_url:'',trial_url:'https://pixflow.dev/account#pro-trial'}}}/>);
    expect(screen.getByRole('link',{name:/Check trial availability/}).getAttribute('href')).toBe('https://pixflow.dev/account#pro-trial');
  });
  it('does not flash a false license-required state while WordPress status loads', () => {
    render(<PixflowLicensePanel mode="settings" />);

    expect(screen.getByText('Checking license…')).toBeTruthy();
    expect(screen.queryByText('License required')).toBeNull();
    expect((screen.getByLabelText('License key') as HTMLInputElement).disabled).toBe(true);
  });

  it('renders the authoritative status supplied by the workspace immediately', () => {
    render(<PixflowLicensePanel mode="settings" status={activeLicense} />);

    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.queryByText('Checking license…')).toBeNull();
    expect(screen.queryByText('License required')).toBeNull();
  });
});


describe('disabled-site recovery', () => {
  const missing = { ...activeLicense, license: { present: false, valid: false, status: 'missing' }, central_entitlement: { enabled: true, valid: false } } as PixflowLicenseStatus;
  it('uses the entered key and displays the public request without activating first', async () => {
    const recovery = { request: { schema: 'pixflow.installation-recovery.v1' as const, installation_id: 'candidate', public_key_pem: 'PUBLIC', site_url: 'https://site.example' }, account_url: 'https://pixflow.dev/account/licenses' };
    let resolve!: (value: typeof recovery) => void;
    vi.mocked(preparePixflowInstallationRecovery).mockReturnValue(new Promise(done => { resolve = done; }));
    render(<PixflowLicensePanel status={missing} />);
    fireEvent.click(screen.getByRole('button', {name: 'Site recovery'}));
    fireEvent.change(screen.getByLabelText('License key'), { target: { value: 'entered-key' } });
    fireEvent.click(screen.getByText('Prepare recovery request'));
    expect(preparePixflowInstallationRecovery).toHaveBeenCalledWith('entered-key');
    expect(screen.getByText('Preparing request...')).toBeTruthy();
    resolve(recovery);
    await waitFor(() => expect(screen.getByLabelText('Public recovery request')).toBeTruthy());
    expect((screen.getByLabelText('Public recovery request') as HTMLTextAreaElement).value).not.toContain('entered-key');
    expect(screen.getByText('I’ve approved it — reconnect')).toBeTruthy();
  });
  it('shows preparation failure inside the recovery controls', async () => {
    vi.mocked(preparePixflowInstallationRecovery).mockRejectedValue(new Error('Enter your Pixflow license key above, then prepare the recovery request.'));
    render(<PixflowLicensePanel status={missing} />);
    fireEvent.click(screen.getByRole('button', {name: 'Site recovery'}));
    fireEvent.click(screen.getByText('Prepare recovery request'));
    const error = await screen.findByRole('alert');
    expect(error.closest('section[aria-label="Site recovery"]')).not.toBeNull();
    expect(screen.queryByLabelText('Public recovery request')).toBeNull();
    expect((screen.getByText('Prepare recovery request') as HTMLButtonElement).disabled).toBe(false);
  });
});

it.each(['missing','expired'])('keeps Free licence status without duplicate Bridge setup for %s Pro licence', status => {
 render(<PixflowLicensePanel status={{requires_license:false,runtime_ready:true,license:{present:status==='expired',valid:false,status},central_entitlement:{enabled:true,valid:false}}}/>);
 expect(screen.queryByRole('button',{name:'Connect bridge'})).toBeNull();
 expect(screen.queryByText('Advanced: connect from the CLI')).toBeNull();
 expect(screen.getByText(/Free WordPress and Gutenberg editing remain available/)).toBeTruthy();
});


it('keeps recovery collapsed until requested, and exposes its expansion state', () => {
  render(<PixflowLicensePanel status={{ ...activeLicense, central_entitlement: { enabled: true, valid: true } } as PixflowLicenseStatus} />);
  const toggle = screen.getByRole('button', { name: 'Site recovery' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
});

it('keeps the prepared request on failed completion, then reports a successful recovery', async () => {
  const recovery = { request: { schema: 'pixflow.installation-recovery.v1' as const, installation_id: 'candidate', public_key_pem: 'PUBLIC', site_url: 'https://site.example' }, account_url: 'https://pixflow.dev/account/licenses' };
  vi.mocked(preparePixflowInstallationRecovery).mockResolvedValue(recovery);
  const recovered = { ...activeLicense, central_entitlement: { enabled: true, valid: true } } as PixflowLicenseStatus;
  vi.mocked(completePixflowInstallationRecovery).mockRejectedValueOnce(new Error('Approve the request in your account first.')).mockResolvedValueOnce(recovered);
  const changed = vi.fn();
  render(<PixflowLicensePanel onStatusChange={changed} status={{ ...activeLicense, central_entitlement: { enabled: true, valid: true } } as PixflowLicenseStatus} />);
  fireEvent.click(screen.getByRole('button', { name: 'Site recovery' }));
  fireEvent.click(screen.getByText('Prepare recovery request'));
  const confirm = await screen.findByRole('button', {name: 'I’ve approved it — reconnect'});
  await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByRole('link', {name: 'Open Pixflow account'}).getAttribute('href')).toBe(recovery.account_url);
  fireEvent.click(confirm);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByLabelText('Public recovery request')).toBeTruthy();
  fireEvent.click(confirm);
  await waitFor(() => expect(changed).toHaveBeenCalledWith(recovered));
  expect(completePixflowInstallationRecovery).toHaveBeenLastCalledWith('candidate');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Installation recovered');
});


it('updates a licence with Enter and clears the entered key on success', async () => {
  vi.mocked(validatePixflowLicense).mockResolvedValue(activeLicense);
  const changed = vi.fn();
  render(<PixflowLicensePanel status={activeLicense} onStatusChange={changed} />);
  const field = screen.getByLabelText('License key') as HTMLInputElement;
  fireEvent.change(field, {target:{value:'replacement-key'}});
  fireEvent.keyDown(field, {key:'Enter'});
  await waitFor(() => expect(changed).toHaveBeenCalledWith(activeLicense));
  expect(validatePixflowLicense).toHaveBeenCalledWith('replacement-key');
  expect(field.value).toBe('');
  expect((screen.getByRole('button', {name:'Update license'}) as HTMLButtonElement).disabled).toBe(true);
});

it('resets a licence through its separate action and preserves the Free access message', async () => {
  const free = {requires_license:false,license:{present:false,valid:false,status:'missing'}} as PixflowLicenseStatus;
  vi.mocked(resetPixflowLicense).mockResolvedValue(free);
  const changed = vi.fn();
  render(<PixflowLicensePanel status={activeLicense} onStatusChange={changed} />);
  fireEvent.click(screen.getByRole('button', {name:'Reset'}));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(free));
  expect(screen.getByText(/Free WordPress and Gutenberg editing remain available/)).toBeTruthy();
});

it('does not offer a licence-key form outside WordPress context', () => {
  vi.mocked(isPixflowWordPressEmbed).mockReturnValue(false);
  try {
    render(<PixflowLicensePanel mode="onboarding" />);
    expect(screen.queryByLabelText('License key')).toBeNull();
    expect(screen.getByText(/WordPress admin/)).toBeTruthy();
  } finally { vi.mocked(isPixflowWordPressEmbed).mockReturnValue(true); }
});
