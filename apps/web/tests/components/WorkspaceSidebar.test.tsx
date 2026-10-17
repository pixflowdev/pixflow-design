// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceOrganization } from '@open-design/contracts';
import { WorkspaceSidebar, type WorkspaceSidebarProps } from '../../src/components/WorkspaceSidebar';
import type { Project } from '../../src/types';

vi.mock('../../src/i18n', async () => {
  const actual = await vi.importActual<typeof import('../../src/i18n')>('../../src/i18n');
  return { ...actual, useT: () => (key: Parameters<typeof actual.translateLocale>[1], values?: Parameters<typeof actual.translateLocale>[2]) => actual.translateLocale('en', key, values) };
});
vi.mock('../../src/components/PixflowBrandMark', () => ({ PixflowBrandMark: () => <span aria-hidden="true" /> }));

const chats: Project[] = [
  { id: 'chat-a', name: 'Bakery homepage', createdAt: 1, updatedAt: 10, skillId: null, designSystemId: null },
  { id: 'chat-b', name: 'Bakery contact', createdAt: 2, updatedAt: 20, skillId: null, designSystemId: null },
  { id: 'chat-c', name: 'Florist landing', createdAt: 3, updatedAt: 30, skillId: null, designSystemId: null },
];
const initial = (): WorkspaceOrganization => ({
  revision: 1, sidebarCollapsed: false,
  projects: [{ id: 'bakery', name: 'Bakery', pinned: false, collapsed: false }],
  chats: { 'chat-a': { projectId: 'bakery', pinned: false } },
});
function setup(overrides: Partial<WorkspaceSidebarProps> = {}) {
  const props: WorkspaceSidebarProps = {
    chats, activeChatId: 'chat-a', organization: initial(), loading: false, error: null,
    onRetry: vi.fn().mockResolvedValue(undefined), onMutate: vi.fn().mockResolvedValue(undefined),
    onOpenChat: vi.fn(), onRenameChat: vi.fn().mockResolvedValue(undefined), onNewChat: vi.fn(),
    onNavigate: vi.fn(), onSettings: vi.fn(), children: <main>Active chat content</main>, ...overrides,
  };
  const result = render(<WorkspaceSidebar {...props} />);
  return { ...result, props, update: (patch: Partial<WorkspaceSidebarProps>) => { Object.assign(props, patch); result.rerender(<WorkspaceSidebar {...props} />); } };
}
function menu(kind: 'chat' | 'project', name: string) {
  fireEvent.click(screen.getByRole('button', { name: `${kind === 'chat' ? 'Chat' : 'Project'} actions: ${name}` }));
  return screen.getByRole('menu');
}

function startPointerDrag(chat: Element, group: Element) {
  vi.stubGlobal('PointerEvent', MouseEvent);
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => group });
  const button = chat.querySelector('button')!;
  fireEvent.pointerDown(button, { button: 0, clientX: 20, clientY: 200 });
  fireEvent.pointerMove(button, { clientX: 25, clientY: 80 });
  return button;
}

describe('WorkspaceSidebar organization and content preservation', () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
  });
  afterEach(() => {
    cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    if (originalElementFromPoint) Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
    else Reflect.deleteProperty(document, 'elementFromPoint');
    for (const [name, descriptor] of [['showModal', originalShowModal], ['close', originalClose]] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
  });

  it('shows existing chats under their group or Chats with the active chat marked and usable', () => {
    const { props } = setup();
    const projectSection = screen.getByRole('region', { name: 'Projects' });
    expect(within(projectSection).getByRole('button', { name: 'Bakery homepage' }).getAttribute('aria-current')).toBe('page');
    expect(within(screen.getByRole('region', { name: 'Chats' })).getByRole('button', { name: 'Florist landing' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bakery homepage' }));
    expect(props.onOpenChat).toHaveBeenCalledWith('chat-a');
    expect(screen.getByText('Active chat content')).toBeTruthy();
  });

  it('keeps the sidebar toggle usable while its preference is saving', () => {
    const { props, update } = setup({ onMutate: vi.fn(() => new Promise(() => {})) });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    update({ organization: { ...initial(), sidebarCollapsed: true } });
    const expand = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(expand.hasAttribute('disabled')).toBe(false);
    fireEvent.click(expand);
    expect(props.onMutate).toHaveBeenLastCalledWith({ type: 'collapse-sidebar', collapsed: false });
    expect(screen.getByText('Active chat content')).toBeTruthy();
  });

  it('keeps project and section toggles independent while preferences are saving', () => {
    const { props, update } = setup({ onMutate: vi.fn(() => new Promise(() => {})) });
    fireEvent.click(screen.getByRole('button', { name: 'Bakery' }));
    const organization = initial(); organization.projects[0]!.collapsed = true;
    update({ organization });
    for (const label of ['Bakery', 'Pinned', 'Projects', 'Chats']) {
      const button = screen.getByRole('button', { name: label });
      expect(button.hasAttribute('disabled')).toBe(false);
      fireEvent.click(button);
    }
    expect(props.onMutate).toHaveBeenCalledWith({ type: 'collapse-project', id: 'bakery', collapsed: false });
    expect(props.onMutate).toHaveBeenCalledWith({ type: 'collapse-section', section: 'chats', collapsed: true });
  });

  it('renders pinned chats and projects once without duplicating group members', () => {
    const organization = initial(); organization.projects[0]!.pinned = true; organization.chats['chat-a']!.pinned = true;
    setup({ organization });
    const pinned = screen.getByRole('region', { name: 'Pinned' });
    expect(within(pinned).getByRole('button', { name: 'Bakery' })).toBeTruthy();
    expect(within(pinned).getByRole('button', { name: 'Bakery homepage' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Bakery homepage' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Bakery' })).toHaveLength(1);
  });

  it('pins and unpins a chat without changing its project membership', async () => {
    const { props, update } = setup();
    fireEvent.click(within(menu('chat', 'Bakery homepage')).getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenCalledWith({ type: 'pin-chat', chatId: 'chat-a', pinned: true }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    const organization = initial(); organization.chats['chat-a']!.pinned = true; update({ organization });
    fireEvent.click(within(menu('chat', 'Bakery homepage')).getByRole('menuitem', { name: 'Unpin' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenLastCalledWith({ type: 'pin-chat', chatId: 'chat-a', pinned: false }));
  });

  it('pins a project independently from its member chats', async () => {
    const { props, update } = setup();
    fireEvent.click(within(menu('project', 'Bakery')).getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenCalledWith({ type: 'pin-project', id: 'bakery', pinned: true }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    const organization = initial(); organization.projects[0]!.pinned = true; update({ organization });
    expect(within(screen.getByRole('region', { name: 'Pinned' })).getByRole('button', { name: 'Bakery homepage' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Bakery homepage' })).toHaveLength(1);
    fireEvent.click(within(menu('project', 'Bakery')).getByRole('menuitem', { name: 'Unpin' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenLastCalledWith({ type: 'pin-project', id: 'bakery', pinned: false }));
  });

  it('moves a chat into and out of projects without renaming it or changing its route ID', async () => {
    const { props } = setup();
    fireEvent.click(within(menu('chat', 'Florist landing')).getByRole('menuitem', { name: 'Move to project' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bakery' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenCalledWith({ type: 'move-chat', chatId: 'chat-c', projectId: 'bakery' }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    fireEvent.click(within(menu('chat', 'Bakery homepage')).getByRole('menuitem', { name: 'Move to project' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'No project' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenLastCalledWith({ type: 'move-chat', chatId: 'chat-a', projectId: null }));
    expect(props.onRenameChat).not.toHaveBeenCalled();
  });

  it('frames a project while dragging, then moves only chat membership', async () => {
    const { props } = setup();
    const chat = screen.getByRole('button', { name: 'Florist landing' }).closest('[data-chat-id]')!;
    const group = screen.getByRole('button', { name: 'Bakery' }).closest('[data-project-id]')!;
    const button = startPointerDrag(chat, group);
    expect(group.getAttribute('data-drop-target')).toBe('true');
    fireEvent.pointerUp(button, { clientX: 25, clientY: 80 });
    await waitFor(() => expect(props.onMutate).toHaveBeenCalledWith({ type: 'move-chat', chatId: 'chat-c', projectId: 'bakery' }));
    expect(group.getAttribute('data-drop-target')).toBe('false');
    expect(props.onRenameChat).not.toHaveBeenCalled();
    expect(props.chats).toEqual(chats);
  });

  it('ignores outside drags and a drop into the chat’s current project', () => {
    const { props } = setup();
    const group = screen.getByRole('button', { name: 'Bakery' }).closest('[data-project-id]')!;
    fireEvent.drop(group, { dataTransfer: { getData: () => 'chat-c' } });
    const chat = screen.getByRole('button', { name: 'Bakery homepage' }).closest('[data-chat-id]')!;
    const button = startPointerDrag(chat, group);
    fireEvent.pointerUp(button, { clientX: 25, clientY: 80 });
    expect(props.onMutate).not.toHaveBeenCalled();
  });

  it('clears the drop frame on Escape without changing a chat', () => {
    const { props } = setup();
    const chat = screen.getByRole('button', { name: 'Florist landing' }).closest('[data-chat-id]')!;
    const group = screen.getByRole('button', { name: 'Bakery' }).closest('[data-project-id]')!;
    const button = startPointerDrag(chat, group);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(group.getAttribute('data-drop-target')).toBe('false');
    fireEvent.pointerUp(button, { clientX: 25, clientY: 80 });
    expect(props.onMutate).not.toHaveBeenCalled();
  });

  it('supports pointer dragging with a destination frame and no accidental chat navigation', async () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const { props } = setup();
    const button = screen.getByRole('button', { name: 'Florist landing' });
    const group = screen.getByRole('button', { name: 'Bakery' }).closest('[data-project-id]')!;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => group) });
    fireEvent.pointerDown(button, { button: 0, clientX: 20, clientY: 200 });
    fireEvent.pointerMove(button, { clientX: 25, clientY: 80 });
    expect(group.getAttribute('data-drop-target')).toBe('true');
    fireEvent.pointerUp(button, { clientX: 25, clientY: 80 });
    fireEvent.click(button);
    await waitFor(() => expect(props.onMutate).toHaveBeenCalledExactlyOnceWith({ type: 'move-chat', chatId: 'chat-c', projectId: 'bakery' }));
    expect(props.onOpenChat).not.toHaveBeenCalled();
    expect(group.getAttribute('data-drop-target')).toBe('false');
  });

  it('preserves membership and reports a failed drag save without leaving the frame stuck', async () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const { props } = setup({ onMutate: vi.fn().mockRejectedValue(new Error('offline')) });
    const button = screen.getByRole('button', { name: 'Florist landing' });
    const group = screen.getByRole('button', { name: 'Bakery' }).closest('[data-project-id]')!;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => group });
    fireEvent.pointerDown(button, { button: 0, clientX: 20, clientY: 200 });
    fireEvent.pointerMove(button, { clientX: 25, clientY: 80 });
    fireEvent.pointerUp(button, { clientX: 25, clientY: 80 });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(group.getAttribute('data-drop-target')).toBe('false');
    expect(props.organization.chats['chat-c']).toBeUndefined();
    expect(props.chats).toEqual(chats);
  });

  it('creates a named project and rejects an empty name', async () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Project name' }), { target: { value: '  Spring launch  ' } });
    fireEvent.click(save);
    await waitFor(() => expect(props.onMutate).toHaveBeenCalledWith({ type: 'create-project', id: expect.any(String), name: 'Spring launch' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('removes only grouping metadata after a confirmation that chats and files are kept', async () => {
    const { props, update } = setup();
    fireEvent.click(within(menu('project', 'Bakery')).getByRole('menuitem', { name: 'Remove project' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove project' });
    expect(within(dialog).getByText('Chats and files will be kept.')).toBeTruthy();
    expect(props.onMutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove project' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenCalledWith({ type: 'delete-project', id: 'bakery' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    update({ organization: { ...initial(), projects: [], chats: { 'chat-a': { projectId: null, pinned: false } } } });
    expect(within(screen.getByRole('region', { name: 'Chats' })).getByRole('button', { name: 'Bakery homepage' })).toBeTruthy();
    expect(props.chats).toEqual(chats);
    expect(screen.getByText('Active chat content')).toBeTruthy();
  });

  it('renames chats through the existing chat callback and projects through organization metadata', async () => {
    const { props } = setup();
    fireEvent.click(within(menu('chat', 'Bakery contact')).getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Chat name' }), { target: { value: 'Contact redesign' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(props.onRenameChat).toHaveBeenCalledWith('chat-b', 'Contact redesign'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(within(menu('project', 'Bakery')).getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Project name' }), { target: { value: 'Bakery launch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenCalledWith({ type: 'rename-project', id: 'bakery', name: 'Bakery launch' }));
  });

  it('collapses a project and a section independently and removes hidden rows from navigation', async () => {
    const { props, update } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Bakery' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenCalledWith({ type: 'collapse-project', id: 'bakery', collapsed: true }));
    const organization = initial(); organization.projects[0]!.collapsed = true; update({ organization });
    expect(screen.queryByRole('button', { name: 'Bakery homepage' })).toBeNull();
    const hidden = document.querySelector('[data-chat-id="chat-a"]')!;
    expect(hidden.closest('[inert]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chats' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenLastCalledWith({ type: 'collapse-section', section: 'chats', collapsed: true }));
    update({ organization: { ...organization, collapsedSections: { chats: true } } });
    expect(screen.queryByRole('button', { name: 'Florist landing' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bakery' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps current content and primary actions available when the whole sidebar collapses', async () => {
    const { props, update } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    await waitFor(() => expect(props.onMutate).toHaveBeenCalledWith({ type: 'collapse-sidebar', collapsed: true }));
    update({ organization: { ...initial(), sidebarCollapsed: true } });
    expect(screen.queryByRole('textbox', { name: 'Search chats' })).toBeNull();
    expect(screen.getByText('Active chat content')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(props.onNewChat).toHaveBeenCalledWith(null);
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
  });

  it('searches all chats including collapsed groups without duplicates and retains the query on mutation failure', async () => {
    const organization = initial(); organization.projects[0]!.collapsed = true;
    const onMutate = vi.fn().mockRejectedValue(new Error('offline'));
    setup({ organization, onMutate });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search chats' }), { target: { value: '  BAKERY  ' } });
    expect(screen.getAllByRole('button', { name: 'Bakery homepage' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Florist landing' })).toBeNull();
    fireEvent.click(within(menu('chat', 'Bakery homepage')).getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not save your changes'));
    expect((screen.getByRole('textbox', { name: 'Search chats' }) as HTMLInputElement).value).toBe('  BAKERY  ');
    expect(screen.getByRole('menuitem', { name: 'Pin' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bakery homepage' })).toBeTruthy();
  });

  it('keeps entered project names available after failed saving and allows retry', async () => {
    const onMutate = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    setup({ onMutate });
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Project name' }), { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByRole('textbox', { name: 'Project name' }) as HTMLInputElement).value).toBe('Keep this draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onMutate).toHaveBeenCalledTimes(2);
  });

  it('opens a new chat with the selected project context and restores focus when a menu is dismissed', () => {
    const { props } = setup();
    fireEvent.click(within(menu('project', 'Bakery')).getByRole('menuitem', { name: 'New chat in Bakery' }));
    expect(props.onNewChat).toHaveBeenCalledWith('bakery');
    const actions = screen.getByRole('button', { name: 'Chat actions: Bakery contact' });
    fireEvent.click(actions);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(actions);
  });

  it('focuses the first destination when opening Move to project for keyboard navigation', () => {
    setup();
    fireEvent.click(within(menu('chat', 'Bakery contact')).getByRole('menuitem', { name: 'Move to project' }));
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'No project' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Bakery' }));
  });

  it('reports initial load failures accurately and retries without clearing current chats', async () => {
    const { props } = setup({ error: 'A server error' });
    expect(screen.getByRole('alert').textContent).toContain('Could not load your sidebar. Try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(props.onRetry).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Bakery homepage' })).toBeTruthy();
  });

  it('keeps the page navigation rail outside the collapsible chat panel in both states', () => {
    const { props, update } = setup();
    const rail = screen.getByRole('navigation', { name: 'Workspace' });
    const panel = screen.getByRole('complementary', { name: 'Chats' });
    expect(panel.contains(rail)).toBe(false);
    for (const collapsed of [false, true, false]) {
      update({ organization: { ...initial(), sidebarCollapsed: collapsed } });
      expect(screen.getByRole('navigation', { name: 'Workspace' })).toBe(rail);
      expect(panel.hasAttribute('inert')).toBe(collapsed);
      for (const [label, view] of [['Home', 'home'], ['Media', 'media'], ['Sitemap', 'sitemap'], ['Design systems', 'design-systems']] as const) {
        const button = within(rail).getByRole('button', { name: label });
        expect(button.closest('[inert], [aria-hidden="true"]')).toBeNull();
        fireEvent.click(button);
        expect(props.onNavigate).toHaveBeenLastCalledWith(view);
      }
      fireEvent.click(within(rail).getByRole('button', { name: 'New chat' }));
      expect(props.onNewChat).toHaveBeenLastCalledWith(null);
      fireEvent.click(within(rail).getByRole('button', { name: 'Open settings' }));
    }
    expect(props.onSettings).toHaveBeenCalledTimes(3);
  });

  it('keeps collapse and close in the top toolbar without duplicating Home or chat tabs', () => {
    const onClose = vi.fn();
    setup({ onClose, connectionControl: <span role="status">Bridge connected</span> });
    const toolbar = screen.getByRole('banner');
    const rail = screen.getByRole('navigation', { name: 'Workspace' });
    expect(within(toolbar).getByRole('button', { name: 'Collapse sidebar' })).toBeTruthy();
    expect(within(rail).queryByRole('button', { name: 'Collapse sidebar' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Home$/ })).toHaveLength(1);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(within(toolbar).getByRole('status').textContent).toBe('Bridge connected');
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Close workspace' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('preserves the mounted chat and its unsent draft while collapsing and expanding the chat panel', () => {
    const mounted = vi.fn();
    const unmounted = vi.fn();
    function ActiveChat() {
      const [draft, setDraft] = useState('');
      useEffect(() => { mounted(); return unmounted; }, []);
      return <textarea aria-label="Unsent chat draft" value={draft} onChange={event => setDraft(event.target.value)} />;
    }
    const { update } = setup({ children: <ActiveChat /> });
    const input = screen.getByRole('textbox', { name: 'Unsent chat draft' });
    fireEvent.change(input, { target: { value: 'Keep this unsent message' } });
    update({ organization: { ...initial(), sidebarCollapsed: true } });
    expect(screen.getByRole('textbox', { name: 'Unsent chat draft' })).toBe(input);
    update({ organization: { ...initial(), sidebarCollapsed: false } });
    expect((screen.getByRole('textbox', { name: 'Unsent chat draft' }) as HTMLTextAreaElement).value).toBe('Keep this unsent message');
    expect(mounted).toHaveBeenCalledOnce();
    expect(unmounted).not.toHaveBeenCalled();
  });

  it('hides only metadata-marked internal projects, including from pins and search, and keeps same-named user chats', () => {
    const internalName = 'Direct attachments';
    const allChats: Project[] = [
      ...chats,
      { ...chats[0]!, id: 'internal-purpose', name: internalName, metadata: { kind: 'other', purpose: 'direct-attachments' } as Project['metadata'] },
      { ...chats[0]!, id: 'internal-flag', name: 'Attachment cache', metadata: { kind: 'other', pixflowInternalProject: true } },
      { ...chats[0]!, id: 'real-chat', name: internalName },
    ];
    const organization = initial();
    organization.chats['internal-purpose'] = { projectId: null, pinned: true };
    organization.chats['internal-flag'] = { projectId: 'bakery', pinned: false };
    setup({ chats: allChats, organization });
    expect(document.querySelector('[data-chat-id="internal-purpose"]')).toBeNull();
    expect(document.querySelector('[data-chat-id="internal-flag"]')).toBeNull();
    expect(screen.getAllByRole('button', { name: internalName })).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search chats' }), { target: { value: 'attachments' } });
    expect(screen.getAllByRole('button', { name: internalName })).toHaveLength(1);
    expect(document.querySelector('[data-chat-id="real-chat"]')).not.toBeNull();
    expect(document.querySelector('[data-chat-id="internal-purpose"]')).toBeNull();
    expect(allChats).toHaveLength(6);
  });

  it('renders project and chat names as text instead of executable markup', () => {
    const name = '<img src=x onerror="window.compromised=true">';
    const organization = initial(); organization.projects[0]!.name = name;
    const { container } = setup({ organization, chats: [{ ...chats[0]!, name }] });
    expect(screen.getAllByRole('button', { name })).toHaveLength(2);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
  });
});
