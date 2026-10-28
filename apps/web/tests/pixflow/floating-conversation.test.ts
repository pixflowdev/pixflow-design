// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/pixflow/wordpress-context', () => ({ getPixflowWordPressConfig: () => owner }));
let owner: Record<string, unknown>;
import { rememberFloatingConversation, readFloatingConversation, floatingRunStorageKey, normalizeFloatingRunMetadata, mergeFloatingRecoveryMessages } from '../../src/pixflow/floating-conversation';
import { rememberFloatingExecution, withFloatingExecution } from '../../src/pixflow/floating-conversation';
import { DEFAULT_CONFIG } from '../../src/state/config';
import { selectFloatingConversation, useFloatingConversation } from '../../src/pixflow/floating-conversation';
import { conversationSessionKey } from '../../src/pixflow/conversation-address';
beforeEach(() => { sessionStorage.clear(); owner = { restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1', userId: 1, postId: 12 }; });

it('does not replace an active run when selecting a saved Workspace chat', async () => {
  const { renderHook, act, cleanup } = await import('@testing-library/react');
  const binding = { projectId: '12345678-1234-1234-1234-123456789abc', conversationId: 'workspace-chat' };
  rememberFloatingConversation('bricks:original', 'bricks');
  const originalRunKey = floatingRunStorageKey('bricks');
  const hook = renderHook(({ busy }) => useFloatingConversation('bricks:original', 'bricks', busy), { initialProps: { busy: true } });
  let selection!: Promise<void>;
  act(() => { selection = selectFloatingConversation(binding); });
  expect(hook.result.current.historyKey).toBe('bricks:original');
  expect(floatingRunStorageKey('bricks')).toBe(originalRunKey);
  hook.rerender({ busy: false });
  await selection;
  expect(hook.result.current.historyKey).toBe(conversationSessionKey(binding));
  expect(readFloatingConversation()?.historyKey).toBe(conversationSessionKey(binding));
  expect(floatingRunStorageKey('bricks')).not.toBe(originalRunKey);
  owner.postId = 99;
  expect(readFloatingConversation()?.historyKey).toBe(conversationSessionKey(binding));
  cleanup();
});
describe('floating conversation navigation', () => {
  it('carries CLI choice across editor seeds without copying credentials and isolates users', () => {
    rememberFloatingConversation('bricks:one','bricks');
    rememberFloatingExecution({...DEFAULT_CONFIG,mode:'daemon',agentId:'codex',agentModels:{codex:{model:'test-model',reasoning:'high'}},apiKey:'never-copy'});
    const next=withFloatingExecution({...DEFAULT_CONFIG,agentId:'claude',apiKey:'destination-key'});
    expect(next.agentId).toBe('codex');
    expect(next.agentModels?.codex?.model).toBe('test-model');
    expect(next.apiKey).toBe('destination-key');
    expect(Object.values(sessionStorage).join('')).not.toContain('never-copy');
    owner.userId=2;
    expect(withFloatingExecution({...DEFAULT_CONFIG,agentId:'claude'}).agentId).toBe('claude');
  });
  it('does not replace hydrated rows with pre-run receipt revisions during handoff', () => {
    const current = [
      {id:'welcome', role:'assistant', content:'Ready', historyRevision:2},
      {id:'reply', role:'assistant', content:'Reading the page', historyRevision:6},
    ];
    const receipt = [
      {id:'welcome', role:'assistant', content:'Ready'},
      {id:'reply', role:'assistant', content:'', historyRevision:1},
      {id:'unsaved-prompt', role:'user', content:'Keep this prompt'},
    ];
    expect(mergeFloatingRecoveryMessages(current, receipt)).toEqual([...current, receipt[2]]);
    expect(current[1]!.historyRevision).toBe(6);
  });
  it('retains the exact history and run checkpoint across a page/editor change', () => {
    const original = floatingRunStorageKey('bricks');
    rememberFloatingConversation('bricks:conversation-a', 'bricks');
    owner.postId = 99;
    expect(readFloatingConversation()?.historyKey).toBe('bricks:conversation-a');
    expect(floatingRunStorageKey('bricks')).toBe(original);
    expect(floatingRunStorageKey('admin')).not.toBe(original);
  });
  it('isolates users, sites and tabs and replaces only the active reference', () => {
    rememberFloatingConversation('bricks:old', 'bricks');
    owner.userId = 2; expect(readFloatingConversation()).toBeNull();
    owner.userId = 1; owner.restBaseUrl = 'https://other.test/wp-json'; expect(readFloatingConversation()).toBeNull();
    owner.restBaseUrl = 'https://example.test/wp-json/pixflow-design/v1';
    rememberFloatingConversation('admin:new', 'admin');
    expect(readFloatingConversation()?.historyKey).toBe('admin:new');
    sessionStorage.clear(); expect(readFloatingConversation()).toBeNull();
  });
  it('does not carry explicit handoffs into unrelated panels', () => {
    rememberFloatingConversation('private-handoff', 'bricks-handoff:receipt:tab');
    expect(readFloatingConversation()).toBeNull();
  });
  it('normalizes both panel receipts without dropping tool state or IDs', () => {
    const messages = [{id:'reply', role:'assistant',content:'Working',agentId:'codex'}];
    expect(normalizeFloatingRunMetadata({initial:messages,id:'reply',agentId:'codex',sessionKey:'bricks:a'})).toMatchObject({messages,messageId:'reply',sessionKey:'bricks:a',initial:messages,id:'reply'});
    expect(normalizeFloatingRunMetadata({messages,messageId:'reply',sessionKey:'admin:a'})).toMatchObject({initial:messages,id:'reply',agentId:'codex'});
  });
  it('fails closed on corrupt references', () => {
    rememberFloatingConversation('bricks:a','bricks');
    const key=sessionStorage.key(0)!; sessionStorage.setItem(key,'{"historyKey":12}');
    expect(readFloatingConversation()).toBeNull();
  });
  it('rejects checkpoint addresses for another owner even when the prefix matches', () => {
    rememberFloatingConversation('bricks:a', 'bricks');
    const key = sessionStorage.key(0)!;
    const original = JSON.parse(sessionStorage.getItem(key)!);
    sessionStorage.setItem(key, JSON.stringify({...original, runKey: original.runKey.replace(':user:1:', ':user:10:')}));
    expect(readFloatingConversation()).toBeNull();
  });
});

it('adopts on mount but respects New chat and explicit builder handoffs', async () => {
  const {renderHook,act,cleanup}=await import('@testing-library/react');
  const {useFloatingConversation}=await import('../../src/pixflow/floating-conversation');
  rememberFloatingConversation('bricks:original','bricks');
  const hook=renderHook(({key,surface})=>useFloatingConversation(key,surface),{initialProps:{key:'admin:default',surface:'admin'}});
  expect(hook.result.current.historyKey).toBe('bricks:original');
  act(()=>hook.rerender({key:'admin:new',surface:'admin'}));
  expect(hook.result.current.historyKey).toBe('admin:new');
  expect(readFloatingConversation()?.historyKey).toBe('admin:new');
  hook.unmount();
  const handoff=renderHook(()=>useFloatingConversation('handoff:own','admin-handoff:receipt:tab'));
  expect(handoff.result.current.historyKey).toBe('handoff:own');
  cleanup();
});

it('cancels a waiting selection without changing history when its picker closes', async () => {
  const {renderHook, act, cleanup} = await import('@testing-library/react');
  const hook = renderHook(({busy}) => useFloatingConversation('admin:original', 'admin', busy), {initialProps:{busy:true}});
  const controller = new AbortController();
  let selection!: Promise<void>;
  act(() => { selection = selectFloatingConversation({projectId:'12345678-1234-1234-1234-123456789abc',conversationId:'other'}, {signal:controller.signal}); });
  const rejected = expect(selection).rejects.toThrow('cancelled');
  act(() => controller.abort());
  await rejected;
  hook.rerender({busy:false});
  expect(hook.result.current.historyKey).toBe('admin:original');
  cleanup();
});

it('keeps automatic queue dispatch paused through a deferred chat selection', async () => {
  const { renderHook, act, cleanup } = await import('@testing-library/react');
  const { useEffect } = await import('react');
  const binding = { projectId: '12345678-1234-1234-1234-123456789abc', conversationId: 'next-chat' };
  rememberFloatingConversation('admin:original', 'admin');
  const dispatched: string[] = [];
  const hook = renderHook(({ busy }) => {
    const selection = useFloatingConversation('admin:original', 'admin', busy);
    useEffect(() => {
      // Model the composer's automatic dispatch when streaming settles.
      if (!busy && !selection.selectionPending) dispatched.push(selection.historyKey);
    }, [busy, selection.historyKey, selection.selectionPending]);
    return selection;
  }, { initialProps: { busy: true } });
  let selected!: Promise<void>;
  act(() => { selected = selectFloatingConversation(binding); });
  act(() => hook.rerender({ busy: false }));
  await selected;
  expect(dispatched).not.toContain('admin:original');
  expect(hook.result.current.historyKey).toBe(conversationSessionKey(binding));
  cleanup();
});
