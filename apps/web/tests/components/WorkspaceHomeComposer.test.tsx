// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { I18nProvider } from '../../src/i18n';
import { WorkspaceHomeComposer } from '../../src/components/WorkspaceHomeComposer';
import { HomeView } from '../../src/components/HomeView';
import type { ComponentProps } from 'react';
import type { SharedChatComposer } from '../../src/components/shared-chat';

const mocks = vi.hoisted(() => ({ wordpress: false, props: null as ComponentProps<typeof SharedChatComposer> | null, create: vi.fn(), setDraft: vi.fn() }));
vi.mock('../../src/state/projects', async importOriginal => ({ ...(await importOriginal<typeof import('../../src/state/projects')>()), createProject: mocks.create }));
vi.mock('../../src/pixflow/wordpress-context', async importOriginal => ({ ...(await importOriginal<typeof import('../../src/pixflow/wordpress-context')>()), hasPixflowWordPressContext: () => mocks.wordpress }));
vi.mock('../../src/components/shared-chat', () => ({
  SharedChatComposer: forwardRef((props: ComponentProps<typeof SharedChatComposer>, ref) => {
    mocks.props = props;
    useImperativeHandle(ref, () => ({ setDraft: mocks.setDraft, focus: vi.fn() }));
    return <div data-testid="shared-composer">{props.footerAccessory}</div>;
  }),
}));
const base = { active: true, prompt: '', skills: [], sessionMode: 'design' as const, onSessionModeChange: vi.fn() };
const setup = (props = {}) => render(<I18nProvider initial="en"><WorkspaceHomeComposer {...base} onSubmit={async () => true} {...props}/></I18nProvider>);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mocks.wordpress = false; });
beforeEach(() => { mocks.create.mockReset(); mocks.setDraft.mockReset(); });

describe('WorkspaceHomeComposer', () => {
  it('updates voice availability without remounting and prepares a chat without a live microphone', async () => {
    const submit = vi.fn(async (_turn: unknown) => true);
    const view = setup({ onSubmit: submit });
    expect(mocks.props?.codexVoiceEnabled).toBe(false);
    view.rerender(<I18nProvider initial="en"><WorkspaceHomeComposer {...base} onSubmit={submit} codexVoiceEnabled/></I18nProvider>);
    expect(mocks.props?.codexVoiceEnabled).toBe(true);
    await act(async () => { await mocks.props!.onPrepareCodexVoice!({}); });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ startVoice: true, attachments: [], comments: [] }));
    expect(submit.mock.calls[0]![0]).not.toHaveProperty('meta.voice');
    view.rerender(<I18nProvider initial="en"><WorkspaceHomeComposer {...base} onSubmit={submit} codexVoiceEnabled={false}/></I18nProvider>);
    expect(mocks.props?.codexVoiceEnabled).toBe(false);
  });
  it('places the installable library after the Home composer and refreshes skills after installation', async () => {
    mocks.wordpress = true;
    let installed = false;
    const skill = { id: 'design-brief', name: 'Design Brief', description: 'Plan the design', version: '1.0.0', digest: 'a'.repeat(64), enabled: true, canInstall: true, updateAvailable: false, canRollback: false };
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      if (init?.method === 'POST') { installed = true; return new Response('{"ok":true}'); }
      return new Response(JSON.stringify({ servers: [], templates: [], skills: [{ ...skill, installedVersion: installed ? '1.0.0' : null }], pro: true, error: null }));
    }));
    const refresh = vi.fn(async () => {});
    render(<I18nProvider initial="en"><HomeView projects={[]} onSubmit={async () => true} onOpenProject={vi.fn()} onViewAllProjects={vi.fn()} onSkillsRefresh={refresh} catalogLoadAllowed={false}/></I18nProvider>);
    const library = await screen.findByRole('region', { name: 'Skill library' });
    expect(screen.getByTestId('workspace-home-composer').compareDocumentPosition(library) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(library.getAttribute('data-presentation')).toBe('cards');
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByRole('switch', { name: /Design Brief/ }).getAttribute('aria-checked')).toBe('true');
  });
  it('uses the shared home flow in WordPress and forwards @/command selections intact', async () => {
    mocks.wordpress = true;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ servers: [], templates: [], skills: [], pro: true, error: null }))));
    const onSubmit = vi.fn(async () => true);
    render(<I18nProvider initial="en"><HomeView projects={[]} onSubmit={onSubmit} onOpenProject={vi.fn()} onViewAllProjects={vi.fn()} catalogLoadAllowed={false}/></I18nProvider>);
    expect(screen.getByTestId('workspace-home-composer')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-input')).toBeNull();
    expect(screen.queryByText('Recent projects')).toBeNull();
    expect(screen.queryByTestId('home-hero-rail-prototype')).toBeNull();
    const meta = { skillIds: ['typography'], context: { skillIds: ['typography'], mcpServerIds: ['figma'], connectorIds: ['github'] } };
    await act(async () => { await mocks.props!.onSend('Refine this page', [{ path: 'reference.png', name: 'reference.png', kind: 'image' }], [], meta); });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Refine this page', firstTurn: expect.objectContaining({ meta, attachments: [{ path: 'reference.png', name: 'reference.png', kind: 'image' }] }) }));
  });
  it('uses shared floating presentation, commands and provider controls without legacy cards', () => {
    setup({ executionSwitcher: <button>Provider</button> });
    expect(mocks.props?.appearance).toBe('floating');
    expect(mocks.props?.compactPlusMenu).toBe(true);
    expect(screen.getByRole('button', { name: 'Provider' })).toBeTruthy();
    expect(screen.queryByText('Recent projects')).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('deduplicates lazy upload ownership and reuses that draft when sending complete context', async () => {
    let complete!: (value: unknown) => void;
    mocks.create.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const submit = vi.fn(async () => true);
    setup({ onSubmit: submit });
    let first!: Promise<string | null>, second!: Promise<string | null>;
    await act(async () => {
      first = mocks.props!.onEnsureProject(); second = mocks.props!.onEnsureProject();
      complete({ project: { id: 'upload-chat' } }); await Promise.all([first, second]);
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(await first).toBe('upload-chat'); expect(await second).toBe('upload-chat');
    const attachments = [{ path: 'design.png', name: 'design.png', kind: 'image' as const }];
    const meta = { skillIds: ['motion'], context: { mcpServerIds: ['figma'], connectorIds: ['github'] } };
    await act(async () => { await mocks.props!.onSend('Build this', attachments, [], meta); });
    expect(submit).toHaveBeenCalledWith({ prompt: 'Build this', attachments, comments: [], meta, existingProjectId: 'upload-chat' });
    expect(mocks.props!.projectId).toBeNull();
    mocks.create.mockResolvedValue({ project: { id: 'next-chat' } });
    await act(async () => { expect(await mocks.props!.onEnsureProject()).toBe('next-chat'); });
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it('retains the shared draft and upload owner after failed chat creation', async () => {
    mocks.create.mockResolvedValue({ project: { id: 'retained-chat' } });
    const submit = vi.fn(async (_turn: unknown) => false);
    setup({ onSubmit: submit });
    await act(async () => { await mocks.props!.onEnsureProject(); });
    let result: unknown;
    await act(async () => { result = await mocks.props!.onSend('Keep my brief', [{ path: 'draft.png', name: 'draft.png', kind: 'image' }], [], { skillIds: ['motion'] }); });
    expect(result).toBe('restore-draft');
    expect(mocks.props!.projectId).toBe('retained-chat');
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ existingProjectId: 'retained-chat', attachments: [{ path: 'draft.png', name: 'draft.png', kind: 'image' }], meta: { skillIds: ['motion'] } });
    expect(screen.getByRole('alert').textContent).toContain('Your message and attachments are still here');
    expect(mocks.props!.sendDisabled).toBe(false);
  });
  it('applies a new external handoff without resetting a draft on unrelated renders', async () => {
    const submit = async () => true;
    const view = setup({ onSubmit: submit });
    view.rerender(<I18nProvider initial="en"><WorkspaceHomeComposer {...base} onSubmit={submit} prompt="New handoff"/></I18nProvider>);
    await waitFor(() => expect(mocks.setDraft).toHaveBeenCalledWith('New handoff'));
    view.rerender(<I18nProvider initial="en"><WorkspaceHomeComposer {...base} onSubmit={submit} prompt="New handoff" busy/></I18nProvider>);
    expect(mocks.setDraft).toHaveBeenCalledTimes(1);
  });
  it('does not echo locally typed drafts through setDraft, but still applies external handoffs', () => {
    const submit = async () => true;
    const onPromptChange = vi.fn();
    const view = setup({ onSubmit: submit, onPromptChange });
    const localDraft = 'Refine @GitHub with /typography';
    act(() => { mocks.props!.onDraftChange?.(localDraft); });
    expect(onPromptChange).toHaveBeenCalledWith(localDraft);
    view.rerender(<I18nProvider initial="en"><WorkspaceHomeComposer {...base} onSubmit={submit} onPromptChange={onPromptChange} prompt={localDraft}/></I18nProvider>);
    expect(mocks.setDraft).not.toHaveBeenCalled();
    view.rerender(<I18nProvider initial="en"><WorkspaceHomeComposer {...base} onSubmit={submit} onPromptChange={onPromptChange} prompt="External brief"/></I18nProvider>);
    expect(mocks.setDraft).toHaveBeenCalledExactlyOnceWith('External brief');
  });
  it('ignores delayed echoes of earlier drafts instead of flashing between old and current text', () => {
    const submit = async () => true, onPromptChange = vi.fn();
    const view = setup({ onSubmit: submit, onPromptChange });
    act(() => { mocks.props!.onDraftChange?.('A'); mocks.props!.onDraftChange?.('A newer brief'); });
    view.rerender(<I18nProvider initial="en"><WorkspaceHomeComposer {...base} onSubmit={submit} onPromptChange={onPromptChange} prompt="A" busy/></I18nProvider>);
    view.rerender(<I18nProvider initial="en"><WorkspaceHomeComposer {...base} onSubmit={submit} onPromptChange={onPromptChange} prompt="A newer brief"/></I18nProvider>);
    expect(mocks.setDraft).not.toHaveBeenCalled();
    view.rerender(<I18nProvider initial="en"><WorkspaceHomeComposer {...base} onSubmit={submit} prompt="External handoff"/></I18nProvider>);
    expect(mocks.setDraft).toHaveBeenCalledExactlyOnceWith('External handoff');
  });
});
