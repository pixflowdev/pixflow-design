import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { createCommandInvocation, stopChildProcessTree } from '@open-design/platform';
import { codexAgentDef } from './defs/codex.js';
import { claudeAgentDef } from './defs/claude.js';
import { resolveAgentLaunch, applyAgentLaunchEnv, agentRuntimeSource } from './launch.js';
import { spawnEnvForAgent } from './env.js';
import type { AgentTextRequest, AgentTextResponse } from '@open-design/contracts';

/** No project, conversation, editor session, tool credentials or saved run is attached. */
export function textGenerationArgs(agent: 'codex'|'claude', model: string): string[] {
  if (agent === 'claude') return ['-p', '--output-format', 'json', '--tools', '',
    '--disallowedTools', 'mcp__*', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--setting-sources', '',
    ...(model === 'default' ? [] : ['--model', model])];
  return ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules',
    '--skip-git-repo-check', '--sandbox', 'read-only',
    ...['shell_tool','unified_exec','apply_patch_freeform','apps','plugins','multi_agent','multi_agent_v2',
      'hooks','codex_hooks','js_repl','browser_use','computer_use','image_generation','memories','code_mode']
      .flatMap(feature => ['-c', `features.${feature}=false`]),
    '-c', 'mcp_servers={}', '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0',
    '-c', 'approval_policy="never"', '-c', 'default_permissions=":read-only"',
    ...(model === 'default' ? [] : ['--model', model]), '-'];
}

export function validateTextRequest(value: unknown): AgentTextRequest {
  const input=value as Partial<AgentTextRequest>|null;
  if (!input || !['codex','claude'].includes(input.agentId ?? '') || typeof input.model!=='string'
    || !/^[\w][\w./:-]{0,149}$/.test(input.model) || typeof input.prompt!=='string'
    || !input.prompt.trim() || Buffer.byteLength(input.prompt)>100_000) throw Error('Invalid text-generation request.');
  return input as AgentTextRequest;
}

export async function generateAgentText(input: AgentTextRequest, configured: Record<string,string>, root: string, signal?: AbortSignal): Promise<AgentTextResponse> {
  validateTextRequest(input);
  const def=input.agentId==='codex'?codexAgentDef:claudeAgentDef;
  const launch=resolveAgentLaunch(def,configured);
  if(!launch.launchPath)throw Error('The selected agent is unavailable. Check Execution settings.');
  const env=applyAgentLaunchEnv(spawnEnvForAgent(def.id,process.env,configured,{}, {resolvedBin:launch.selectedPath}),launch);
  await mkdir(join(root,'text-generation'),{recursive:true});
  const cwd=await mkdtemp(join(root,'text-generation','request-'));
  try {
    const invocation=createCommandInvocation({command:launch.launchPath,args:textGenerationArgs(input.agentId,input.model),env});
    const text=await new Promise<string>((resolve,reject)=>{
      const child=spawn(invocation.command,invocation.args,{cwd,env,windowsHide:true,
        windowsVerbatimArguments:invocation.windowsVerbatimArguments,stdio:['pipe','pipe','pipe']});
      let settled=false,buffer='',bytes=0,result='',completed=false;
      const decoder=new StringDecoder('utf8');
      const finish=(error?:Error)=>{
        if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
        child.stdin.end();
        void stopChildProcessTree(child).catch(()=>{child.kill();}).finally(()=>error?reject(error):resolve(result));
      };
      const abort=()=>finish(Error('Text generation was interrupted.'));
      const timer=setTimeout(()=>finish(Error('Text generation timed out. Retry the unfinished work.')),120_000);
      signal?.addEventListener('abort',abort,{once:true});
      child.stderr.resume(); // Never expose authentication details or native output in errors.
      child.on('error',()=>finish(Error('The agent could not start. Check Execution settings.')));
      child.stdin.on('error',()=>finish(Error('The agent stopped accepting input.')));
      const consume=(line:string)=>{
        if(!line.trim())return;
        let message:any;try{message=JSON.parse(line);}catch{return;}
        if(input.agentId==='claude') {
          if(message.type==='result'&&!message.is_error&&message.subtype==='success'&&typeof message.result==='string'){
            result=message.result;completed=true;
          }
        } else {
          if(message.type==='item.started' && message.item?.type && !['agent_message','reasoning'].includes(message.item.type)) {
            finish(Error('The agent attempted a tool operation. No translation was accepted.'));return;
          }
          if(message.type==='item.completed'&&message.item?.type==='agent_message') result=message.item.text??'';
          if(message.type==='turn.completed')completed=true;
          if(message.type==='turn.failed'||message.type==='error')finish(Error('The agent could not complete text generation.'));
        }
      };
      child.stdout.on('data',(chunk:Buffer)=>{
        bytes+=chunk.length;if(bytes>1_000_000)return finish(Error('The agent response exceeded the size limit.'));
        buffer+=decoder.write(chunk);let end:number;
        while((end=buffer.indexOf('\n'))>=0&&!settled){consume(buffer.slice(0,end));buffer=buffer.slice(end+1);}
      });
      child.on('close',code=>{
        consume(buffer+decoder.end());
        finish(code===0&&completed&&result.trim()&&Buffer.byteLength(result)<=250_000?undefined:Error('The agent did not return a complete text response.'));
      });
      if(signal?.aborted)abort();else child.stdin.end(input.prompt);
    });
    return {text,source:agentRuntimeSource(launch)};
  } finally { await rm(cwd,{recursive:true,force:true}); }
}
