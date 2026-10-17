import { expect, it } from 'vitest';
import { createAcpToolEvents } from '../src/acp-tool-events.js';

it('keeps ACP titles, joins partial results and ignores duplicate completion', () => {
  const events: Record<string, unknown>[] = [];
  const update = createAcpToolEvents(event => events.push(event));
  update({toolCallId:'a',kind:'read',title:'Inspect site styles',rawInput:{path:'style.css'},status:'in_progress'});
  update({toolCallId:'a',status:'completed',rawOutput:'styles'});
  update({toolCallId:'a',status:'completed'});
  expect(events).toEqual([
    {type:'tool_use',id:'a',name:'read',input:{path:'style.css',description:'Inspect site styles'}},
    {type:'tool_result',toolUseId:'a',content:'styles',isError:false},
  ]);
});
it('preserves failed and cancelled results as errors and accepts result-only calls', () => {
  for (const status of ['failed','cancelled']) {
    const events: Record<string, unknown>[] = [];
    createAcpToolEvents(e=>events.push(e))({toolCallId:status,kind:'edit',status});
    expect(events.at(-1)).toMatchObject({type:'tool_result',isError:true});
  }
});
