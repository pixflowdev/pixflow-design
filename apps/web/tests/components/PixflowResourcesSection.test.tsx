// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PixflowResourcesSection } from '../../src/components/PixflowResourcesSection';
import { requestWordPressRest } from '../../src/pixflow/license';
import { getPixflowSettingsSurfaceProfile } from '@open-design/contracts';
vi.mock('../../src/pixflow/license', () => ({ requestWordPressRest: vi.fn() }));
vi.mock('../../src/components/PluginDetailsModal', () => ({ PluginDetailsModal: ({ record }: { record: { title: string } }) => <div role="dialog">{record.title}</div> }));
vi.mock('../../src/components/DesignSystemPreviewModal', () => ({ DesignSystemPreviewModal: ({ system }: { system: { title: string } }) => <div role="dialog">{system.title}</div> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe('installed WordPress resources', () => {
  it('avoids a duplicate settings heading while retaining the workspace heading', async () => {
    vi.mocked(requestWordPressRest).mockResolvedValue({ ok: true, status: 200, body: { plugins: [] } });
    const view = render(<PixflowResourcesSection inSettings onDownloads={() => {}} />);
    await screen.findByText(/No resources installed/);
    expect(screen.queryByRole('heading', { name: 'Resources' })).toBeNull();
    view.rerender(<PixflowResourcesSection onDownloads={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Resources' })).toBeTruthy();
  });
  it('supports keyboard category selection and clears the previous search', async () => {
    vi.mocked(requestWordPressRest).mockResolvedValue({ ok: true, status: 200, body: { plugins: [], designTemplates: [], designSystems: [] } });
    render(<PixflowResourcesSection onDownloads={() => {}} />);
    await screen.findByText(/No resources installed/);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'old search' } });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Creative resources' }), { key: 'ArrowRight' });
    const templates = screen.getByRole('tab', { name: 'Design templates' });
    expect(templates.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(templates);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(templates.id);
    fireEvent.keyDown(templates, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Style references' }).getAttribute('aria-selected')).toBe('true');
    await screen.findByText(/No resources installed/);
  });
  it('renders readable template guidance and returns to the unchanged catalogue', async () => {
    vi.mocked(requestWordPressRest).mockImplementation(async path => ({ ok: true, status: 200, body:
      path === 'od/plugins' ? { plugins: [] } : path === 'od/design-templates' ? { designTemplates: [{ id: 'hero', name: 'Hero recipe' }] } :
      { body: '---\nid: hero\n---\n# Hero guidance\n\nKeep **existing content**.\n\n<script>alert(1)</script>' }
    }) as never);
    const view = render(<PixflowResourcesSection onDownloads={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Design templates' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Hero recipe' }));
    expect(await screen.findByRole('heading', { name: 'Hero guidance' })).toBeTruthy();
    expect(view.container.querySelector('script')).toBeNull();
    expect(view.container.textContent).not.toContain('id: hero');
    fireEvent.click(screen.getByRole('button', { name: 'Close guidance' }));
    expect(screen.getByRole('button', { name: 'Hero recipe' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Hero guidance' })).toBeNull();
    expect(vi.mocked(requestWordPressRest).mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it('exposes resources in both settings profiles', () => {
    for (const surface of ['wp_admin', 'bricks_builder'] as const) expect(getPixflowSettingsSurfaceProfile(surface).allowedSections).toContain('resources');
  });
  it('reads the site catalogue and opens creative details', async () => {
    vi.mocked(requestWordPressRest).mockResolvedValue({ ok: true, status: 200, body: { plugins: [{ id: 'photo', title: 'Product photography' }] } });
    render(<PixflowResourcesSection onDownloads={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Product photography/ }));
    expect((await screen.findByRole('dialog')).textContent).toContain('Product photography');
    expect(requestWordPressRest).toHaveBeenCalledWith('od/plugins');
  });
  it('loads relocated template guidance and separates native systems from references', async () => {
    vi.mocked(requestWordPressRest).mockImplementation(async path => ({ ok: true, status: 200, body:
      path === 'od/plugins' ? { plugins: [] } :
      path === 'od/design-templates' ? { designTemplates: [{ id: 'hero', name: 'Hero recipe', description: 'Editorial' }] } :
      path === 'od/design-templates/hero' ? { body: 'Actual recipe guidance' } :
      { designSystems: [{ id: 'saved', title: 'Saved brand', category: 'Bricks' }, { id: 'reference', title: 'Editorial reference', category: 'Style Reference' }] }
    }) as never);
    render(<PixflowResourcesSection onDownloads={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Design templates' }));
    fireEvent.click(await screen.findByRole('button', { name: /Hero recipe/ }));
    expect(await screen.findByText('Actual recipe guidance')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Style references' }));
    expect(await screen.findByRole('button', { name: /Editorial reference/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Saved brand/ })).toBeNull();
  });
  it('distinguishes request failure from an uninstalled pack and can retry', async () => {
    vi.mocked(requestWordPressRest).mockResolvedValueOnce({ ok: false, status: 503, body: { message: 'Site unavailable' } }).mockResolvedValue({ ok: true, status: 200, body: { plugins: [] } });
    const downloads = vi.fn();
    render(<PixflowResourcesSection onDownloads={downloads} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Site unavailable');
    expect(screen.queryByText(/No resources installed/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/No resources installed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Manage downloads' }));
    expect(downloads).toHaveBeenCalledOnce();
  });
});
