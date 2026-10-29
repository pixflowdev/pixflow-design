import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseClaudeModels, discoverClaudeCatalogue } from '../../src/runtimes/claude-models.js';

test('uses names and IDs returned by the runtime, without adding historical models', () => {
 const result=parseClaudeModels([{value:'opus',displayName:'Current Opus'}, {value:'brand-new-model',displayName:'New model'}, {value:'opus',displayName:'Duplicate'}, {value:'--unsafe',displayName:'Bad'}, {value:'hidden',disabled:true}]);
 assert.deepEqual(result,[{id:'default',label:'Default (CLI config)'},{id:'opus',label:'Current Opus',reasoningOptions:[]},{id:'brand-new-model',label:'New model',reasoningOptions:[]}]);
 assert.equal(parseClaudeModels([]),null);assert.equal(parseClaudeModels({models:[]}),null);
});
test('desktop wins; standalone CLI is never called when desktop reports models', async () => {
 const calls:string[]=[];const models=[{id:'runtime-model',label:'Runtime model'}];
 const result=await discoverClaudeCatalogue('desktop','old-cli',{},async path=>{calls.push(path);return models;});
 assert.deepEqual(calls,['desktop']);assert.deepEqual(result,{models,source:'live'});
});
test('CLI fallback is discovered live and labelled; failure never invents models',async()=>{
 const calls:string[]=[];const models=[{id:'cli-model',label:'CLI model'}];
 const result=await discoverClaudeCatalogue('desktop','old-cli',{},async path=>{calls.push(path);return path==='old-cli'?models:null;});
 assert.deepEqual(calls,['desktop','old-cli']);assert.deepEqual(result,{models,source:'cli-fallback'});
 assert.equal(await discoverClaudeCatalogue('desktop','old-cli',{},async()=>null),null);
 let count=0;assert.equal(await discoverClaudeCatalogue('cli','cli',{},async()=>{count++;return null;}),null);assert.equal(count,1);
});

test('a failed desktop launch still permits live CLI discovery', async () => {
 const result=await discoverClaudeCatalogue('desktop','cli',{},async path=>{
  if(path==='desktop')throw new Error('runtime unavailable');
  return [{id:'reported-by-cli',label:'CLI model'}];
 });
 assert.equal(result?.source,'cli-fallback');
 assert.deepEqual(result?.models.map(model=>model.id),['reported-by-cli']);
});
