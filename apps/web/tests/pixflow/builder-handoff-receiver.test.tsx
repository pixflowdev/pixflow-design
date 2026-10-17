// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PixflowBuilderHandoff, PixflowEditorTarget } from '@open-design/contracts';
import { persistPixflowWordPressConfig } from '../../src/pixflow/wordpress-context';
import { assertBuilderHandoffTarget, builderHandoffAddress, builderHandoffDocumentAddress, builderHandoffPersistenceSurface, builderHandoffConversationKey, builderHandoffAttachments, receiveBuilderHandoff, useBuilderHandoffReceiver } from '../../src/pixflow/builder-handoff-receiver';
const { mutate, read } = vi.hoisted(() => ({ mutate: vi.fn(), read: vi.fn() }));
vi.mock('../../src/pixflow/builder-handoff-client', () => ({ mutateBuilderHandoff: mutate, readBuilderHandoff: read }));
const address = { id: 'a'.repeat(64), tabId: 'tab-1234567890123456' };
const target: PixflowEditorTarget = { builder: 'gutenberg', canvasId: 'canvas-1', postId: 42 };
const receipt = { ...address, targetTabId: address.tabId, status: 'claimed', messageId: 'handoff-message', brief: 'Build the page', editorTarget: target, destination: { builder: 'gutenberg', postId: 42 }, assets: [{ projectId: 'project-a', path: 'hero.png', name: 'Hero', mime: 'image/png' }] } as unknown as PixflowBuilderHandoff;
beforeEach(() => { read.mockReset().mockResolvedValue({ ...receipt, status: 'ready' }); mutate.mockReset(); sessionStorage.clear(); window.name = ''; window.history.replaceState({}, '', '/'); });
afterEach(() => vi.useRealTimers());
it.each(['bricks', 'etch', 'elementor'] as const)('retries late %s connection only before claim and ignores duplicate events', async builder => {
  vi.useFakeTimers();
  window.history.replaceState({}, '', `/?post_id=42&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  const editor = { ...target, builder };
  const handoff = { ...receipt, destination: { ...receipt.destination, builder }, editorTarget: editor };
  read.mockResolvedValue({ ...handoff, status: 'ready' });
  const getTarget = vi.fn<() => Promise<PixflowEditorTarget | undefined>>().mockResolvedValue(undefined);
  const start = vi.fn(() => true), notice = vi.fn();
  mutate.mockResolvedValue({ handoff, shouldStart: true });
  const view = renderHook(() => useBuilderHandoffReceiver({ builder, enabled: true, busy: false, target: getTarget, start, notice }));
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(notice).toHaveBeenCalledWith(expect.stringContaining('did not connect'));
  expect(notice).toHaveBeenCalledWith(expect.stringContaining('continue automatically when this tab connects'));
  expect(mutate).not.toHaveBeenCalled();
  getTarget.mockResolvedValue(editor);
  await act(async () => {
    window.dispatchEvent(new CustomEvent(`pixflow-design:${builder}-connection`, { detail: { connected: false } }));
  });
  expect(mutate).not.toHaveBeenCalled();
  await act(async () => {
    for (let i = 0; i < 10; i++) window.dispatchEvent(new CustomEvent(`pixflow-design:${builder}-connection`, { detail: { connected: true } }));
  });
  expect(start).toHaveBeenCalledTimes(1);
  expect(mutate.mock.calls.filter(call => call[0].action === 'claim')).toHaveLength(1);
  await act(async () => {
    window.dispatchEvent(new CustomEvent(`pixflow-design:${builder}-connection`, { detail: { connected: true } }));
  });
  expect(start).toHaveBeenCalledTimes(1);
  view.unmount();
});
it.each(['claim-error', 'start-error'] as const)('never retries a handoff after %s even when the editor reconnects', async failure => {
  window.history.replaceState({}, '', `/?post_id=42&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  const editor = { ...target, builder: 'etch' as const };
  const handoff = { ...receipt, destination: { ...receipt.destination, builder: 'etch' as const }, editorTarget: editor };
  read.mockResolvedValue({ ...handoff, status: 'ready' });
  if (failure === 'claim-error') mutate.mockRejectedValue(new Error('Uncertain claim'));
  else mutate.mockResolvedValue({ handoff, shouldStart: true });
  const start = vi.fn(async () => { throw new Error('Start failed'); }), notice = vi.fn();
  const view = renderHook(() => useBuilderHandoffReceiver({ builder: 'etch', enabled: true, busy: false, target: async () => editor, start, notice }));
  await waitFor(() => expect(notice).toHaveBeenCalledTimes(1));
  await act(async () => {
    for (let i = 0; i < 5; i++) window.dispatchEvent(new CustomEvent('pixflow-design:etch-connection', { detail: { connected: true } }));
  });
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(failure === 'claim-error' ? 0 : 1);
  view.unmount();
});
it('does not resume a timed-out handoff after navigation to another page', async () => {
  vi.useFakeTimers();
  read.mockResolvedValue({ ...receipt, status: 'ready', destination: { ...receipt.destination, builder: 'etch' } });
  const query = `pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`;
  window.history.replaceState({}, '', `/?post_id=42&${query}`);
  const getTarget = vi.fn<() => Promise<PixflowEditorTarget | undefined>>().mockResolvedValue(undefined);
  const start = vi.fn(() => true), notice = vi.fn();
  const view = renderHook(() => useBuilderHandoffReceiver({ builder: 'etch', enabled: true, busy: false, target: getTarget, start, notice }));
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  getTarget.mockResolvedValue({ ...target, builder: 'etch', postId: 43 });
  window.history.replaceState({}, '', `/?post_id=43&${query}`);
  await act(async () => { window.dispatchEvent(new CustomEvent('pixflow-design:etch-connection', { detail: { connected: true } })); });
  expect(mutate).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  view.unmount();
});
it.each(['etch', 'elementor'] as const)('isolates %s handoff transcripts while retaining reload recovery and ordinary history', builder => {
  const base = 'pixflow-direct:site-a:user-1';
  const surface = `admin-handoff:${address.id}:${address.tabId}`;
  const key = builderHandoffConversationKey(base, surface, builder);
  expect(key).not.toBe(base);
  expect(builderHandoffConversationKey(base, surface, builder)).toBe(key);
  expect(builderHandoffConversationKey(base, `admin-handoff:${'b'.repeat(64)}:${address.tabId}`, builder)).not.toBe(key);
  expect(builderHandoffConversationKey(base, `admin-handoff:${address.id}:tab-another1234567`, builder)).not.toBe(key);
  expect(builderHandoffConversationKey('pixflow-direct:site-b:user-1', surface, builder)).not.toBe(key);
  expect(builderHandoffConversationKey('pixflow-direct:site-a:user-2', surface, builder)).not.toBe(key);
  expect(builderHandoffConversationKey(base, 'admin', builder)).toBe(base);
});
it.each(['gutenberg', 'bricks'] as const)('preserves existing %s conversation recovery keys', builder => {
  const base = 'pixflow-direct:site-a:user-1';
  expect(builderHandoffConversationKey(base, `admin-handoff:${address.id}:${address.tabId}`, builder)).toBe(base);
  expect(builderHandoffConversationKey(base, `bricks-handoff:${address.id}:${address.tabId}`, builder)).toBe(base);
});
it.each(['admin', 'bricks', 'admin-handoff:invalid:tab-1234567890123456', `admin-handoff:${'a'.repeat(64)}:short`])('does not scope ordinary or malformed launch surfaces: %s', surface => {
  expect(builderHandoffConversationKey('normal-key', surface, 'etch')).toBe('normal-key');
  expect(builderHandoffConversationKey('normal-key', surface, 'elementor')).toBe('normal-key');
});
it('never persists a document launch identity with reusable WordPress configuration', () => {
  persistPixflowWordPressConfig({restBaseUrl:'https://site.test/wp-json/pixflow-design/v1',builderHandoff:{...address,postId:42}});
  const saved = JSON.parse(sessionStorage.getItem('pixflow:wordpress-config:v1')!);
  expect(saved.restBaseUrl).toContain('site.test');
  expect(saved).not.toHaveProperty('builderHandoff');
});
it('retains only the server launch identity for the current Gutenberg document after URL cleanup', () => {
  const source = { location: { href: 'https://site.test/wp-admin/post.php?post=42&action=edit' }, pixflowDesignWpAdmin: { builderHandoff: { ...address, postId: 42 } } } as unknown as Window;
  expect(builderHandoffDocumentAddress(source)).toEqual(address);
  source.location.href = 'https://site.test/wp-admin/post.php?post=43&action=edit';
  expect(builderHandoffDocumentAddress(source)).toBeNull();
  expect(builderHandoffDocumentAddress({ location: source.location } as Window)).toBeNull();
});
it('claims the actual canvas before starting and records acceptance/completion', async () => {
  mutate.mockResolvedValue({ handoff: receipt, shouldStart: true });
  const start = vi.fn(async execution => { await execution.accepted(); await execution.finished(); return true; });
  await receiveBuilderHandoff(address, target, start);
  expect(mutate.mock.calls.map(call => call[0])).toEqual([
    { action: 'claim', ...address, editorTarget: target },
    { action: 'ack', ...address, messageId: receipt.messageId },
    { action: 'finish', ...address, messageId: receipt.messageId, outcome: 'completed' },
  ]);
  expect(start).toHaveBeenCalledTimes(1);
});
it.each(['claimed', 'accepted'])('never repeats a %s receipt after reload or lost acknowledgement', async status => {
  mutate.mockResolvedValue({ handoff: { ...receipt, status }, shouldStart: false });
  const start = vi.fn();
  await expect(receiveBuilderHandoff(address, target, start)).rejects.toThrow('not repeated');
  expect(start).not.toHaveBeenCalled();
});
it('does not submit if claim delivery is uncertain', async () => {
  mutate.mockRejectedValue(new Error('Network interrupted'));
  const start = vi.fn();
  await expect(receiveBuilderHandoff(address, target, start)).rejects.toThrow('Network interrupted');
  expect(start).not.toHaveBeenCalled(); expect(mutate).toHaveBeenCalledTimes(1);
});
it('reports busy admission without discarding or repeating the receipt', async () => {
  mutate.mockResolvedValue({ handoff: receipt, shouldStart: true });
  await expect(receiveBuilderHandoff(address, target, () => false)).rejects.toThrow('not started');
  expect(mutate.mock.calls[1]?.[0]).toMatchObject({ action: 'finish', outcome: 'failed' });
});
it('rejects another page and a canvas change before agent start', async () => {
  mutate.mockResolvedValue({ handoff: receipt, shouldStart: true });
  const start = vi.fn();
  await expect(receiveBuilderHandoff(address, { ...target, postId: 43 }, start)).rejects.toThrow('another editor');
  expect(start).not.toHaveBeenCalled();
  expect(() => assertBuilderHandoffTarget({ receipt, accepted: vi.fn(), finished: vi.fn() }, { ...target, canvasId: 'other-tab' })).toThrow('changed');
});
it('preserves source asset identity and treats URL text only as a validated receipt address', () => {
  expect(builderHandoffAttachments(receipt)).toEqual([{ projectId: 'project-a', path: 'hero.png', name: 'Hero', kind: 'image' }]);
  expect(builderHandoffAddress(`https://site.test/?pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}&prompt=ignore`)).toEqual(address);
  expect(builderHandoffAddress('https://site.test/?pixflow_handoff=bad&pixflow_handoff_tab=bad')).toBeNull();
});
it('waits for an idle editor and never repeats after rerender', async () => {
  window.history.replaceState({}, '', `/?post=42&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  mutate.mockResolvedValue({ handoff: receipt, shouldStart: true });
  const start = vi.fn(() => true), notice = vi.fn(), getTarget = vi.fn(async () => target);
  const view = renderHook(({ busy }) => useBuilderHandoffReceiver({ builder: 'gutenberg', enabled: true, busy, target: getTarget, start, notice }), { initialProps: { busy: true } });
  expect(mutate).not.toHaveBeenCalled();
  view.rerender({ busy: false });
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  act(() => view.rerender({ busy: true })); act(() => view.rerender({ busy: false }));
  expect(start).toHaveBeenCalledTimes(1); expect(notice).not.toHaveBeenCalled();
});

it('does not abort admitted work when acknowledgement bookkeeping fails', async () => {
  mutate.mockResolvedValueOnce({handoff:receipt,shouldStart:true}).mockRejectedValueOnce(new Error('Lost acknowledgement')).mockResolvedValueOnce({handoff:receipt});
  const notice=vi.fn(), completed=vi.fn();
  await receiveBuilderHandoff(address,target,async execution=>{await execution.accepted();completed();await execution.finished();return true;},notice);
  expect(completed).toHaveBeenCalledTimes(1);expect(notice).toHaveBeenCalledWith(expect.stringContaining('continuing'));
});

it('records a question as awaiting input, never as a completed build', async () => {
  mutate.mockResolvedValue({handoff:receipt,shouldStart:true});
  await receiveBuilderHandoff(address,target,async execution=>{await execution.accepted();await execution.finished(undefined,true);return true;});
  expect(mutate.mock.calls.at(-1)?.[0]).toMatchObject({action:'finish',outcome:'awaiting_input'});
});

it('preserves a successful response when completion bookkeeping is unavailable', async () => {
  mutate.mockResolvedValueOnce({handoff:receipt,shouldStart:true}).mockRejectedValueOnce(new Error('Status unavailable'));
  const notice=vi.fn();
  await expect(receiveBuilderHandoff(address,target,async execution=>{await execution.finished();return true;},notice)).resolves.toBeUndefined();
  expect(notice).toHaveBeenCalledWith(expect.stringContaining('response is preserved'));
});
it('does not dispatch if its panel unmounts while the claim response is pending', async () => {
  window.history.replaceState({}, '', `/?post=42&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  let respond!: (value: unknown) => void;
  mutate.mockImplementationOnce(()=>new Promise(resolve=>{respond=resolve;})).mockResolvedValue({handoff:receipt});
  const start=vi.fn(()=>true),notice=vi.fn();
  const view=renderHook(()=>useBuilderHandoffReceiver({builder:'gutenberg',enabled:true,busy:false,target:async()=>target,start,notice}));
  await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async()=>{respond({handoff:receipt,shouldStart:true});});
  expect(start).not.toHaveBeenCalled();
  expect(mutate.mock.calls.at(-1)?.[0]).toMatchObject({action:'finish',outcome:'failed'});
});

it.each(['completed','failed','awaiting_input','cancelled'])('shows terminal %s receipts without dispatching on reload', async status => {
  mutate.mockResolvedValue({handoff:{...receipt,status},shouldStart:false});
  const start=vi.fn(),notice=vi.fn();
  await expect(receiveBuilderHandoff(address,{...target,canvasId:'newly-opened-tab'},start,notice)).resolves.toBeUndefined();
  expect(start).not.toHaveBeenCalled();
  if(status==='awaiting_input')expect(notice).toHaveBeenCalledWith(expect.stringContaining('waiting for your answer'));
});

it.each(['gutenberg', 'bricks'] as const)('isolates %s handoffs from inherited checkpoints and retains identity through clean-URL reload', builder => {
  const base = builder === 'gutenberg' ? '/wp-admin/post.php?post=42&action=edit' : '/?page_id=42&bricks=run';
  window.history.replaceState({ existingNavigation: 'keep' }, '', `${base}&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  window.name = `pixflow-build-${address.tabId}`;
  sessionStorage.setItem('unrelated-checkpoint', 'keep');
  const surface = builderHandoffPersistenceSurface(builder);
  expect(surface).toBe(`${builder === 'gutenberg' ? 'admin' : 'bricks'}-handoff:${address.id}:${address.tabId}`);
  expect(window.history.state.existingNavigation).toBe('keep');
  window.history.replaceState({id:'wordpress-reset'}, '', base);
  expect(builderHandoffDocumentAddress(window)).toEqual(address);
  expect(builderHandoffPersistenceSurface(builder)).toBe(surface);
  expect(sessionStorage.getItem('unrelated-checkpoint')).toBe('keep');
  window.history.replaceState(window.history.state, '', base.replace('42', '43'));
  expect(builderHandoffDocumentAddress(window)).toBeNull();
  expect(builderHandoffPersistenceSurface(builder)).toBe(builder === 'gutenberg' ? 'admin' : 'bricks');
});
it('does not recover a launch from copied sessionStorage in a newly opened document', () => {
  sessionStorage.setItem('pixflow:builder-handoff', JSON.stringify(address));
  window.history.replaceState({}, '', '/wp-admin/post.php?post=42&action=edit');
  expect(builderHandoffPersistenceSurface('gutenberg')).toBe('admin');
});

it.each([false, true])('recovers named destination after WordPress erases history before mount, changed page=%s', changedPage => {
  const base = '/wp-admin/post.php?post=42&action=edit';
  window.name = `pixflow-build-${address.tabId}`;
  window.history.replaceState({}, '', `${base}&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  builderHandoffPersistenceSurface('gutenberg');
  // A full reload has no bootstrap, and WordPress erases history before React mounts.
  window.history.replaceState({id:'gutenberg-navigation'}, '', changedPage ? base.replace('42','43') : base);
  expect(builderHandoffDocumentAddress(window)).toEqual(changedPage ? null : address);
  expect(window.history.state).toEqual({id:'gutenberg-navigation'});
});
it.each(['', 'ordinary-editor', 'pixflow-build-another-target-1234'])('rejects copied launch storage in another window named %j', name => {
  window.name = `pixflow-build-${address.tabId}`;
  window.history.replaceState({}, '', `/wp-admin/post.php?post=42&action=edit&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  builderHandoffPersistenceSurface('gutenberg');
  window.history.replaceState({}, '', '/wp-admin/post.php?post=42&action=edit');
  window.name = name;
  expect(builderHandoffDocumentAddress(window)).toBeNull();
  expect(builderHandoffPersistenceSurface('gutenberg')).toBe('admin');
});

it.each([
  ['etch', '/?etch=magic&post_id=42'],
  ['elementor', '/wp-admin/post.php?post=42&action=elementor'],
] as const)('retains %s handoffs after URL cleanup and isolates ordinary panel history', (builder, page) => {
  window.name = `pixflow-build-${address.tabId}`;
  window.history.replaceState({}, '', `${page}&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  expect(builderHandoffDocumentAddress(window)).toEqual(address);
  expect(builderHandoffPersistenceSurface(builder)).toBe(`admin-handoff:${address.id}:${address.tabId}`);
  window.history.replaceState({}, '', page);
  expect(builderHandoffDocumentAddress(window)).toEqual(address);
  window.history.replaceState({}, '', page.replace('42', '43'));
  expect(builderHandoffDocumentAddress(window)).toBeNull();
  window.name = '';
  expect(builderHandoffPersistenceSurface(builder)).toBe('admin');
});

it.each(['etch', 'elementor'] as const)('claims and completes one %s run with the original attachments', async builder => {
  const editor = { ...target, builder };
  const handoff = { ...receipt, destination: { ...receipt.destination, builder }, editorTarget: editor };
  read.mockResolvedValue({ ...handoff, status: 'ready' });
  mutate.mockResolvedValue({ handoff, shouldStart: true });
  const start = vi.fn(async execution => { await execution.accepted(); await execution.finished(); return true; });
  await receiveBuilderHandoff(address, editor, start);
  expect(start).toHaveBeenCalledTimes(1);
  expect(builderHandoffAttachments(handoff)).toEqual(builderHandoffAttachments(receipt));
  mutate.mockResolvedValue({ handoff: { ...handoff, status: 'completed' }, shouldStart: false });
  await receiveBuilderHandoff(address, editor, start);
  expect(start).toHaveBeenCalledTimes(1);
});


it.each(['etch', 'elementor'] as const)('keeps a completed %s handoff idle on reload before its canvas connects', async builder => {
  vi.useFakeTimers();
  window.history.replaceState({}, '', `/?post_id=42&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  read.mockResolvedValue({ ...receipt, status: 'completed', destination: { ...receipt.destination, builder } });
  const getTarget = vi.fn<() => Promise<PixflowEditorTarget | undefined>>().mockResolvedValue(undefined);
  const start = vi.fn(() => true), notice = vi.fn();
  const view = renderHook(() => useBuilderHandoffReceiver({ builder, enabled: true, busy: false, target: getTarget, start, notice }));
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  await act(async () => {
    for (let i = 0; i < 5; i++) window.dispatchEvent(new CustomEvent(`pixflow-design:${builder}-connection`, { detail: { connected: true } }));
  });
  expect(read).toHaveBeenCalledTimes(1);
  expect(getTarget).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  expect(notice).not.toHaveBeenCalled();
  view.unmount();
});


it.each(['cancelled', 'awaiting_input', 'failed'] as const)('settles %s before canvas lookup with accurate status on reload', async status => {
  window.history.replaceState({}, '', `/?post=42&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  read.mockResolvedValue({ ...receipt, status, error: status === 'failed' ? 'The original build failed.' : undefined });
  const getTarget = vi.fn(), start = vi.fn(), notice = vi.fn();
  const view = renderHook(() => useBuilderHandoffReceiver({ builder: 'gutenberg', enabled: true, busy: false, target: getTarget, start, notice }));
  await act(async () => {});
  expect(getTarget).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  if (status === 'cancelled') expect(notice).not.toHaveBeenCalled();
  else expect(notice).toHaveBeenCalledWith(expect.stringContaining(status === 'failed' ? 'The original build failed.' : 'waiting for your answer'));
  view.unmount();
});

it.each(['id', 'tab', 'builder', 'page'] as const)('rejects a terminal receipt with mismatched %s before settling', async mismatch => {
  window.history.replaceState({}, '', `/?post=42&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  read.mockResolvedValue({ ...receipt, status: 'completed',
    ...(mismatch === 'id' ? { id: 'b'.repeat(64) } : {}),
    ...(mismatch === 'tab' ? { targetTabId: 'tab-other123456789' } : {}),
    destination: { ...receipt.destination, ...(mismatch === 'builder' ? { builder: 'etch' } : {}), ...(mismatch === 'page' ? { postId: 43 } : {}) },
  });
  const getTarget = vi.fn(), start = vi.fn(), notice = vi.fn();
  const view = renderHook(() => useBuilderHandoffReceiver({ builder: 'gutenberg', enabled: true, busy: false, target: getTarget, start, notice }));
  await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.stringContaining('does not match this editor page and tab')));
  expect(getTarget).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  view.unmount();
});

it('does not mistake an unavailable receipt service for an editor connection timeout or retry on connection events', async () => {
  window.history.replaceState({}, '', `/?post=42&pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`);
  read.mockRejectedValue(new Error('Could not read the builder handoff.'));
  const getTarget = vi.fn(), start = vi.fn(), notice = vi.fn();
  const view = renderHook(() => useBuilderHandoffReceiver({ builder: 'gutenberg', enabled: true, busy: false, target: getTarget, start, notice }));
  await waitFor(() => expect(notice).toHaveBeenCalledWith('Could not read the builder handoff.'));
  await act(async () => { window.dispatchEvent(new CustomEvent('pixflow-design:gutenberg-connection', { detail: { connected: true } })); });
  expect(read).toHaveBeenCalledTimes(1);
  expect(getTarget).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  view.unmount();
});

it('does not settle or claim after navigating away while the receipt read is pending', async () => {
  const query = `pixflow_handoff=${address.id}&pixflow_handoff_tab=${address.tabId}`;
  window.history.replaceState({}, '', `/?post=42&${query}`);
  let respond!: (value: PixflowBuilderHandoff) => void;
  read.mockImplementation(() => new Promise(resolve => { respond = resolve; }));
  const getTarget = vi.fn(), start = vi.fn(), notice = vi.fn();
  const view = renderHook(() => useBuilderHandoffReceiver({ builder: 'gutenberg', enabled: true, busy: false, target: getTarget, start, notice }));
  window.history.replaceState({}, '', `/?post=43&${query}`);
  await act(async () => { respond({ ...receipt, status: 'completed' }); });
  expect(notice).toHaveBeenCalledWith(expect.stringContaining('does not match this editor page and tab'));
  expect(getTarget).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  view.unmount();
});
