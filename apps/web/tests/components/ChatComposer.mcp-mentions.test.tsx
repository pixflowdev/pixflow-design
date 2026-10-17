// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatComposer, type ChatComposerHandle } from '../../src/components/ChatComposer';
import { typeAndSettle, composerText, pressEnter } from '../helpers/lexical-composer';
const state=vi.hoisted(()=>({connected:true,servers:[{id:'docs',label:'OpenAI Docs',transport:'http',enabled:true,url:'https://developers.openai.com/mcp'}]}));
vi.mock('../../src/state/mcp',async original=>({...await original<typeof import('../../src/state/mcp')>(),fetchMcpServers:vi.fn(async()=>state.connected?{servers:state.servers,templates:[]}:null)}));
vi.mock('../../src/pixflow/optional-bridge',async original=>({...await original<typeof import('../../src/pixflow/optional-bridge')>(),pixflowOptionalBridgeCanRequest:()=>state.connected}));
beforeEach(()=>{
  (window as any).PixflowExternalMcpFactory = () => ({});
  history.replaceState(null,'','/?pixflowWpVersion=2.0.3');
  state.connected=true;state.servers[0]!.enabled=true;
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('[]')));
});
afterEach(()=>{cleanup();delete (window as any).PixflowExternalMcpFactory;vi.unstubAllGlobals();history.replaceState(null,'','/');sessionStorage.clear();});
function mount(provider:string|null='codex'){
  const onSend=vi.fn(),manage=vi.fn(),ref=createRef<ChatComposerHandle>();
  const view=render(<ChatComposer ref={ref} projectId={null} projectFiles={[]} streaming={false} mcpProvider={provider} onEnsureProject={async()=>null} onSend={onSend} onStop={()=>{}} onOpenMcpSettings={manage}/>);
  return {onSend,manage,ref,...view};
}
it('uses the WordPress @ group and inline token without a duplicate top chip, and sends only safe references',async()=>{
  const {onSend}=mount();
  await typeAndSettle('@OpenAI');
  fireEvent.click(await screen.findByRole('option',{name:/OpenAI Docs/}));
  expect(screen.getByTestId('chat-composer-input').querySelector('[data-mention-kind="mcp"]')?.textContent).toBe('@OpenAI Docs');
  expect(screen.queryByTestId('staged-contexts')?.textContent || '').not.toContain('OpenAI Docs');
  await pressEnter();
  await waitFor(()=>expect(onSend).toHaveBeenCalledOnce());
  expect(onSend.mock.calls[0]![3]?.context).toMatchObject({mcpServerIds:['docs'],mcpMentions:[{id:'docs',label:'OpenAI Docs'}]});
  expect(JSON.stringify(onSend.mock.calls[0]![3])).not.toContain('https:');
});
it.each([null,'antigravity'])('hides MCP choices for unsupported provider %s',async provider=>{
  mount(provider); await typeAndSettle('@OpenAI');
  await waitFor(()=>expect(screen.getByTestId('pixflow-context-picker')).toBeTruthy());
  expect(screen.queryByRole('option',{name:/OpenAI Docs/})).toBeNull();
});
it('refreshes enabled choices after saving settings and clears them when Bridge disconnects',async()=>{
  mount();await typeAndSettle('@OpenAI');await screen.findByRole('option',{name:/OpenAI Docs/});
  await act(async()=>{state.servers[0]!.enabled=false;window.dispatchEvent(new Event('pixflow:mcp-settings-saved'));});
  await waitFor(()=>expect(screen.queryByRole('option',{name:/OpenAI Docs/})).toBeNull());
  await act(async()=>{state.servers[0]!.enabled=true;window.dispatchEvent(new Event('pixflow:mcp-settings-saved'));});
  await screen.findByRole('option',{name:/OpenAI Docs/});
  await act(async()=>{state.connected=false;window.dispatchEvent(new Event('pixflow-design:bridge-status'));});
  expect(screen.queryByRole('option',{name:/OpenAI Docs/})).toBeNull();
});
it('restores a queued draft before server discovery, retaining the token and its metadata',async()=>{
  state.connected=false;const {ref,onSend}=mount();
  await act(async()=>ref.current!.restoreDraft({text:'@OpenAI Docs explain setup',meta:{context:{mcpServerIds:['docs'],mcpMentions:[{id:'docs',label:'OpenAI Docs'}]}}}));
  await waitFor(()=>expect(composerText()).toBe('@OpenAI Docs explain setup'));
  expect(screen.getByTestId('chat-composer-input').querySelector('[data-mention-kind="mcp"]')?.textContent).toBe('@OpenAI Docs');
  await pressEnter();await waitFor(()=>expect(onSend).toHaveBeenCalledOnce());
  expect(onSend.mock.calls[0]![3]?.context?.mcpServerIds).toEqual(['docs']);
});
it('opens management from the picker footer',async()=>{
  const {manage}=mount();await typeAndSettle('@');
  fireEvent.click(await screen.findByRole('button',{name:'Manage external tools'}));
  expect(manage).toHaveBeenCalledOnce();
});
it('keeps MCP shortcuts out of the WordPress slash menu',async()=>{
  mount();await typeAndSettle('/mcp');
  expect(screen.queryByRole('option',{name:/MCP|OpenAI Docs/})).toBeNull();
});
