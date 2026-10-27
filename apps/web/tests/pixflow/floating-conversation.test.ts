// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/pixflow/wordpress-context', () => ({ getPixflowWordPressConfig: () => owner }));
let owner: Record<string, unknown>;
import { rememberFloatingConversation, readFloatingConversation, floatingRunStorageKey, normalizeFloatingRunMetadata, mergeFloatingRecoveryMessages } from '../../src/pixflow/floating-conversation';
import { rememberFloatingExecution, withFloatingExecution } from '../../src/pixflow/floating-conversation';
import { DEFAULT_CONFIG } from '../../src/state/config';
beforeEach(() => { sessionStorage.clear(); owner = { restBaseUrl: 'https://example.test/wp-json/pixflow-design/v1', userId: 1, postId: 12 }; });
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
