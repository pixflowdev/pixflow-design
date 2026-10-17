// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PixflowChatHistoryStorageUsage } from '@open-design/contracts';

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), download: vi.fn(), usage: vi.fn(), list: vi.fn(), read: vi.fn(), owner: 'free-user' }));
vi.mock('../../src/pixflow/chat-history-export', () => ({ prepareChatExport: mocks.prepare, downloadChatExport: mocks.download, readChatStorageUsage: mocks.usage }));
vi.mock('../../src/pixflow/chat-history-client', () => ({ chatHistoryOwnerScope: () => mocks.owner, listChatHistory: mocks.list, readChatHistory: mocks.read, mergeChatHistory: (older: unknown[], newer: unknown[]) => [...older, ...newer] }));
vi.mock('../../src/components/shared-chat/SharedChatRows', () => ({ SharedChatRows: ({ messages }: { messages: Array<{ id: string; content: string }> }) => <div>{messages.map(message => <p key={message.id}>{message.content}</p>)}</div> }));

import { ChatExportButton } from '../../src/pixflow/ChatExportButton';
import { ChatStorageSettings, formatChatStorageBytes } from '../../src/components/ChatStorageSettings';
import { ChatHistoryBrowser } from '../../src/pixflow/ChatHistoryBrowser';

const binding = { projectId: 'free-project', conversationId: 'free-chat' };
const archive = { blob: new Blob(['{"messages":[]}'], { type: 'application/json' }), count: 500 };
const usage: PixflowChatHistoryStorageUsage = {
  scope: 'current-user', measuredAt: '2026-10-16T12:00:00Z', conversationCount: 4, messageCount: 500,
  compressedMessageCount: 480, storedMessageBytes: 1024, logicalMessageBytes: 4096, savedMessageBytes: 3072,
  projectMetadataBytes: 2048, workingContextBytes: 512, exclusions: ['media-files', 'browser-cache', 'bridge-files', 'database-overhead', 'saved-memory'],
};

function deferred<T>() {
  let resolve!: (result: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.prepare.mockReset(); mocks.usage.mockReset(); mocks.list.mockReset(); mocks.read.mockReset(); mocks.owner = 'free-user';
  window.localStorage.clear(); window.localStorage.setItem('existing-chat-and-settings', '{"draft":"keep me","theme":"dark"}');
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe('complete chat export controls', () => {
  it('works without Pro configuration, exposes progress, prevents duplicate starts and preserves settings', async () => {
    const pending = deferred<typeof archive>(); mocks.prepare.mockReturnValue(pending.promise);
    render(<ChatExportButton binding={binding} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export chat' }));
    const busy = screen.getByRole('button', { name: 'Exporting…' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    act(() => mocks.prepare.mock.calls[0]![2](100));
    expect(screen.getByRole('status').textContent).toBe('Exporting 100 messages…');
    await act(async () => pending.resolve(archive));
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(archive.blob, binding);
    expect(screen.getByRole('status').textContent).toBe('Chat exported.');
    expect((screen.getByRole('button', { name: 'Export chat' }) as HTMLButtonElement).disabled).toBe(false);
    expect(window.localStorage.getItem('existing-chat-and-settings')).toBe('{"draft":"keep me","theme":"dark"}');
  });

  it('does not download an incomplete export and allows a clean retry', async () => {
    mocks.prepare.mockRejectedValueOnce(new Error('Snapshot changed')).mockResolvedValueOnce(archive);
    render(<ChatExportButton binding={binding} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export chat' }));
    await screen.findByRole('alert'); expect(mocks.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Export chat' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cancels an export when another chat is selected and never downloads the old result', async () => {
    const old = deferred<typeof archive>(); mocks.prepare.mockReturnValueOnce(old.promise).mockResolvedValueOnce(archive);
    const view = render(<ChatExportButton binding={binding} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export chat' }));
    const signal = mocks.prepare.mock.calls[0]![1] as AbortSignal;
    const next = { ...binding, conversationId: 'second-chat' }; view.rerender(<ChatExportButton binding={next} />);
    expect(signal.aborted).toBe(true);
    act(() => mocks.prepare.mock.calls[0]![2](400));
    expect((screen.getByRole('button', { name: 'Export chat' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Exporting 400 messages…')).toBeNull();
    await act(async () => old.resolve(archive)); expect(mocks.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Export chat' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledExactlyOnceWith(archive.blob, next));
  });

  it('aborts on unmount and never downloads a late response', async () => {
    const pending = deferred<typeof archive>(); mocks.prepare.mockReturnValue(pending.promise);
    const view = render(<ChatExportButton binding={binding} />); fireEvent.click(screen.getByRole('button', { name: 'Export chat' }));
    const signal = mocks.prepare.mock.calls[0]![1] as AbortSignal; view.unmount();
    expect(signal.aborted).toBe(true); await act(async () => pending.resolve(archive));
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('offers full export in the Free history browser even when only one page is displayed', async () => {
    mocks.list.mockResolvedValue({ conversations: [{ ...binding, title: 'All 500 messages', createdAt: 1, updatedAt: 2, messageCount: 500 }], hasMore: false, nextCursor: null });
    mocks.read.mockResolvedValue({ messages: [{ id: 'last', content: 'Newest saved message' }], hasMore: true, nextCursor: 'older' });
    mocks.prepare.mockResolvedValue(archive);
    render(<ChatHistoryBrowser />); fireEvent.click(screen.getByRole('button', { name: 'Conversation history' }));
    fireEvent.click(await screen.findByRole('button', { name: /All 500 messages/ }));
    await screen.findByText('Newest saved message'); expect(screen.getByRole('button', { name: 'Load earlier messages' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export chat' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    expect(mocks.prepare.mock.calls[0]![0]).toMatchObject(binding);
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('existing-chat-and-settings')).toBe('{"draft":"keep me","theme":"dark"}');
  });
});

describe('Free storage reporting', () => {
  it('shows owner-scoped storage, preserved recovery copies and exclusions without changing data', async () => {
    const preserved = JSON.stringify(usage); mocks.usage.mockResolvedValue(usage);
    render(<ChatStorageSettings />);
    await screen.findByText('500 messages across 4 chats');
    expect(screen.getByText('1 KiB')).toBeTruthy(); expect(screen.getByText('75% smaller')).toBeTruthy();
    expect(screen.getByText('2 KiB')).toBeTruthy(); expect(screen.getByText('512 B')).toBeTruthy();
    expect(screen.getByText(/not disk allocation/)).toBeTruthy(); expect(screen.getByRole('button', { name: 'Conversation history' })).toBeTruthy();
    expect(mocks.usage).toHaveBeenCalledTimes(1); expect(mocks.usage.mock.calls[0]).toHaveLength(1);
    expect(JSON.stringify(usage)).toBe(preserved);
    expect(window.localStorage.getItem('existing-chat-and-settings')).toBe('{"draft":"keep me","theme":"dark"}');
  });

  it('retains the last successful usage through a failed refresh and retries without deleting anything', async () => {
    mocks.usage.mockResolvedValueOnce(usage).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...usage, messageCount: 501 });
    render(<ChatStorageSettings />); await screen.findByText('500 messages across 4 chats');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh usage' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Storage usage could not be loaded.');
    expect(screen.getByText('500 messages across 4 chats')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh usage' }));
    await screen.findByText('501 messages across 4 chats'); expect(screen.queryByRole('alert')).toBeNull();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('shows a recoverable initial error without inventing zero usage', async () => {
    mocks.usage.mockRejectedValue(new Error('forbidden'));
    render(<ChatStorageSettings />); await screen.findByRole('alert');
    expect(screen.queryByText('0 B')).toBeNull();
    expect((screen.getByRole('button', { name: 'Refresh usage' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not display an in-flight response belonging to a previous account', async () => {
    const pending = deferred<PixflowChatHistoryStorageUsage>(); mocks.usage.mockReturnValue(pending.promise);
    render(<ChatStorageSettings />); mocks.owner = 'different-user';
    await act(async () => pending.resolve(usage));
    expect(screen.queryByText('500 messages across 4 chats')).toBeNull();
  });

  it('clears already displayed usage when the signed-in account changes', async () => {
    const pending = deferred<PixflowChatHistoryStorageUsage>();
    mocks.usage.mockResolvedValueOnce(usage).mockReturnValue(pending.promise);
    const view = render(<ChatStorageSettings />); await screen.findByText('500 messages across 4 chats');
    mocks.owner = 'different-user'; view.rerender(<ChatStorageSettings />);
    expect(screen.queryByText('500 messages across 4 chats')).toBeNull();
    await act(async () => pending.resolve({ ...usage, messageCount: 3 }));
  });

  it('cancels the usage request on unmount', async () => {
    const pending = deferred<PixflowChatHistoryStorageUsage>(); mocks.usage.mockReturnValue(pending.promise);
    const view = render(<ChatStorageSettings />); const signal = mocks.usage.mock.calls[0]![0] as AbortSignal;
    view.unmount(); expect(signal.aborted).toBe(true); await act(async () => pending.resolve(usage));
  });

  it.each([[0, '0 B'], [1024, '1 KiB'], [1024 ** 2, '1 MiB'], [1024 ** 3, '1 GiB'], [-5, '0 B'], [Number.NaN, '0 B']])('formats %s bytes without invalid or negative usage', (bytes, expected) => {
    expect(formatChatStorageBytes(bytes)).toBe(expected);
  });
});
