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

it('shows the actual Pixflow tool and receipt when Grok uses its ACP tool dispatcher', () => {
  const events: Record<string, unknown>[] = [];
  const update = createAcpToolEvents(event => events.push(event));
  update({ toolCallId: 'grok', title: 'use_tool', rawInput: {
    tool_name: 'pixflow_builtin__pixflow_call', tool_input: { tool: 'builder.handoff', arguments: { action: 'open' } },
  } });
  update({ toolCallId: 'grok', status: 'completed', rawOutput: {
    type: 'MCP', server_name: 'pixflow_builtin', output: { Error: 'Permission denied' }, is_error: true,
  } });
  expect(events).toEqual([
    { type: 'tool_use', id: 'grok', name: 'pixflow_call',
      input: { tool: 'builder.handoff', arguments: { action: 'open' }, description: 'use_tool' } },
    { type: 'tool_result', toolUseId: 'grok', content: 'Permission denied', isError: true },
  ]);
});
