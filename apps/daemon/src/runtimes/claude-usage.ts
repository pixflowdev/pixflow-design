import type { CodexUsage } from '@open-design/contracts';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { createCommandInvocation, stopChildProcessTree } from '@open-design/platform';
import { claudeAgentDef } from './defs/claude.js';
import { resolveAgentLaunch, applyAgentLaunchEnv, agentRuntimeSource } from './launch.js';
import { spawnEnvForAgent } from './env.js';

/** Provider percentages are 0–100; unknown/malformed windows never imply unused allowance. */
export function claudeUsageWindows(input: any, model = ''): CodexUsage['windows'] {
 if (input?.rate_limits_available !== true || !input.rate_limits) return [];
 const limits = input.rate_limits, windows: CodexUsage['windows'] = [];
 const matches = (label: string) => {
  const words = model.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).every(word => words.includes(word));
 };
 const add = (bucket: string, minutes: number, value: any) => {
  if (!value || typeof value.utilization !== 'number' || !Number.isFinite(value.utilization) || value.utilization < 0 || value.utilization > 100) return;
  const reset = typeof value.resets_at === 'string' ? Date.parse(value.resets_at) / 1000 : NaN;
  windows.push({bucket,durationMinutes:minutes,remainingPercent:100-value.utilization,resetsAt:Number.isFinite(reset)?reset:null});
 };
 add('claude',300,limits.five_hour); add('claude',10080,limits.seven_day);
 add('Claude Code',10080,limits.seven_day_oauth_apps);
 const scoped = new Map<string,any>();
 for (const family of ['opus','sonnet']) if (limits[`seven_day_${family}`]) scoped.set(family,limits[`seven_day_${family}`]);
 for (const value of Array.isArray(limits.model_scoped) ? limits.model_scoped.slice(0,100) : []) {
  if (typeof value?.display_name === 'string' && value.display_name.trim().length <= 80) scoped.set(value.display_name.trim().toLowerCase(),value);
 }
 // A delegated default has no reliable model identity: do not present shared allowance as complete.
 if (scoped.size && (!model || model === 'default')) return [];
 for (const [label,value] of scoped) if (label && matches(label)) add(value.display_name || label,10080,value);
 return windows;
}

/** Ask the selected runtime's control protocol, never read/copy credentials or generate a model turn. */
export async function readClaudeUsage(executable:string, env:NodeJS.ProcessEnv, source:CodexUsage['source'], model='', timeoutMs=12000):Promise<CodexUsage> {
 const cwd=await mkdtemp(join(tmpdir(),'pixflow-claude-usage-'));
 const empty=():CodexUsage=>({status:'unavailable',source,checkedAt:new Date().toISOString(),windows:[]});
 try { return await new Promise(resolve=>{
  const invocation=createCommandInvocation({command:executable,env,args:['-p','--input-format','stream-json','--output-format','stream-json','--verbose','--no-session-persistence','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--settings','{"disableAllHooks":true}','--setting-sources','user']});
  const child=spawn(invocation.command,invocation.args,{cwd,env,windowsHide:true,windowsVerbatimArguments:invocation.windowsVerbatimArguments,stdio:['pipe','pipe','pipe']});
  let done=false,buffer='',bytes=0,initialized=false;const decoder=new StringDecoder('utf8');
  const finish=(value:CodexUsage)=>{if(done)return;done=true;clearTimeout(timer);child.stdin.end();void stopChildProcessTree(child).catch(()=>{child.kill();}).finally(()=>resolve(value));};
  const timer=setTimeout(()=>finish(empty()),timeoutMs);
  const send=(id:string,subtype:string)=>child.stdin.write(JSON.stringify({type:'control_request',request_id:id,request:{subtype}})+'\n');
  child.on('error',()=>finish(empty()));child.on('close',()=>finish(empty()));child.stdin.on('error',()=>finish(empty()));child.stderr.resume();
  child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2*1024*1024)return finish(empty());buffer+=decoder.write(chunk);let i:number;
   while((i=buffer.indexOf('\n'))>=0&&!done){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const message=JSON.parse(line);if(message.type!=='control_response')continue;
    const response=message.response;if(response?.request_id==='init'&&!initialized){if(response.subtype!=='success')return finish(empty());initialized=true;send('usage','get_usage');}
    else if(response?.request_id==='usage'&&initialized){const windows=response.subtype==='success'?claudeUsageWindows(response.response,model):[];finish({...empty(),status:windows.length?'available':'unavailable',windows});}
   }catch{/* Ignore non-protocol startup output. */}}
  });send('init','initialize');
 }); } finally {await rm(cwd,{recursive:true,force:true});}
}
export async function getClaudeUsage(configured:Record<string,string>,model=''):Promise<CodexUsage>{
 const launch=resolveAgentLaunch(claudeAgentDef,configured);
 if(!launch.launchPath)return {status:'unavailable',source:null,checkedAt:new Date().toISOString(),windows:[]};
 const env=applyAgentLaunchEnv(spawnEnvForAgent('claude',process.env,configured,{}, {resolvedBin:launch.selectedPath}),launch);
 return readClaudeUsage(launch.launchPath,env,agentRuntimeSource(launch),model);
}

