// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkspaceSummary } from '../../src/components/WorkspaceSummary';
import { fetchProjectFileText } from '../../src/providers/registry';
import type { ProjectFile } from '../../src/types';

vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('../../src/components/ConnectorLogo', () => ({ useResolvedTheme: () => 'dark' }));
vi.mock('../../src/providers/registry', () => ({
  fetchProjectFileText: vi.fn(),
  projectFileUrl: (id: string, name: string) => `/download/${id}/${encodeURIComponent(name)}`,
  projectRawUrl: (id: string, name: string) => `/preview/${id}/${encodeURIComponent(name)}`,
  appendProjectFileQuery: (url: string, query: string) => `${url}?${query}`,
}));
const files: ProjectFile[] = [
  { name: 'site.html', kind: 'html', mime: 'text/html', size: 100, mtime: 1 },
  { name: 'notes.txt', kind: 'text', mime: 'text/plain', size: 100, mtime: 1 },
];
const props = { open: true, projectId: 'chat-1', files, selectedName: 'site.html', onSelect: vi.fn(), onClose: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(fetchProjectFileText).mockResolvedValue('Saved output'); });
afterEach(cleanup);

describe('Workspace summary', () => {
  it('anchors the fixed card below the chat header and keeps it inside the viewport on resize', () => {
    const view = render(<WorkspaceSummary {...props} />);
    vi.spyOn(view.container, 'getBoundingClientRect').mockReturnValue({ top: 72 } as DOMRect);
    fireEvent(window, new Event('resize'));
    const panel = screen.getByTestId('workspace-summary');
    expect(panel.style.getPropertyValue('--summary-top')).toBe('128px');
    expect(panel.style.getPropertyValue('--summary-max-height')).toBe(`${window.innerHeight - 148}px`);
  });
  it('omits retired catalogue metadata without mutating saved files', () => {
    const saved = [...files, { ...files[1]!, name: 'plugin-assets/od-default/plugin-manifest.json' }];
    render(<WorkspaceSummary {...props} files={saved} />);
    expect(screen.queryByRole('button', { name: saved[2]!.name })).toBeNull();
    expect(screen.getByRole('button', { name: 'notes.txt' })).toBeTruthy();
    expect(saved).toHaveLength(3);
  });
  it('does not load previews or expose interactive controls while closed', () => {
    const view = render(<WorkspaceSummary {...props} open={false} selectedName="notes.txt" />);
    expect(screen.getByTestId('workspace-summary').hasAttribute('inert')).toBe(true);
    expect(view.container.querySelector('iframe')).toBeNull();
    expect(fetchProjectFileText).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('keeps downloads available and previews HTML in a script-free sandbox', () => {
    const view = render(<WorkspaceSummary {...props} />);
    const frame = view.container.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('src')).toBe('/preview/chat-1/site.html');
    expect(screen.getByRole('link', { name: 'assistant.downloadFile: site.html' }).getAttribute('href')).toBe('/download/chat-1/site.html');
    fireEvent.click(screen.getByRole('button', { name: 'notes.txt' }));
    expect(props.onSelect).toHaveBeenCalledWith('notes.txt');
  });
  it('closes on Escape but leaves an active media dialog in control', () => {
    render(<WorkspaceSummary {...props} />);
    const dialog = document.createElement('dialog'); dialog.open = true; document.body.append(dialog);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).not.toHaveBeenCalled();
    dialog.remove();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledOnce();
  });
  it('loads text and recovers from a failed preview without removing files', async () => {
    vi.mocked(fetchProjectFileText).mockRejectedValueOnce(new Error('offline'));
    const view = render(<WorkspaceSummary {...props} selectedName="notes.txt" />);
    await screen.findByText('fileViewer.previewUnavailable');
    expect(screen.getByRole('link', { name: 'assistant.downloadFile: notes.txt' })).toBeTruthy();
    view.rerender(<WorkspaceSummary {...props} selectedName="notes.txt" files={[{ ...files[1]!, mtime: 2 }]} />);
    await screen.findByText('Saved output');
  });
  it('does not fetch oversized text previews', () => {
    render(<WorkspaceSummary {...props} files={[{ ...files[1]!, size: 2_000_000 }]} selectedName="notes.txt" />);
    expect(fetchProjectFileText).not.toHaveBeenCalled();
    expect(screen.getByText('fileViewer.previewUnavailable')).toBeTruthy();
  });
  it('opens the shared destination selector without sending a run or requiring HTML', () => {
    const choose = vi.fn();
    const view = render(<WorkspaceSummary {...props} files={[]} />);
    expect(screen.queryByRole('button', { name: 'Open builder' })).toBeNull();
    view.rerender(<WorkspaceSummary {...props} files={[]} destinationAction={<button onClick={choose}>Open builder</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open builder' }));
    expect(choose).toHaveBeenCalledOnce();
  });
});
