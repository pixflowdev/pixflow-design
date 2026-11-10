import { expect, it } from 'vitest';
import { translateAgentEvent } from '../../src/providers/daemon';
it('preserves tool results as results instead of treating their text as thinking',()=>{
 expect(translateAgentEvent({type:'tool_result',toolUseId:'a',content:'Read the file',isError:false})).toEqual({kind:'tool_result',toolUseId:'a',content:'Read the file',isError:false});
 expect(translateAgentEvent({type:'tool_result',toolUseId:'b',content:'Failed',isError:true})).toEqual({kind:'tool_result',toolUseId:'b',content:'Failed',isError:true});
});

it('settles provider replies without treating a tool-use pause as completion', () => {
 expect(translateAgentEvent({type:'turn_end',stopReason:'end_turn'})).toEqual({kind:'status',label:'response_complete'});
 expect(translateAgentEvent({type:'turn_end',stop_reason:'stop'})).toEqual({kind:'status',label:'response_complete'});
 expect(translateAgentEvent({type:'turn_end',stopReason:'tool_use'})).toBeNull();
});
