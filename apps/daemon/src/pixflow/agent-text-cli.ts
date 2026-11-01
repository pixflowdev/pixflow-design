import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';

/** Headless clients use the same paired Bridge endpoint as WordPress. No shell prompts or secrets. */
export async function runAgentTextCli(args:string[]):Promise<void> {
  const {values}=parseArgs({args,strict:true,options:{'bridge-url':{type:'string'},'headers-file':{type:'string'},'prompt-file':{type:'string'},agent:{type:'string'},model:{type:'string'},json:{type:'boolean'},help:{type:'boolean'}}});
  if(values.help){console.log('od agent-text --bridge-url http://127.0.0.1:PORT --headers-file PRIVATE_JSON --agent codex|claude --model ID --prompt-file PATH|- --json');return;}
  if(!values['bridge-url']||!values['headers-file']||!values['prompt-file'])throw Error('Provide a Bridge URL, private headers file and prompt file.');
  const base=new URL(values['bridge-url']);
  if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw Error('Use the local Bridge URL.');
  const headers:unknown=JSON.parse(await readFile(values['headers-file'],'utf8'));
  if(!headers||typeof headers!=='object'||Array.isArray(headers)||Object.values(headers).some(value=>typeof value!=='string'))throw Error('Invalid authentication headers.');
  let prompt='';if(values['prompt-file']==='-')for await(const chunk of process.stdin)prompt+=chunk;else prompt=await readFile(values['prompt-file'],'utf8');
  const response=await fetch(new URL('/api/agents/text',base),{method:'POST',redirect:'error',signal:AbortSignal.timeout(130000),headers:{...headers as Record<string,string>,'Content-Type':'application/json'},body:JSON.stringify({agentId:values.agent,model:values.model??'default',prompt})});
  if(!response.ok)throw Error(`Bridge text generation failed (${response.status}).`);
  const result=await response.json();process.stdout.write(JSON.stringify(result,null,values.json?undefined:2)+'\n');
}
