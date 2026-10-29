import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { test, expect, vi, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { stopChildProcessTree } from '@open-design/platform';
import { discoverClaudeModels } from '../../src/runtimes/claude-models.js';
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('@open-design/platform', async importOriginal => ({...await importOriginal<object>(),stopChildProcessTree:vi.fn(async()=>{})}));
afterEach(()=>vi.clearAllMocks());
function child(output?:unknown){
 const proc=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new Writable({write(data,_encoding,cb){
  const request=JSON.parse(String(data));expect(request.request.subtype).toBe('initialize');expect(request.type).toBe('control_request');
  if(output!==undefined)queueMicrotask(()=>proc.stdout.write(JSON.stringify(output)+'\n'));cb();
 }}),kill:vi.fn()});
 vi.mocked(spawn).mockReturnValue(proc as any);return proc;
}
test('initialization reads only models and terminates without a user prompt',async()=>{
 child({type:'control_response',response:{request_id:'pixflow-models',subtype:'success',response:{models:[{value:'new-model',displayName:'New model'}],account:{email:'not-returned'}}}});
 const result=await discoverClaudeModels('claude',{});
 expect(result?.map(x=>x.id)).toEqual(['default','new-model']);
 expect(JSON.stringify(result)).not.toContain('not-returned');
 expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['--no-session-persistence','--strict-mcp-config','{"disableAllHooks":true}']));
 expect(stopChildProcessTree).toHaveBeenCalledTimes(1);
});
test('timeout terminates a silent runtime and returns no invented catalogue',async()=>{
 child();expect(await discoverClaudeModels('claude',{},15)).toBeNull();expect(stopChildProcessTree).toHaveBeenCalledTimes(1);
});
test('runtime errors and malformed catalogues return unavailable',async()=>{
 child({type:'control_response',response:{request_id:'pixflow-models',subtype:'error'}});
 expect(await discoverClaudeModels('claude',{})).toBeNull();
 child({type:'control_response',response:{request_id:'pixflow-models',subtype:'success',response:{models:'invalid'}}});
 expect(await discoverClaudeModels('claude',{})).toBeNull();
});
