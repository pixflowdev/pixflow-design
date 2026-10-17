// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PixflowProMigration } from '../../src/components/PixflowProMigration';
import type { PixflowProInstallation } from '@open-design/contracts';
afterEach(cleanup);
it('opens account eligibility without enrolling from WordPress', () => {
  render(<PixflowProMigration status={{ ...status, eligible:false, trial_url:'https://pixflow.dev/account#pro-trial' }}/>);
  expect(screen.getByRole('link', { name:/Check trial/ }).getAttribute('href')).toBe('https://pixflow.dev/account#pro-trial');
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText(/starts only after you confirm/)).toBeTruthy();
});
const status: PixflowProInstallation = { eligible: true, installation: 'missing', account_url: 'https://pixflow.dev/account#pro-download', plugins_url: '/wp-admin/plugins.php', upload_url: '/wp-admin/plugin-install.php?tab=upload' };
it('offers existing customers an account download and native upload, not an installer or trial', () => {
  render(<PixflowProMigration status={status}/>);
  expect(screen.getByRole('link', {name:/Download Pro/}).getAttribute('href')).toBe(status.account_url);
  expect(screen.getByRole('link', {name:/Upload Pro/}).getAttribute('href')).toBe(status.upload_url);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText(/No new purchase or trial/)).toBeTruthy();
  expect(screen.getByText(/Re-enable it in settings/)).toBeTruthy();
});
it('changes to activation without suggesting another download for an inactive installation', () => {
  render(<PixflowProMigration status={{...status, installation:'inactive'}}/>);
  expect(screen.getByRole('link', {name:/Activate Pro/}).getAttribute('href')).toBe(status.plugins_url);
  expect(screen.queryByRole('link', {name:/Download Pro/})).toBeNull();
});
it.each(['incomplete','incompatible'] as const)('gives repair guidance for %s', installation => {
  render(<PixflowProMigration status={{...status, installation}}/>);
  expect(screen.getByText(/needs attention/)).toBeTruthy();
});
it.each([undefined, {...status,eligible:false}, {...status,installation:'active'}] as const)('does not advertise an entitlement unless verified and needed', value => {
  const {container}=render(<PixflowProMigration status={value}/>);
  expect(container.textContent).toBe('');
});
