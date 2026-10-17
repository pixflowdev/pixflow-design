// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GeneratedMedia, MediaGenerationPlaceholder } from '../../src/components/chat/GeneratedMedia';
import { pendingMediaGenerations } from '../../src/components/chat/media-generation';
import type { AgentEvent, ProjectFile } from '../../src/types';

vi.mock('../../src/i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('../../src/components/ConnectorLogo', () => ({ useResolvedTheme: () => 'dark' }));
vi.mock('../../src/providers/registry', () => ({
  projectRawUrl: (id: string, name: string) => `/projects/${id}/raw/${encodeURIComponent(name)}?nonce=test`,
  projectFileUrl: (id: string, name: string) => `/projects/${id}/download/${encodeURIComponent(name)}`,
  appendProjectFileQuery: (url: string, query: string) => `${url}&${query}`,
}));
const files: ProjectFile[] = [
  { name: 'courtyard.png', kind: 'image', mime: 'image/png', size: 10, mtime: 123 },
  { name: 'tour.mp4', kind: 'video', mime: 'video/mp4', size: 20, mtime: 124 },
];
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('shared generated media', () => {
  it('uses protected versioned previews and explicit download links without autoplay', () => {
    const view = render(<GeneratedMedia files={files} projectId="chat-1" />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('/projects/chat-1/raw/courtyard.png?nonce=test&v=123');
    const video = view.container.querySelector('video')!;
    expect(video.controls).toBe(true);
    expect(video.autoplay).toBe(false);
    expect(video.preload).toBe('metadata');
    expect(screen.getByRole('link', { name: 'assistant.downloadFile: courtyard.png' }).getAttribute('download')).toBe('courtyard.png');
  });
  it('opens, zooms, navigates and closes without replacing the conversation', () => {
    render(<GeneratedMedia files={files} projectId="chat-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'assistant.openFile: courtyard.png' })[0]!);
    expect(screen.getByRole('dialog', { name: 'courtyard.png' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'fileViewer.zoomIn' }));
    expect(screen.getByRole('button', { name: '150%' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'designFiles.next' }));
    expect(screen.getByRole('dialog', { name: 'tour.mp4' }).querySelector('video')?.controls).toBe(true);
    expect(screen.queryByRole('button', { name: 'fileViewer.zoomIn' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: '100%' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('img')).toBeTruthy();
  });
  it('retains download access when preview fails and opens files only on request', () => {
    const open = vi.fn();
    render(<GeneratedMedia files={files} projectId="chat-1" onRequestOpenFile={open} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'assistant.openFile: courtyard.png' })[0]!);
    fireEvent.error(screen.getByRole('dialog').querySelector('img')!);
    expect(screen.getByRole('alert').textContent).toBe('chat.mediaPreviewFailed');
    expect(screen.getByRole('link', { name: 'assistant.downloadFile' })).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'workspace.summary' }));
    expect(open).toHaveBeenCalledWith('courtyard.png');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('exposes an accessible busy state without invented progress percentages', () => {
    render(<MediaGenerationPlaceholder kind="image" />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('chat.generatingImage');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('generation lifecycle', () => {
  const events: AgentEvent[] = [
    { kind: 'tool_use', id: 'image', name: 'generate_image', input: {} },
    { kind: 'tool_use', id: 'video', name: 'generate_video', input: {} },
    { kind: 'tool_use', id: 'read', name: 'read_image', input: {} },
  ];
  it('tracks concurrent explicit generation calls only', () => {
    expect(pendingMediaGenerations(events, true)).toEqual([{ id: 'image', kind: 'image' }, { id: 'video', kind: 'video' }]);
  });
  it('removes completion and failure placeholders and clears all on stop', () => {
    expect(pendingMediaGenerations([...events, { kind: 'tool_result', toolUseId: 'image', content: 'failed', isError: true }], true)).toEqual([{ id: 'video', kind: 'video' }]);
    expect(pendingMediaGenerations(events, false)).toEqual([]);
  });
});
