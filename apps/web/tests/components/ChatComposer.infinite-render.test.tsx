// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer, type ChatComposerHandle } from '../../src/components/ChatComposer';
import { WorkspaceHomeComposer } from '../../src/components/WorkspaceHomeComposer';
import { composerText, flushMounts, pressEnter, typeAndSettle } from '../helpers/lexical-composer';

let fetchMock: ReturnType<typeof vi.fn>;

function renderComposer(overrides: Partial<ComponentProps<typeof ChatComposer>> = {}) {
  return render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      skills={[]}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if ((url === '/api/mcp/servers' || url === '/api/mcp/servers?view=summary')) {
      return new Response(JSON.stringify({ servers: [], templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if ((url === '/api/plugins' || url === '/api/plugins?view=summary')) {
      return new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if ((url === '/api/skills' || url === '/api/skills?view=summary')) {
      return new Response(JSON.stringify({ skills: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  cleanup();
});

describe('ChatComposer infinite re-render regression (#2097)', () => {
  it('restores Home drafts through the real shared composer after navigation', async () => {
    const props = { active: true, prompt: '', sessionMode: 'design' as const,
      onSessionModeChange: vi.fn(), skills: [], onSubmit: async () => true };
    const view = render(<WorkspaceHomeComposer {...props}/>);
    await flushMounts();
    await act(async () => { await typeAndSettle('Home draft that must survive navigation'); });
    await waitFor(() => expect(composerText()).toBe('Home draft that must survive navigation'));
    view.unmount();
    render(<WorkspaceHomeComposer {...props}/>);
    await flushMounts();
    await waitFor(() => expect(composerText()).toBe('Home draft that must survive navigation'));
  });
  it('shows only stop while streaming with an empty composer', () => {
    renderComposer({ streaming: true });

    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.queryByTestId('chat-send')).toBeNull();
  });

  it('keeps send available while streaming so the next prompt can queue', async () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    renderComposer({ streaming: true, onSend, onStop });
    await flushMounts();

    await typeAndSettle('change the font');

    // The editor's onChange → setDraft settles a tick after typeAndSettle
    // returns; wait for the send button (which only shows once the composer has
    // payload) before asserting Stop is gone.
    await waitFor(() => expect(screen.getByTestId('chat-send')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    fireEvent.click(screen.getByTestId('chat-send'));

    expect(onStop).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledWith('change the font', [], [], undefined, undefined);
  });

  it('restores a saved draft for the active conversation', async () => {
    window.localStorage.setItem('od:chat-composer:draft:project-1:conv-1', 'draft before refresh');

    renderComposer({
      draftStorageKey: 'od:chat-composer:draft:project-1:conv-1',
    });
    await flushMounts();

    await waitFor(() => expect(composerText()).toBe('draft before refresh'));
  });

  it('clears the saved draft after submitting it', async () => {
    const key = 'od:chat-composer:draft:project-1:conv-1';
    const onSend = vi.fn();
    renderComposer({
      draftStorageKey: key,
      onSend,
    });
    await flushMounts();

    await typeAndSettle('send then clear');

    await waitFor(() => expect(window.localStorage.getItem(key)).toBe('send then clear'));
    pressEnter({ meta: true });

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.localStorage.getItem(key)).toBeNull());
  });

  it('keeps the original draft while a send is paused and then rejected', async () => {
    let resolveDecision!: (outcome: 'restore-draft') => void;
    const onSend = vi.fn(() => new Promise<'restore-draft'>((resolve) => {
      resolveDecision = resolve;
    }));
    renderComposer({ onSend });
    await flushMounts();

    await typeAndSettle('keep this exact prompt');
    await waitFor(() => expect(screen.getByTestId('chat-send')).toBeTruthy());
    fireEvent.click(screen.getByTestId('chat-send'));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(composerText()).toBe('keep this exact prompt');

    await act(async () => resolveDecision('restore-draft'));
    expect(composerText()).toBe('keep this exact prompt');
  });

  it('does not enter an infinite update loop on rapid plain-text typing', async () => {
    // #2097 surfaced as "Maximum update depth exceeded" from a feedback loop
    // between the input and a layout effect. The Lexical editor owns its own
    // text now (no overlay scroll-sync effect), so rapid edits must settle
    // without re-render storms.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderComposer();
      await flushMounts();

      for (const value of ['h', 'he', 'hel', 'hell', 'hello']) {
        await typeAndSettle(value);
      }

      const maxDepth = consoleError.mock.calls.find((args) =>
        args.some((a) => typeof a === 'string' && a.includes('Maximum update depth exceeded')),
      );
      expect(maxDepth).toBeUndefined();
      expect(composerText()).toBe('hello');
    } finally {
      consoleError.mockRestore();
    }
  });
});

it('synchronizes drafts between simultaneously mounted composers', async () => {
  const first = createRef<ChatComposerHandle>();
  const second = createRef<ChatComposerHandle>();
  const props = { projectId: 'project-1', onEnsureProject: async () => 'project-1', projectFiles: [], streaming: false, onSend: vi.fn(), onStop: vi.fn(), skills: [], draftStorageKey: 'two-surfaces' };
  render(<><ChatComposer {...props} ref={first} /><ChatComposer {...props} ref={second} /></>);
  await flushMounts();
  act(() => first.current!.restoreDraft({ text: 'Shared mounted draft' }));
  await waitFor(() => expect(screen.getAllByRole('combobox').filter(element => element.getAttribute('contenteditable') === 'true').map(element => element.textContent)).toEqual(['Shared mounted draft', 'Shared mounted draft']));
});

it('recovers a rejected send in its original chat after switching', async () => {
  let rejectSend!: () => void;
  const props = { projectId: 'project-1', onEnsureProject: async () => 'project-1', projectFiles: [], streaming: false, onSend: vi.fn(() => new Promise<void>((_, reject) => { rejectSend = () => reject(new Error('offline')); })), onStop: vi.fn(), skills: [] };
  const view = render(<ChatComposer {...props} draftStorageKey="failed-a" queueStorageKey="queue-a" />);
  await flushMounts();
  await typeAndSettle('Preserve failed A');
  fireEvent.click(screen.getByTestId('chat-send'));
  await waitFor(() => expect(composerText().trim()).toBe(''));
  view.rerender(<ChatComposer {...props} draftStorageKey="failed-b" queueStorageKey="queue-b" />);
  await flushMounts();
  await typeAndSettle('Keep B');
  await act(async () => rejectSend());
  expect(composerText()).toBe('Keep B');
  view.rerender(<ChatComposer {...props} draftStorageKey="failed-a" queueStorageKey="queue-a" />);
  await waitFor(() => expect(composerText()).toBe('Preserve failed A'));
});

it('keeps drafts isolated when the same composer switches conversations', async () => {
  const props = { projectId: 'project-1', onEnsureProject: async () => 'project-1', projectFiles: [], streaming: false, onSend: vi.fn(), onStop: vi.fn(), skills: [] };
  const view = render(<ChatComposer {...props} draftStorageKey="chat-a" />);
  await flushMounts();
  await typeAndSettle('Draft in A');
  await waitFor(() => expect(localStorage.getItem('chat-a')).toBe('Draft in A'));
  view.rerender(<ChatComposer {...props} draftStorageKey="chat-b" />);
  await waitFor(() => expect(composerText().trim()).toBe(''));
  await flushMounts();
  await typeAndSettle('Draft in B');
  await waitFor(() => expect(localStorage.getItem('chat-b')).toBe('Draft in B'));
  view.rerender(<ChatComposer {...props} draftStorageKey="chat-a" />);
  await waitFor(() => expect(composerText()).toBe('Draft in A'));
  expect(localStorage.getItem('chat-b')).toBe('Draft in B');
});
