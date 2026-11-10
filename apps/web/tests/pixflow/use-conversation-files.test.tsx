// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchProjectFiles } from '../../src/providers/registry';
import { useConversationFiles } from '../../src/pixflow/use-conversation-files';
import type { ProjectFile } from '../../src/types';
vi.mock('../../src/providers/registry', () => ({ fetchProjectFiles: vi.fn() }));
const file = { name: 'report.md', path: 'report.md', size: 24, type: 'file', kind: 'text', mime: 'text/markdown' } as ProjectFile;
describe('open conversation attachments', () => {
  beforeEach(() => vi.resetAllMocks());
  it('loads on entry and turn completion, without fetching on every render', async () => {
    vi.mocked(fetchProjectFiles).mockResolvedValue([file]);
    const { result, rerender } = renderHook(({ turn }) => useConversationFiles('project-a', turn), { initialProps: { turn: '' } });
    await waitFor(() => expect(result.current).toEqual([file]));
    rerender({ turn: '' });
    expect(fetchProjectFiles).toHaveBeenCalledTimes(1);
    rerender({ turn: 'done-1' });
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(2));
    expect(fetchProjectFiles).toHaveBeenLastCalledWith('project-a', { activeWorkspace: true });
  });
  it('never leaks a late previous-chat response into the next conversation', async () => {
    let resolve!: (files: ProjectFile[]) => void;
    vi.mocked(fetchProjectFiles).mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue([]);
    const { result, rerender } = renderHook(({ id }) => useConversationFiles(id, ''), { initialProps: { id: 'project-a' } });
    rerender({ id: 'project-b' });
    await act(async () => resolve([file]));
    expect(result.current).toEqual([]);
  });
});
