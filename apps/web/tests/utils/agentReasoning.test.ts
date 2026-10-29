import { expect, test } from 'vitest';
import { agentReasoningOptions } from '../../src/utils/agentReasoning';
const agent = { id:'claude',name:'Claude',bin:'claude',available:true, models:[
 {id:'opus',label:'Opus',reasoningOptions:[{id:'max',label:'Max'}]},
 {id:'haiku',label:'Haiku',reasoningOptions:[]},
] };
test('selected model controls effort without leaking choices to unsupported models',()=>{
 expect(agentReasoningOptions(agent,'opus')).toEqual([{id:'max',label:'Max'}]);
 expect(agentReasoningOptions(agent,'haiku')).toEqual([]);
 expect(agentReasoningOptions(agent,'custom')).toEqual([]);
 expect(agentReasoningOptions({...agent,reasoningOptions:[{id:'high',label:'High'}]},'haiku')).toEqual([]);
});
test('existing agents retain their agent-wide effort options',()=>{
 expect(agentReasoningOptions({id:'codex',name:'Codex',bin:'codex',available:true,reasoningOptions:[{id:'high',label:'High'}]},'model')).toEqual([{id:'high',label:'High'}]);
});
