// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DesignSystemPreviewModal } from '../../src/components/DesignSystemPreviewModal';
import { fetchDesignSystem, fetchDesignSystemPreview, fetchDesignSystemShowcase } from '../../src/providers/registry';
vi.mock('../../src/providers/registry', () => ({ fetchDesignSystem: vi.fn(), fetchDesignSystemPreview: vi.fn(), fetchDesignSystemShowcase: vi.fn() }));
vi.mock('../../src/analytics/provider', () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('../../src/components/PreviewModal', () => ({ PreviewModal: ({ views }: { views: { html?: string | null; unavailable?: unknown }[] }) => <div role="dialog">{views[0]?.html || (views[0]?.unavailable ? 'Unavailable' : 'Loading')}</div> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('loads WordPress reference content without relying on child effect order', async () => {
  vi.mocked(fetchDesignSystemShowcase).mockResolvedValue('<h1>Reference</h1>');
  vi.mocked(fetchDesignSystemPreview).mockResolvedValue('Tokens');
  vi.mocked(fetchDesignSystem).mockResolvedValue({ body: 'Design guidance' } as never);
  render(<DesignSystemPreviewModal system={{ id: 'airbnb', title: 'Airbnb' } as never} onClose={() => {}} />);
  expect(await screen.findByText('<h1>Reference</h1>')).toBeTruthy();
  expect(screen.getByRole('dialog').closest('.pixflow-design-portal-scope')).toBeTruthy();
});
it('shows an unavailable state instead of a permanent spinner', async () => {
  vi.mocked(fetchDesignSystemShowcase).mockResolvedValue(null);
  vi.mocked(fetchDesignSystemPreview).mockResolvedValue(null);
  vi.mocked(fetchDesignSystem).mockResolvedValue(null);
  render(<DesignSystemPreviewModal system={{ id: 'missing', title: 'Missing' } as never} onClose={() => {}} />);
  expect(await screen.findByText('Unavailable')).toBeTruthy();
});
