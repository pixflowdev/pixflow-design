import { expect, it } from 'vitest';
import { assistantProgress } from '../../src/components/chat/assistant-progress';

it('keeps local preparation distinct from provider work and accepts legacy provider initialization', () => {
  expect(assistantProgress([{kind:'activity',id:'setup',origin:'pixflow',phase:'preparing',status:'succeeded',label:'Prepared'}])).toBe('preparing');
  expect(assistantProgress([{kind:'status',label:'initializing'}])).toBe('waiting');
  expect(assistantProgress([{kind:'usage',inputTokens:10,outputTokens:20}])).toBe('preparing');
});
it('tracks tool-to-provider handoffs instead of leaving the previous tool marked as running', () => {
  const tools = [{kind:'tool_use' as const,id:'read',name:'Read',input:{}},{kind:'tool_result' as const,toolUseId:'read',content:'Read',isError:false}];
  expect(assistantProgress(tools)).toBe('working');
  expect(assistantProgress([...tools,{kind:'status',label:'provider_waiting'}])).toBe('waiting');
  expect(assistantProgress([...tools,{kind:'status',label:'provider_waiting'},{kind:'text',text:'The page is healthy.'}])).toBe('working');
});

it('settles a completed response without pretending cleanup is more model work', () => {
  expect(assistantProgress([{kind:'text',text:'The answer.'},{kind:'status',label:'response_complete'}])).toBe('finishing');
  expect(assistantProgress([{kind:'status',label:'response_complete'},{kind:'tool_use',id:'followup',name:'Read',input:{}}])).toBe('working');
});
