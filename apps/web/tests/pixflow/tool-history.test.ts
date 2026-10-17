// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const config = vi.hoisted(() => ({siteHash:'site-one',userId:2,restRouteBaseUrl:'https://site.example/'}));
vi.mock('../../src/pixflow/wordpress-context',()=>({getPixflowWordPressConfig:()=>config}));
vi.mock('../../src/pixflow/runtime-fetch',()=>({pixflowRuntimeFetch:vi.fn(),pixflowWordPressRestFetch:vi.fn()}));
import { clearBrowserToolHistory, clearCompletedToolEvents, onToolHistoryCleared } from '../../src/pixflow/tool-history';
import { directTabStorageKey } from '../../src/pixflow/direct-tab-storage';
afterEach(()=>{localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
it('clears this owner’s completed display logs without touching prompts, images, queues, recovery or other users',()=>{
  const message={id:'done',content:'User request',status:'complete',attachments:[{path:'image.png'}],events:[{kind:'tool_result',content:'verbose'},{kind:'text',text:'Answer'}]};
  const key='pixflow-direct:site-one:2';
  localStorage.setItem(key,JSON.stringify([message]));
  sessionStorage.setItem(`pixflow:admin-transcript:${key}`,JSON.stringify([message]));
  const bricks=directTabStorageKey('pixflow-design:bricks-agent:working-memory:v2')+':post:9';
  localStorage.setItem(bricks,JSON.stringify({messages:[message],workingMemory:{facts:['keep']}}));
  for(const other of ['pixflow-direct:site-one:3','pixflow-direct:site-two:2','pixflow:direct-bricks-run:admin','pixflow:composer-queue'])localStorage.setItem(other,JSON.stringify([message]));
  const notified=vi.fn();const unsubscribe=onToolHistoryCleared(notified);
  expect(clearBrowserToolHistory()).toBe(3);
  expect(notified).toHaveBeenCalledOnce();unsubscribe();
  expect(JSON.parse(localStorage.getItem(key)!)[0]).toMatchObject({content:'User request',attachments:message.attachments,events:[{kind:'text',text:'Answer'}]});
  expect(JSON.parse(localStorage.getItem(bricks)!).workingMemory).toEqual({facts:['keep']});
  for(const other of ['pixflow-direct:site-one:3','pixflow-direct:site-two:2','pixflow:direct-bricks-run:admin','pixflow:composer-queue'])expect(localStorage.getItem(other)).toBe(JSON.stringify([message]));
});
it('preserves active and interrupted diagnostics',()=>{
  const messages=['running','interrupted'].map(runStatus=>({runStatus,events:[{kind:'tool_result',content:'proof'}]}));
  expect(clearCompletedToolEvents(messages)).toEqual(messages);
});
