// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readComposerQueue, useComposerQueue } from '../../src/components/composer-queue';
import { I18nProvider } from '../../src/i18n';
import type { ReactNode } from 'react';
import { fr } from '../../src/i18n/locales/fr';
beforeEach(() => sessionStorage.clear());
it('reconciles restored uncertain guidance with durable steering receipts without resending or removing other messages', () => {
  sessionStorage.setItem('recovered-steer', JSON.stringify({ paused: false, items: [
    { id: 'accepted-one', prompt: 'Accepted guidance', attachments: [], comments: [], state: 'sending' },
    { id: 'unknown-two', prompt: 'Keep uncertain guidance', attachments: [], comments: [], state: 'unconfirmed' },
  ] }));
  const send = vi.fn();
  const {result,rerender} = renderHook(({receipts}) => useComposerQueue({key:'recovered-steer',streaming:false,disabled:false,send,acceptedSteeringIds:receipts}), {initialProps:{receipts:[] as string[]}});
  expect(result.current.items).toHaveLength(2);
  rerender({receipts:['accepted-one']});
  expect(result.current.items.map(item=>item.id)).toEqual(['unknown-two']);
  expect(readComposerQueue('recovered-steer').items.map(item=>item.id)).toEqual(['unknown-two']);
  expect(send).not.toHaveBeenCalled();
});
it('localizes restored delivery diagnostics without rewriting the saved prompt or identifiers', async () => {
  sessionStorage.setItem('translated-queue', JSON.stringify({ paused: false, items: [{ id: 'stable-message', prompt: 'Keep my words exactly', attachments: [], comments: [], state: 'sending' }] }));
  const before = sessionStorage.getItem('translated-queue');
  const { result } = renderHook(() => useComposerQueue({ key: 'translated-queue', streaming: false, disabled: false, send: vi.fn() }), {
    wrapper: ({ children }: { children: ReactNode }) => <I18nProvider initial="fr">{children}</I18nProvider>,
  });
  // Non-English resources load asynchronously; restoration must preserve the
  // saved record both before and after its display-only translation arrives.
  expect(sessionStorage.getItem('translated-queue')).toBe(before);
  await waitFor(() => expect(result.current.items[0]).toMatchObject({ id: 'stable-message', prompt: 'Keep my words exactly', state: 'unconfirmed', message: fr['ui.finalQueue.interrupted'] }));
  expect(sessionStorage.getItem('translated-queue')).toBe(before);
});
it('keeps MCP references through persistence, editing, steering and FIFO dispatch',async()=>{
  const meta={context:{mcpServerIds:['docs'],mcpMentions:[{id:'docs',label:'OpenAI Docs'}]}};
  const send=vi.fn(),steer=vi.fn(async item=>({messageId:item.id,state:'accepted' as const}));
  const {result,rerender}=renderHook(({streaming})=>useComposerQueue({key:'mcp-queue',streaming,disabled:false,outcome:'succeeded',send,steer}),{initialProps:{streaming:true}});
  act(()=>{result.current.add('@OpenAI Docs find configuration help',[],[],meta);});
  expect(readComposerQueue('mcp-queue').items[0]?.meta).toEqual(meta);
  let draft:ReturnType<typeof result.current.takeForEditing>;
  act(()=>{draft=result.current.takeForEditing(result.current.items[0]!.id);});
  expect(draft!.item.meta).toEqual(meta);
  act(()=>{result.current.add(draft!.item.prompt,[],[],draft!.item.meta);});
  await act(async()=>{await result.current.steer(result.current.items[0]!);});
  expect(steer.mock.calls[0]![0].meta).toEqual(meta);
  act(()=>{result.current.add('@OpenAI Docs another question',[],[],meta);});
  rerender({streaming:false});
  expect(send).toHaveBeenCalledExactlyOnceWith('@OpenAI Docs another question',[],[],meta);
});
afterEach(cleanup);
it('waits for a restored running turn to reconnect before draining its queue', () => {
  sessionStorage.setItem('queue', JSON.stringify({ paused: false, items: [{ id: 'later', prompt: 'Summarize', attachments: [], comments: [], state: 'queued' }] }));
  const send = vi.fn();
  const { result, rerender } = renderHook(({ streaming, outcome }) => useComposerQueue({ key: 'queue', streaming, disabled: false, outcome, send }), { initialProps: { streaming: false, outcome: 'running' } });
  expect(send).not.toHaveBeenCalled();
  expect(result.current.items[0]?.state).toBe('queued');
  rerender({ streaming: true, outcome: 'running' });
  expect(send).not.toHaveBeenCalled();
  rerender({ streaming: false, outcome: 'succeeded' });
  expect(send).toHaveBeenCalledExactlyOnceWith('Summarize', [], [], undefined);
});
it('starts a fresh queue normally after an earlier run failed with no pending messages', () => {
  const send = vi.fn();
  const { result, rerender } = renderHook(({ streaming, outcome }) => useComposerQueue({ key: 'queue', streaming, disabled: false, outcome, send }), { initialProps: { streaming: true, outcome: 'running' } });
  rerender({ streaming: false, outcome: 'failed' });
  rerender({ streaming: true, outcome: 'running' });
  act(() => { result.current.add('Summarize the new run', [], []); });
  rerender({ streaming: false, outcome: 'succeeded' });
  expect(send).toHaveBeenCalledExactlyOnceWith('Summarize the new run', [], [], undefined);
});
it('dispatches FIFO once per completed run and keeps attachment context', () => {
  const send = vi.fn();
  const { result, rerender } = renderHook(({ streaming }) => useComposerQueue({ key: 'queue', streaming, disabled: false, outcome: 'succeeded', send }), { initialProps: { streaming: true } });
  act(() => { result.current.add('One', [{ name: 'brief', path: 'brief', kind: 'file' }], [], { skillIds: ['design'] }); result.current.add('Two', [], []); result.current.add('Three', [], []); });
  expect(send).not.toHaveBeenCalled();
  rerender({ streaming: false });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[1]).toHaveLength(1);
  rerender({ streaming: true });
  expect(result.current.items.map(item => item.prompt)).toEqual(['Two', 'Three']);
  rerender({ streaming: false });
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]?.[0]).toBe('Two');
});
it('pauses on user stop and never treats it as permission to drain', () => {
  const send = vi.fn();
  const { result, rerender } = renderHook(({ streaming }) => useComposerQueue({ key: 'queue', streaming, disabled: false, outcome: 'canceled', send }), { initialProps: { streaming: true } });
  act(() => { result.current.add('Later', [], []); result.current.pause(); });
  rerender({ streaming: false });
  expect(send).not.toHaveBeenCalled();
  act(() => { result.current.resume(); });
  expect(send).toHaveBeenCalledTimes(1);
});
it('retains uncertain sends across reload without replaying them', () => {
  sessionStorage.setItem('queue', JSON.stringify({ paused: false, items: [{ id: 'a', prompt: 'Build', attachments: [], comments: [], state: 'sending' }] }));
  expect(readComposerQueue('queue')).toMatchObject({ paused: true, items: [{ state: 'unconfirmed' }] });
  const send = vi.fn(); renderHook(() => useComposerQueue({ key: 'queue', streaming: false, disabled: false, send }));
  expect(send).not.toHaveBeenCalled();
});

it('keeps a rejected startup queued and pauses instead of dropping it', async () => {
  const send = vi.fn(() => 'restore-draft' as const);
  const { result, rerender } = renderHook(({ streaming }) => useComposerQueue({ key: 'queue', streaming, disabled: false, outcome: 'succeeded', send }), { initialProps: { streaming: true } });
  act(() => { result.current.add('Keep me', [], []); });
  await act(async () => { rerender({ streaming: false }); });
  expect(result.current.paused).toBe(true);
  expect(result.current.items[0]).toMatchObject({ prompt: 'Keep me', state: 'queued' });
  expect(send).toHaveBeenCalledTimes(1);
});

it('keeps a preparing turn queued until explicit acceptance and dispatches the next turn once', async () => {
  const callbacks: Array<() => void> = [];
  const send = vi.fn((_prompt, _attachments, _comments, _meta, accepted) => { callbacks.push(accepted); });
  const { result, rerender } = renderHook(({ streaming }) => useComposerQueue({ key: 'acceptance', streaming, disabled: false, outcome: 'succeeded', requireAcceptance: true, send }), { initialProps: { streaming: true } });
  act(() => { result.current.add('First', [], []); result.current.add('Second', [], []); });
  rerender({ streaming: false });
  expect(send).toHaveBeenCalledTimes(1);
  rerender({ streaming: true });
  expect(result.current.items.map(item => item.prompt)).toEqual(['First', 'Second']);
  expect(result.current.items[0]?.state).toBe('sending');
  expect(readComposerQueue('acceptance').items[0]?.state).toBe('unconfirmed');
  act(() => { callbacks[0]!(); callbacks[0]!(); });
  expect(result.current.items.map(item => item.prompt)).toEqual(['Second']);
  expect(send).toHaveBeenCalledTimes(1);
  rerender({ streaming: false });
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]![0]).toBe('Second');
});

it.each(['failed', 'canceled', 'succeeded'])('retains an unacknowledged preparing request after %s and ignores late acceptance', async outcome => {
  let accepted!: () => void;
  const send = vi.fn((_prompt, _attachments, _comments, _meta, callback) => { accepted = callback; });
  const { result, rerender, unmount } = renderHook(({ streaming, status }) => useComposerQueue({ key: 'preparation', streaming, disabled: false, outcome: status, requireAcceptance: true, send }), { initialProps: { streaming: true, status: 'running' } });
  const attachment = { path: 'reference.png', name: 'Reference', kind: 'image' as const };
  act(() => { result.current.add('Keep this', [attachment], [], { skillIds: ['motion'] }); result.current.add('Later', [], []); });
  rerender({ streaming: false, status: 'succeeded' });
  rerender({ streaming: true, status: 'running' });
  rerender({ streaming: false, status: outcome });
  expect(result.current.paused).toBe(true);
  expect(result.current.items[0]).toMatchObject({ state: 'unconfirmed', prompt: 'Keep this', attachments: [attachment], meta: { skillIds: ['motion'] } });
  act(() => accepted());
  expect(result.current.items).toHaveLength(2);
  expect(send).toHaveBeenCalledTimes(1);
  unmount();
  renderHook(() => useComposerQueue({ key: 'preparation', streaming: false, disabled: false, requireAcceptance: true, send }));
  expect(send).toHaveBeenCalledTimes(1);
});

it('retains a rejected async preparation while its activity indicator is visible', async () => {
  let reject!: (reason: Error) => void;
  const send = vi.fn(() => new Promise<void>((_resolve, failure) => { reject = failure; }));
  const { result, rerender } = renderHook(({ streaming }) => useComposerQueue({ key: 'prepare-failure', streaming, disabled: false, outcome: 'succeeded', requireAcceptance: true, send }), { initialProps: { streaming: true } });
  act(() => { result.current.add('Keep my request', [], []); });
  rerender({ streaming: false });
  rerender({ streaming: true });
  await act(async () => { reject(new Error('Compaction unavailable')); });
  expect(result.current).toMatchObject({ paused: true, items: [{ prompt: 'Keep my request', state: 'unconfirmed' }] });
  rerender({ streaming: false });
  expect(send).toHaveBeenCalledTimes(1);
});

it('ignores an acceptance callback from a different conversation', () => {
  let accepted!: () => void;
  const send = vi.fn((_prompt, _attachments, _comments, _meta, callback) => { accepted = callback; });
  const { result, rerender } = renderHook(({ key, streaming }) => useComposerQueue({ key, streaming, disabled: false, outcome: 'succeeded', requireAcceptance: true, send }), { initialProps: { key: 'first-scope', streaming: true } });
  act(() => { result.current.add('First scope', [], []); });
  rerender({ key: 'first-scope', streaming: false });
  rerender({ key: 'second-scope', streaming: true });
  act(() => { result.current.add('Second scope', [], []); accepted(); });
  expect(result.current.items.map(item => item.prompt)).toEqual(['Second scope']);
  expect(readComposerQueue('first-scope').items[0]).toMatchObject({ prompt: 'First scope', state: 'unconfirmed' });
});

it('does not let an unmounted preparation remove the recovery copy after reload', () => {
  let accepted!: () => void;
  const send = vi.fn((_prompt, _attachments, _comments, _meta, callback) => { accepted = callback; });
  const first = renderHook(({ streaming }) => useComposerQueue({ key: 'reload-acceptance', streaming, disabled: false, outcome: 'succeeded', requireAcceptance: true, send }), { initialProps: { streaming: true } });
  act(() => { first.result.current.add('Preserve on reload', [], []); });
  first.rerender({ streaming: false });
  first.unmount();
  const second = renderHook(() => useComposerQueue({ key: 'reload-acceptance', streaming: false, disabled: false, outcome: 'succeeded', requireAcceptance: true, send }));
  act(() => accepted());
  expect(second.result.current.items[0]).toMatchObject({ state: 'unconfirmed', prompt: 'Preserve on reload' });
  expect(readComposerQueue('reload-acceptance').items[0]?.prompt).toBe('Preserve on reload');
  expect(send).toHaveBeenCalledTimes(1);
});

it('preserves edited and reordered messages through a reload', () => {
  const send = vi.fn();
  const { result } = renderHook(() => useComposerQueue({ key: 'queue', streaming: true, disabled: false, send }));
  act(() => { result.current.add('One', [], []); result.current.add('Two', [], []); result.current.add('Three', [], []); });
  const [one, two, three] = result.current.items;
  act(() => { result.current.edit(two!.id, 'Edited two'); result.current.reorder(three!.id, one!.id); result.current.remove(one!.id); result.current.pause(); });
  expect(readComposerQueue('queue')).toMatchObject({ paused: true, items: [{ prompt: 'Three' }, { prompt: 'Edited two' }] });
  expect(send).not.toHaveBeenCalled();
});

it('does not dispatch a message while the user is editing it', () => {
  const send = vi.fn();
  const { result, rerender } = renderHook(({ streaming }) => useComposerQueue({ key: 'queue', streaming, disabled: false, outcome: 'succeeded', send }), { initialProps: { streaming: true } });
  act(() => { result.current.add('Original', [], []); result.current.add('Later', [], []); });
  const id = result.current.items[0]!.id;
  act(() => { result.current.beginEdit(id); });
  rerender({ streaming: false });
  expect(send).not.toHaveBeenCalled();
  act(() => { result.current.edit(id, 'Updated'); });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toBe('Updated');
});

it('delivers guidance once as a normal follow-up when the final reply finishes before steering', async () => {
  const send = vi.fn(), steer = vi.fn(async item => ({ messageId: item.id, state: 'queued' as const }));
  const { result, rerender } = renderHook(({ streaming }) => useComposerQueue({ key: 'final-reply-queue', streaming, disabled: false, outcome: 'succeeded', send, steer }), { initialProps: { streaming: true } });
  act(() => { result.current.add('Use the new name', [], []); });
  await act(async () => { await result.current.steer(result.current.items[0]!); });
  expect(result.current.paused).toBe(false); expect(send).not.toHaveBeenCalled();
  expect(result.current.items[0]?.state).toBe('queued');
  rerender({ streaming: false });
  expect(send).toHaveBeenCalledExactlyOnceWith('Use the new name', [], [], undefined);
  rerender({ streaming: true }); rerender({ streaming: false });
  expect(send).toHaveBeenCalledTimes(1);
});

it('retains rejected steering and does not repeat it as a new run', async () => {
  const send = vi.fn(), steer = vi.fn(async item => ({ messageId: item.id, state: 'rejected' as const, message: 'Turn has finished' }));
  const { result, rerender } = renderHook(({ streaming }) => useComposerQueue({ key: 'queue', streaming, disabled: false, outcome: 'succeeded', send, steer }), { initialProps: { streaming: true } });
  act(() => { result.current.add('Change direction', [], []); });
  await act(async () => { await result.current.steer(result.current.items[0]!); });
  rerender({ streaming: false });
  expect(result.current.items[0]).toMatchObject({ state: 'queued', prompt: 'Change direction' });
  expect(send).not.toHaveBeenCalled();
});
it('steers once and does not submit the accepted message as a new run', async () => {
  const send = vi.fn(), steer = vi.fn(async item => ({ messageId: item.id, state: 'accepted' as const, turnId: 'turn' }));
  const { result, rerender } = renderHook(({ streaming }) => useComposerQueue({ key: 'queue', streaming, disabled: false, outcome: 'succeeded', send, steer }), { initialProps: { streaming: true } });
  act(() => { result.current.add('Make it blue', [], []); });
  await act(async () => { await result.current.steer(result.current.items[0]!); });
  rerender({ streaming: false });
  expect(steer).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled();
  expect(result.current.items[0]?.state).toBe('accepted');
});

it('ignores a double-click on steering while delivery is pending', async () => {
  let accept!: (value: any) => void;
  const steer = vi.fn(() => new Promise<any>(resolve => { accept = resolve; }));
  const { result } = renderHook(() => useComposerQueue({ key: 'queue', streaming: true, disabled: false, send: vi.fn(), steer }));
  act(() => { result.current.add('One direction', [], []); });
  const item = result.current.items[0]!;
  let pending!: Promise<void>;
  act(() => { pending = result.current.steer(item); void result.current.steer(item); });
  expect(steer).toHaveBeenCalledTimes(1);
  await act(async () => { accept({ messageId: item.id, state: 'accepted' }); await pending; });
});

it('does not leave a permanent sending spinner after synchronous dispatch failure', () => {
  const { result, rerender } = renderHook(({ streaming }) => useComposerQueue({ key: 'queue', streaming, disabled: false, outcome: 'succeeded', send: () => { throw new Error('Disconnected'); } }), { initialProps: { streaming: true } });
  act(() => { result.current.add('Keep this', [], []); });
  rerender({ streaming: false });
  expect(result.current).toMatchObject({ paused: true, items: [{ state: 'unconfirmed', prompt: 'Keep this' }] });
});

it('restores an interrupted edit without sending its original text automatically', () => {
  sessionStorage.setItem('queue', JSON.stringify({ paused: false, items: [{ id: 'a', prompt: 'Original', state: 'editing', attachments: [], comments: [] }] }));
  const send = vi.fn();
  const { result } = renderHook(() => useComposerQueue({ key: 'queue', streaming: false, disabled: false, send }));
  expect(result.current).toMatchObject({ paused: true, items: [{ state: 'queued', prompt: 'Original' }] });
  expect(send).not.toHaveBeenCalled();
});

it('keeps separate conversations isolated', () => {
  const send = vi.fn();
  const { result, rerender } = renderHook(({ key }) => useComposerQueue({ key, streaming: true, disabled: false, send }), { initialProps: { key: 'one' } });
  act(() => { result.current.add('Conversation one', [], []); });
  rerender({ key: 'two' });
  expect(result.current.items).toHaveLength(0);
  act(() => { result.current.add('Conversation two', [], []); });
  rerender({ key: 'one' });
  expect(result.current.items.map(item => item.prompt)).toEqual(['Conversation one']);
});

it('removes an edited item atomically and returns its full context', () => {
  const { result } = renderHook(() => useComposerQueue({ key: 'edit-restore', streaming: true, disabled: false, send: vi.fn() }));
  act(() => { result.current.add('First', [], []); result.current.add('Edit', [{ path: 'brief.pdf', name: 'brief.pdf', kind: 'file' }], [], { skillIds: ['design'] }); result.current.add('Last', [], []); });
  const original = result.current.items[1]!;
  let removed: ReturnType<typeof result.current.takeForEditing> = null;
  act(() => { removed = result.current.takeForEditing(original.id); });
  expect(result.current.items.map(item => item.prompt)).toEqual(['First', 'Last']);
  expect(removed!.item).toEqual(original);
  expect(result.current.takeForEditing(original.id)).toBeNull();
});

it('preserves annotation batches and image references through queue restore, editing and steering', async () => {
  const {formatAnnotationDraft,annotationsInDraft}=await import('../../src/pixflow/annotation-draft');
  const notes=[{comment:'Shorten this title',target:{tag:'h1',label:'Hero',selector:'#hero',url:'https://example.test/'}},{comment:'Use our brand colour',target:{tag:'a',label:'Book',selector:'#book',url:'https://example.test/'}}] as import('../../src/pixflow/page-annotation').PageAnnotation[];
  const prompt=formatAnnotationDraft(notes);
  const images=[{name:'screen.png',path:'uploads/screen.png',kind:'image' as const,annotationScreenshot:true}];
  const send=vi.fn(),steer=vi.fn(async item=>({messageId:item.id,state:'accepted' as const}));
  const {result,rerender}=renderHook(({streaming})=>useComposerQueue({key:'annotation-queue',streaming,disabled:false,outcome:'succeeded',send,steer}),{initialProps:{streaming:true}});
  act(()=>{result.current.add(prompt,images,[]);});
  expect(annotationsInDraft(readComposerQueue('annotation-queue').items[0]!.prompt)).toEqual(notes);
  let editing:ReturnType<typeof result.current.takeForEditing>;
  act(()=>{editing=result.current.takeForEditing(result.current.items[0]!.id);});
  expect(result.current.items).toHaveLength(0);
  expect(editing!.item.attachments).toEqual(images);
  act(()=>{result.current.add(editing!.item.prompt,editing!.item.attachments,[]);});
  await act(async()=>{await result.current.steer(result.current.items[0]!);});
  expect(steer.mock.calls[0]![0]).toMatchObject({prompt,attachments:images});
  rerender({streaming:false});
  expect(send).not.toHaveBeenCalled();
});


it('automatically sends the next queued item after durable evidence resolves a steering failure', async () => {
  const send = vi.fn();
  const steer = vi.fn(async item => ({ messageId: item.id, state: 'unconfirmed' as const }));
  const { result, rerender } = renderHook(({ streaming, receipts }) => useComposerQueue({
    key: 'resolved-steering', streaming, disabled: false, outcome: 'succeeded', send, steer, acceptedSteeringIds: receipts,
  }), { initialProps: { streaming: true, receipts: [] as string[] } });
  act(() => { result.current.add('Guidance', [], []); result.current.add('Next turn', [], []); });
  const guidance = result.current.items[0]!;
  await act(async () => { await result.current.steer(guidance); });
  expect(result.current.paused).toBe(true);
  rerender({ streaming: true, receipts: [guidance.id] });
  expect(send).not.toHaveBeenCalled();
  rerender({ streaming: false, receipts: [guidance.id] });
  expect(send).toHaveBeenCalledExactlyOnceWith('Next turn', [], [], undefined);
});

it('ignores a failed steering acknowledgement after durable acceptance was already replayed', async () => {
  let resolve!: (value: any) => void;
  const send = vi.fn();
  const steer = vi.fn(() => new Promise<any>(done => { resolve = done; }));
  const { result, rerender } = renderHook(({ streaming, receipts }) => useComposerQueue({
    key: 'late-steering-response', streaming, disabled: false, outcome: 'succeeded', send, steer, acceptedSteeringIds: receipts,
  }), { initialProps: { streaming: true, receipts: [] as string[] } });
  act(() => { result.current.add('Guidance', [], []); result.current.add('Next turn', [], []); });
  const guidance = result.current.items[0]!;
  let pending!: Promise<void>;
  act(() => { pending = result.current.steer(guidance); });
  rerender({ streaming: true, receipts: [guidance.id] });
  await act(async () => { resolve({ messageId: guidance.id, state: 'unconfirmed' }); await pending; });
  rerender({ streaming: false, receipts: [guidance.id] });
  expect(send).toHaveBeenCalledExactlyOnceWith('Next turn', [], [], undefined);
});


it.each(['stop', 'failed-run', 'another-uncertain-message'])('keeps the queue paused after a steering receipt when blocked by %s', async blocker => {
  const send = vi.fn();
  const steer = vi.fn(async item => ({ messageId: item.id, state: 'unconfirmed' as const }));
  const { result, rerender } = renderHook(({ streaming, receipts, outcome }) => useComposerQueue({
    key: 'preserve-pause', streaming, disabled: false, outcome, send, steer, acceptedSteeringIds: receipts,
  }), { initialProps: { streaming: true, receipts: [] as string[], outcome: 'running' } });
  act(() => { result.current.add('Guidance', [], []); result.current.add('Next turn', [], []); });
  const guidance = result.current.items[0]!;
  await act(async () => { await result.current.steer(guidance); });
  if (blocker === 'stop') act(() => result.current.pause());
  if (blocker === 'failed-run') rerender({ streaming: false, receipts: [], outcome: 'failed' });
  if (blocker === 'another-uncertain-message') await act(async () => { await result.current.steer(result.current.items[1]!); });
  rerender({ streaming: false, receipts: [guidance.id], outcome: blocker === 'failed-run' ? 'failed' : 'succeeded' });
  expect(result.current.paused).toBe(true);
  expect(send).not.toHaveBeenCalled();
});

it('resumes the remaining queue after reloading a delivery pause and replaying its receipt', async () => {
  const send = vi.fn();
  const steer = vi.fn(async item => ({ messageId: item.id, state: 'unconfirmed' as const }));
  const first = renderHook(() => useComposerQueue({ key: 'persisted-pause', streaming: true, disabled: false, send, steer }));
  act(() => { first.result.current.add('Guidance', [], []); first.result.current.add('Next turn', [], []); });
  const guidance = first.result.current.items[0]!;
  await act(async () => { await first.result.current.steer(guidance); });
  first.unmount();
  renderHook(() => useComposerQueue({ key: 'persisted-pause', streaming: false, disabled: false, outcome: 'succeeded', send, acceptedSteeringIds: [guidance.id] }));
  expect(send).toHaveBeenCalledExactlyOnceWith('Next turn', [], [], undefined);
});
