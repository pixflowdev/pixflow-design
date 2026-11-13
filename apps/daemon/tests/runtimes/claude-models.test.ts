import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseClaudeModels, discoverClaudeCatalogue } from '../../src/runtimes/claude-models.js';

test('uses names and IDs returned by the runtime, without adding historical models', () => {
 const result=parseClaudeModels([{value:'opus',displayName:'Current Opus'}, {value:'brand-new-model',displayName:'New model'}, {value:'opus',displayName:'Duplicate'}, {value:'--unsafe',displayName:'Bad'}, {value:'hidden',disabled:true}]);
 assert.deepEqual(result,[{id:'default',label:'Default (CLI config)'},{id:'opus',label:'Current Opus',reasoningOptions:[]},{id:'brand-new-model',label:'New model',reasoningOptions:[]}]);
 assert.equal(parseClaudeModels([]),null);assert.equal(parseClaudeModels({models:[]}),null);
});
test('reports models from the selected executable', async () => {
 const calls:string[]=[];const models=[{id:'runtime-model',label:'Runtime model'}];
 const result=await discoverClaudeCatalogue('desktop',{},async path=>{calls.push(path);return models;});
 assert.deepEqual(calls,['desktop']);assert.deepEqual(result,{models,source:'live'});
});
test('a missing catalogue does not query a different installation', async () => {
 const calls:string[]=[];
 const result=await discoverClaudeCatalogue('desktop',{},async path=>{calls.push(path);return null;});
 assert.deepEqual(calls,['desktop']);assert.equal(result,null);
});

test('a failed launch leaves model discovery unavailable', async () => {
 const result=await discoverClaudeCatalogue('desktop',{},async ()=>{
  throw new Error('runtime unavailable');
 });
 assert.equal(result,null);
});
