// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceOrganization, WorkspaceOrganizationAction } from '@open-design/contracts';
import { emptyWorkspaceOrganization, useWorkspaceOrganization } from '../../src/state/workspace-organization';
const mock = vi.hoisted(() => ({ wordpress: true, rest: vi.fn(), runtime: vi.fn() }));
vi.mock('../../src/pixflow/license', () => ({ isPixflowWordPressEmbed: () => mock.wordpress, requestWordPressRest: mock.rest }));
vi.mock('../../src/pixflow/runtime-fetch', () => ({ pixflowRuntimeFetch: mock.runtime }));
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, body });
beforeEach(() => { mock.wordpress = true; mock.rest.mockReset(); mock.runtime.mockReset(); });

describe('workspace organization state', () => {
  it('keeps independent pending folder and section choices when an earlier save completes', async () => {
    const saved: WorkspaceOrganization = { ...emptyWorkspaceOrganization(), projects: [{ id: 'keep', name: 'Keep', pinned: false, collapsed: false }] };
    const folderSaved = { ...saved, revision: 1, projects: [{ ...saved.projects[0]!, collapsed: true }] };
    let finish!: (value: unknown) => void;
    let finishSection!: (value: unknown) => void;
    mock.rest.mockResolvedValueOnce(response(saved))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishSection = resolve; }));
    const { result } = renderHook(() => useWorkspaceOrganization());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let folder!: Promise<unknown>; let section!: Promise<unknown>;
    act(() => {
      folder = result.current.mutate({ type: 'collapse-project', id: 'keep', collapsed: true });
      section = result.current.mutate({ type: 'collapse-section', section: 'chats', collapsed: true });
    });
    expect(result.current.organization.projects[0]!.collapsed).toBe(true);
    expect(result.current.organization.collapsedSections?.chats).toBe(true);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await act(async () => { finish(response(folderSaved)); await folder; });
    expect(result.current.organization.collapsedSections?.chats).toBe(true);
    await act(async () => { finishSection(response({ ...folderSaved, revision: 2, collapsedSections: { chats: true } })); await section; });
    expect(result.current.organization.projects[0]!.collapsed).toBe(true);
    expect(result.current.organization.collapsedSections?.chats).toBe(true);
  });
  it.each(['project', 'pinned', 'projects', 'chats'] as const)('updates %s disclosures immediately and preserves confirmed state on failure', async (kind) => {
    const saved: WorkspaceOrganization = { ...emptyWorkspaceOrganization(), projects: [{ id: 'keep', name: 'Keep', pinned: true, collapsed: false }], chats: { kept: { projectId: 'keep', pinned: false } } };
    const action = (collapsed: boolean): WorkspaceOrganizationAction => kind === 'project'
      ? { type: 'collapse-project', id: 'keep', collapsed }
      : { type: 'collapse-section', section: kind, collapsed };
    const closed = (state: WorkspaceOrganization) => kind === 'project' ? state.projects[0]!.collapsed : state.collapsedSections?.[kind] === true;
    const confirmed: WorkspaceOrganization = kind === 'project'
      ? { ...saved, revision: 1, projects: [{ ...saved.projects[0]!, collapsed: true }] }
      : { ...saved, revision: 1, collapsedSections: { [kind]: true } };
    let finishFirst!: (value: unknown) => void; let finishSecond!: (value: unknown) => void;
    mock.rest.mockResolvedValueOnce(response(saved))
      .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
    const { result } = renderHook(() => useWorkspaceOrganization());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let first!: Promise<unknown>; let second!: Promise<unknown>;
    act(() => { first = result.current.mutate(action(true)); });
    expect(closed(result.current.organization)).toBe(true);
    act(() => { second = result.current.mutate(action(false)); });
    expect(closed(result.current.organization)).toBe(false);
    await waitFor(() => expect(finishFirst).toBeTypeOf('function'));
    await act(async () => { finishFirst(response(confirmed)); await first; });
    expect(closed(result.current.organization)).toBe(false);
    await act(async () => { finishSecond(response({ message: 'Save failed' }, 503)); await expect(second).rejects.toThrow('Save failed'); });
    expect(result.current.organization).toEqual(confirmed);
    expect(mock.rest.mock.calls[2]?.[1]?.body.revision).toBe(1);
  });
  it('rolls back a failed background save without losing chats or projects', async () => {
    const saved = { ...emptyWorkspaceOrganization(), revision: 3, projects: [{ id: 'keep', name: 'Keep', pinned: true, collapsed: false }], chats: { kept: { projectId: 'keep', pinned: false } } };
    let finish!: (value: unknown) => void;
    mock.rest.mockResolvedValueOnce(response(saved)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useWorkspaceOrganization());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let saving!: Promise<unknown>;
    act(() => { saving = result.current.mutate({ type: 'collapse-sidebar', collapsed: true }); });
    expect(result.current.organization.sidebarCollapsed).toBe(true);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await act(async () => { finish(response({ message: 'Save failed' }, 503)); await expect(saving).rejects.toThrow('Save failed'); });
    expect(result.current.organization).toEqual(saved);
    expect(result.current.error).toBe('Save failed');
  });
  it('responds immediately to rapid sidebar toggles without flashing earlier saves', async () => {
    let finishFirst!: (value: unknown) => void;
    let finishSecond!: (value: unknown) => void;
    mock.rest.mockResolvedValueOnce(response(emptyWorkspaceOrganization()))
      .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
    const { result } = renderHook(() => useWorkspaceOrganization());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let first!: Promise<unknown>; let second!: Promise<unknown>;
    act(() => { first = result.current.mutate({ type: 'collapse-sidebar', collapsed: true }); });
    expect(result.current.organization.sidebarCollapsed).toBe(true);
    act(() => { second = result.current.mutate({ type: 'collapse-sidebar', collapsed: false }); });
    expect(result.current.organization.sidebarCollapsed).toBe(false);
    await waitFor(() => expect(finishFirst).toBeTypeOf('function'));
    await act(async () => { finishFirst(response({ ...emptyWorkspaceOrganization(), revision: 1, sidebarCollapsed: true })); await first; });
    expect(result.current.organization.sidebarCollapsed).toBe(false);
    await act(async () => { finishSecond(response({ ...emptyWorkspaceOrganization(), revision: 2, sidebarCollapsed: false })); await second; });
    expect(result.current.organization.sidebarCollapsed).toBe(false);
    expect(mock.rest.mock.calls[2]?.[1]?.body.revision).toBe(1);
  });
  it('does not request data without Workspace access', async () => {
    const { result } = renderHook(() => useWorkspaceOrganization(false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refresh(); });
    expect(mock.rest).not.toHaveBeenCalled();
    await act(async () => { await expect(result.current.mutate({ type: 'collapse-sidebar', collapsed: true })).rejects.toThrow('unavailable'); });
    expect(mock.rest).not.toHaveBeenCalled();
  });
  it('loads existing state without migrating or replacing it', async () => {
    const existing = { ...emptyWorkspaceOrganization(), revision: 4, projects: [{ id: 'keep', name: 'Keep', pinned: true, collapsed: true }] };
    mock.rest.mockResolvedValue(response(existing));
    const { result } = renderHook(() => useWorkspaceOrganization());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.organization).toEqual(existing);
    expect(mock.rest).toHaveBeenCalledExactlyOnceWith('od/workspace-organization', { method: 'GET', body: undefined });
  });
  it('serializes mutations using the latest accepted revision', async () => {
    mock.rest.mockResolvedValueOnce(response(emptyWorkspaceOrganization()))
      .mockResolvedValueOnce(response({ ...emptyWorkspaceOrganization(), revision: 1, sidebarCollapsed: true }))
      .mockResolvedValueOnce(response({ ...emptyWorkspaceOrganization(), revision: 2, sidebarCollapsed: false }));
    const { result } = renderHook(() => useWorkspaceOrganization());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await Promise.all([result.current.mutate({ type: 'collapse-sidebar', collapsed: true }), result.current.mutate({ type: 'collapse-sidebar', collapsed: false })]);
    });
    expect(mock.rest.mock.calls[1]?.[1]?.body.revision).toBe(0);
    expect(mock.rest.mock.calls[2]?.[1]?.body.revision).toBe(1);
    expect(result.current.organization.revision).toBe(2);
  });
  it('refreshes a competing-tab revision and retries just the action', async () => {
    const anotherTab = { ...emptyWorkspaceOrganization(), revision: 2, projects: [{ id: 'other', name: 'Other tab', pinned: false, collapsed: false }] };
    mock.rest.mockResolvedValueOnce(response(emptyWorkspaceOrganization()))
      .mockResolvedValueOnce(response({ message: 'Conflict' }, 409))
      .mockResolvedValueOnce(response(anotherTab))
      .mockResolvedValueOnce(response({ ...anotherTab, revision: 3, sidebarCollapsed: true }));
    const { result } = renderHook(() => useWorkspaceOrganization());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.mutate({ type: 'collapse-sidebar', collapsed: true }); });
    expect(mock.rest.mock.calls[3]?.[1]?.body.revision).toBe(2);
    expect(result.current.organization.projects).toEqual(anotherTab.projects);
  });
  it('keeps saved state on denied writes and allows later retry', async () => {
    mock.rest.mockResolvedValueOnce(response(emptyWorkspaceOrganization())).mockResolvedValueOnce(response({ message: 'Forbidden' }, 403));
    const { result } = renderHook(() => useWorkspaceOrganization());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await expect(result.current.mutate({ type: 'collapse-sidebar', collapsed: true })).rejects.toThrow('Forbidden'); });
    expect(result.current.organization.sidebarCollapsed).toBe(false);
    mock.rest.mockResolvedValueOnce(response({ ...emptyWorkspaceOrganization(), revision: 1, sidebarCollapsed: true }));
    await act(async () => { await result.current.mutate({ type: 'collapse-sidebar', collapsed: true }); });
    expect(result.current.organization.sidebarCollapsed).toBe(true);
    expect(result.current.error).toBeNull();
  });
  it('handles unavailable or non-JSON runtime without endless loading', async () => {
    mock.wordpress = false;
    mock.runtime.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError('HTML'); } });
    const { result } = renderHook(() => useWorkspaceOrganization());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Could not load workspace organization.');
    expect(result.current.organization).toEqual(emptyWorkspaceOrganization());
  });
});
