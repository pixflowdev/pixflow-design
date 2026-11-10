import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {afterEach,expect,test,vi} from 'vitest';
vi.mock('node:child_process',async original=>({...await original<object>(),spawn:vi.fn()}));
vi.mock('@open-design/platform',async original=>({...await original<object>(),stopChildProcessTree:vi.fn(async()=>{})}));
import {spawn} from 'node:child_process';
import {readClaudeUsage} from '../../src/runtimes/claude-usage.js';
afterEach(()=>vi.clearAllMocks());
function child(){const process=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});vi.mocked(spawn).mockReturnValue(process as never);const requests:any[]=[];process.stdin.on('data',chunk=>requests.push(JSON.parse(String(chunk))));return {process,requests,reply:(id:string,response:unknown,subtype='success')=>process.stdout.write(JSON.stringify({type:'control_response',response:{request_id:id,subtype,response}})+'\n')};}
test.each(['desktop','cli'] as const)('%s uses only initialize/get_usage and strips session costs and behavioral data',async source=>{
 const c=child();const pending=readClaudeUsage('claude',{},source,'opus');await vi.waitFor(()=>expect(c.requests).toHaveLength(1));c.reply('init',{});c.reply('usage',{rate_limits_available:true,rate_limits:{five_hour:{utilization:30,resets_at:null}},session:{cost:'private'},behaviors:{private:'transcripts'}});
 const value=await pending;expect(value.windows[0]?.remainingPercent).toBe(70);expect(value.source).toBe(source);expect(JSON.stringify(value)).not.toContain('private');expect(c.requests.map(r=>r.request.subtype)).toEqual(['initialize','get_usage']);
 expect(vi.mocked(spawn).mock.calls[0]?.[1]).toContain('--no-session-persistence');
});
test('unsupported older control protocol returns unavailable',async()=>{const c=child();const pending=readClaudeUsage('claude',{},'cli');await vi.waitFor(()=>expect(c.requests).toHaveLength(1));c.reply('init',{});c.reply('usage',{error:'private'},'error');expect((await pending).status).toBe('unavailable');});
test('stalled runtime is bounded and cleaned up',async()=>{child();expect((await readClaudeUsage('claude',{},'cli','',30)).status).toBe('unavailable');});

