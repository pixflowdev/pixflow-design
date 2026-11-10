import { assertCodexReasoningSupported } from './defs/shared.js';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { createCommandInvocation, stopChildProcessTree } from '@open-design/platform';
import { codexAgentDef } from './defs/codex.js';
import { claudeAgentDef } from './defs/claude.js';
import { grokBuildAgentDef } from './defs/grok-build.js';
import { resolveAgentLaunch, applyAgentLaunchEnv, agentRuntimeSource } from './launch.js';
import { spawnEnvForAgent } from './env.js';
import type { AgentTextRequest, AgentTextResponse } from '@open-design/contracts';
import { agentTextTimeoutMs } from '@open-design/contracts';

/** Accept only public text and a successful terminal event from native Grok JSONL. */
export function createGrokTextCollector() {
  let text='',complete=false;
  return {
    get text(){return text;}, get complete(){return complete;},
    accept(message:Record<string,unknown>) {
      if(message.type==='tool_call'||message.type==='tool_call_update')throw Error('The agent attempted a tool operation. No text was accepted.');
      if(message.type==='text'&&typeof message.data==='string')text+=message.data;
      if(message.type==='end') {
        complete=['end_turn','stop'].includes(String(message.stopReason));
        if(!complete)throw Error('The agent did not return a complete text response.');
      }
      if(message.type==='error') {
        const detail=JSON.stringify(message.error??message.message??'');
        throw Error(/rate.limit|too many requests|concurren|\b429\b/i.test(detail)?'Provider concurrency limited.':'The agent could not complete text generation.');
      }
    },
  };
}

/** No project, conversation, editor session, tool credentials or saved run is attached. */
export function textGenerationArgs(agent: AgentTextRequest['agentId'], model: string, reasoning?:AgentTextRequest['reasoning'], promptFile?:string): string[] {
  if(agent==='codex') assertCodexReasoningSupported(reasoning);
  if(agent==='grok-build') {
    if(!promptFile)throw Error('Grok requires a private prompt file.');
    // Grok treats an empty CSV as no allowlist. Allow one MCP meta-tool, then
    // deny both meta-tools; the resulting intersection exposes no tools.
    const effort=reasoning??(grokBuildAgentDef.modelReasoningOptions(model).some(option=>option.id==='medium')?'medium':undefined);
    return ['--prompt-file',promptFile,'--output-format','streaming-json','--tools','search_tool',
      '--disallowed-tools','search_tool,use_tool','--deny','*','--permission-mode','dontAsk',
      '--no-subagents','--disable-web-search','--max-turns','1','--verbatim',
      ...(model==='default'?[]:['--model',model]),...(effort?['--effort',effort]:[])];
  }
  if (agent === 'claude') return ['-p', '--output-format', 'json', '--tools', '',
    '--disallowedTools', 'mcp__*', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--setting-sources', '',
    ...(model === 'default' ? [] : ['--model', model])];
  return ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules',
    '--skip-git-repo-check', '--sandbox', 'read-only',
    ...['shell_tool','unified_exec','apply_patch_freeform','apps','plugins','multi_agent','multi_agent_v2',
      'hooks','codex_hooks','js_repl','browser_use','computer_use','image_generation','memories','code_mode']
      .flatMap(feature => ['-c', `features.${feature}=false`]),
    ...(reasoning ? ['-c', 'model_reasoning_effort='+JSON.stringify(reasoning)] : []),
    '-c', 'mcp_servers={}', '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0',
    '-c', 'approval_policy="never"', '-c', 'default_permissions=":read-only"',
    ...(model === 'default' ? [] : ['--model', model]), '-'];
}

export function validateTextRequest(value: unknown): AgentTextRequest {
  const input=value as Partial<AgentTextRequest>|null;
  if (!input || !['codex','claude','grok-build'].includes(input.agentId ?? '') || typeof input.model!=='string'
    || !/^[\w][\w./:-]{0,149}$/.test(input.model) || typeof input.prompt!=='string'
    || !input.prompt.trim() || Buffer.byteLength(input.prompt)>100_000) throw Error('Invalid text-generation request.');
  if(input.reasoning !== undefined && !(input.agentId==='codex'
    ? ['low','medium','high','xhigh','max'].includes(input.reasoning)
    : input.agentId==='grok-build' && grokBuildAgentDef.modelReasoningOptions(input.model).some(option=>option.id===input.reasoning))) throw Error('Invalid reasoning effort.');
  return input as AgentTextRequest;
}

export async function generateAgentText(input: AgentTextRequest, configured: Record<string,string>, root: string, signal?: AbortSignal): Promise<AgentTextResponse> {
  validateTextRequest(input);
  const def=input.agentId==='codex'?codexAgentDef:input.agentId==='grok-build'?grokBuildAgentDef:claudeAgentDef;
  const launch=resolveAgentLaunch(def,configured);
  if(!launch.launchPath)throw Error('The selected agent is unavailable. Check Execution settings.');
  const env=applyAgentLaunchEnv(spawnEnvForAgent(def.id,process.env,configured,{}, {resolvedBin:launch.selectedPath}),launch);
  await mkdir(join(root,'text-generation'),{recursive:true});
  const cwd=await mkdtemp(join(root,'text-generation','request-'));
  try {
    const promptFile=join(cwd,'prompt.txt');
    if(input.agentId==='grok-build') {
      await writeFile(promptFile,input.prompt,{encoding:'utf8',mode:0o600});
      // Keep native OAuth in its original home; never clone refresh tokens for workers.
      Object.assign(env,{GROK_DISABLE_AUTOUPDATER:'1',GROK_SUBAGENTS:'0',GROK_MEMORY:'0',GROK_WEB_FETCH:'0'});
    }
    const invocation=createCommandInvocation({command:launch.launchPath,args:textGenerationArgs(input.agentId,input.model,input.reasoning,promptFile),env});
    const text=await new Promise<string>((resolve,reject)=>{
      const child=spawn(invocation.command,invocation.args,{cwd,env,windowsHide:true,
        windowsVerbatimArguments:invocation.windowsVerbatimArguments,stdio:['pipe','pipe','pipe']});
      let settled=false,buffer='',bytes=0,result='',completed=false;
      const decoder=new StringDecoder('utf8');
      const grok=createGrokTextCollector();
      const finish=(error?:Error)=>{
        if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
        child.stdin.end();
        void stopChildProcessTree(child).catch(()=>{child.kill();}).finally(()=>error?reject(error):resolve(result));
      };
      const abort=()=>finish(Error('Text generation was interrupted.'));
      const timer=setTimeout(()=>finish(Error('Text generation timed out. Retry the unfinished work.')),agentTextTimeoutMs(input.agentId));
      signal?.addEventListener('abort',abort,{once:true});
      child.stderr.resume(); // Never expose authentication details or native output in errors.
      child.on('error',()=>finish(Error('The agent could not start. Check Execution settings.')));
      child.stdin.on('error',()=>finish(Error('The agent stopped accepting input.')));
      const consume=(line:string)=>{
        if(!line.trim())return;
        let message:any;try{message=JSON.parse(line);}catch{return;}
        if(input.agentId==='claude') {
          if(message.type==='result'&&message.is_error&&/rate.limit|too many requests|concurren|\b429\b/i.test(String(message.result??''))){
            finish(Error('Provider concurrency limited.'));return;
          }
          if(message.type==='result'&&!message.is_error&&message.subtype==='success'&&typeof message.result==='string'){
            result=message.result;completed=true;
          }
        } else if(input.agentId==='grok-build') {
          try {grok.accept(message);result=grok.text;completed=grok.complete;}
          catch(error){finish(error as Error);}
        } else {
          if(message.type==='item.started' && message.item?.type && !['agent_message','reasoning'].includes(message.item.type)) {
            finish(Error('The agent attempted a tool operation. No translation was accepted.'));return;
          }
          if(message.type==='item.completed'&&message.item?.type==='agent_message') result=message.item.text??'';
          if(message.type==='turn.completed')completed=true;
          if(message.type==='turn.failed'||message.type==='error'){
            const detail=JSON.stringify(message.error??message.message??'');
            finish(Error(/rate.limit|too many requests|concurren|\b429\b/i.test(detail)?'Provider concurrency limited.':'The agent could not complete text generation.'));
          }
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
      if(signal?.aborted)abort();else child.stdin.end(input.agentId==='grok-build'?undefined:input.prompt);
    });
    return {text,source:agentRuntimeSource(launch)};
  } finally { await rm(cwd,{recursive:true,force:true}); }
}
