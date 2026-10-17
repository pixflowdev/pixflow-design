import { expect, it } from 'vitest';
import { createJsonEventStreamHandler } from '../src/json-event-stream.js';

it('normalizes Antigravity tool steps and streams prose without duplicating the final response', () => {
  const events: Record<string, unknown>[] = [];
  const parser = createJsonEventStreamHandler('antigravity', e=>events.push(e));
  const lines = [
    {event:'init'},
    {event:'step_update',step_update:{conversation_id:'test',step_index:1,step_type:'tool',state:'ACTIVE',tool_name:'read_file',tool_info:{parameters:{path:'style.css'}}}},
    {event:'step_update',step_update:{conversation_id:'test',step_index:1,step_type:'tool',state:'DONE',tool_info:{output:'styles'}}},
    {event:'step_update',step_update:{step_type:'agent_response',text_delta:'Reviewed.'}},
    {event:'result',result:{status:'SUCCESS',response:'Reviewed.'}},
  ].map(v=>JSON.stringify(v)).join('\n');
  for (const char of lines) parser.feed(char);
  parser.flush();
  expect(events.filter(e=>e.type==='tool_use')).toHaveLength(1);
  expect(events.find(e=>e.type==='tool_result')).toMatchObject({isError:false,content:'styles'});
  expect(events.filter(e=>e.type==='text_delta')).toEqual([{type:'text_delta',delta:'Reviewed.'}]);
});
it('keeps tool errors and provider failures visible', () => {
  const events: Record<string, unknown>[] = [];
  const parser=createJsonEventStreamHandler('antigravity',e=>events.push(e));
  parser.feed(JSON.stringify({event:'step_update',step_update:{step_index:2,step_type:'tool',state:'ERROR',tool_info:{error:{message:'Denied'}}}})+'\n');
  parser.feed(JSON.stringify({event:'result',result:{status:'ERROR',error:'Sign in required'}})+'\n');
  expect(events.find(e=>e.type==='tool_result')).toMatchObject({isError:true});
  expect(events.at(-1)).toMatchObject({type:'error',message:'Sign in required'});
});
