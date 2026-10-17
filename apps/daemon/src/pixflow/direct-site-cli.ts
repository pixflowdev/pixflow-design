import fs from 'node:fs/promises';
import { resolveDaemonUrl } from '../daemon-url.js';

const usage='od direct-site <start|resume|status|cancel|steer|voice-end|voice-preview|history-clear> --request-file <path|-> [--prompt-file <path|->] [--daemon-url <url>] [--json]\nThe private request file contains the same authenticated session/identity JSON used by the floating panel. start uses PixflowDirectSiteRunRequest; history-clear uses PixflowDirectToolHistoryRequest ({session}); lifecycle actions use PixflowDirectSiteContinuationRequest. resume reconnects to existing output and never starts another agent.\nCodex voice: include voice.sdp from your WebRTC audio client and use --json to receive the transient voice_sdp answer. Keep the stream open for the call. voice-end mutes via your audio client and closes after active work finishes; cancel stops work immediately; resume retrieves transcript only, never a live audio session.';
async function stdin():Promise<string>{const chunks:Buffer[]=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks).toString('utf8');}

/** Headless callers use exactly the panel's HTTP lifecycle and ownership contract. */
export async function runDirectSiteCli(args:string[]):Promise<void>{
  const command=args[0];
  if(!command || ['help','--help','-h'].includes(command)){process.stdout.write(usage+'\n');return;}
  if(!['start','resume','status','cancel','steer','voice-end','voice-preview','history-clear'].includes(command))throw new Error('Unknown Direct command. '+usage);
  const flags=new Map<string,string|boolean>();
  for(let i=1;i<args.length;i++){
    const flag=args[i]!;if(flag==='--json'){flags.set(flag,true);continue;}
    if(!['--request-file','--prompt-file','--daemon-url'].includes(flag)||!args[i+1])throw new Error('Invalid Direct command argument. '+usage);
    flags.set(flag,args[++i]!);
  }
  const requestFile=flags.get('--request-file');
  if(typeof requestFile!=='string')throw new Error('Supply a private --request-file; credentials are not accepted in command arguments.');
  const promptFile=flags.get('--prompt-file');
  if(requestFile==='-' && promptFile==='-')throw new Error('Only one input can consume stdin.');
  const raw=requestFile==='-'?await stdin():await fs.readFile(requestFile,'utf8');
  const body=JSON.parse(raw.replace(/^\ufeff/,'')) as Record<string,unknown>;
  if(!body || typeof body!=='object' || Array.isArray(body))throw new Error('The Direct request must be a JSON object.');
  if(typeof promptFile==='string')body.prompt=promptFile==='-'?await stdin():await fs.readFile(promptFile,'utf8');
  const url=await resolveDaemonUrl({flagUrl:typeof flags.get('--daemon-url')==='string'?String(flags.get('--daemon-url')):null});
  const route=command==='start'?'run-stream':command==='resume'?'resume-stream':command;
  const response=await fetch(url.replace(/\/$/,'')+'/api/pixflow/direct-site/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(await response.text());
  if(command==='steer'||command==='status'||command==='cancel'||command==='voice-end'||command==='voice-preview'||command==='history-clear'){process.stdout.write(JSON.stringify(await response.json())+'\n');return;}
  if(!response.body)throw new Error('Direct stream is unavailable.');
  const decoder=new TextDecoder();let buffer='';let finished=false;
  const accept=(line:string)=>{
    if(!line.trim())return;
    const event=JSON.parse(line) as Record<string,unknown>;
    if(flags.get('--json'))process.stdout.write(JSON.stringify(event)+'\n');
    else if(event.type==='text_delta' && typeof event.delta==='string')process.stdout.write(event.delta);
    if(event.type==='done'){finished=true;if(event.ok!==true)process.exitCode=1;}
  };
  for await(const chunk of response.body){buffer+=decoder.decode(chunk,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()||'';lines.forEach(accept);}
  buffer+=decoder.decode();if(buffer)accept(buffer);
  if(!finished)throw new Error('Direct transport interrupted. Use resume to retrieve the existing run.');
}

