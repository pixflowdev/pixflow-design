import fs from 'node:fs/promises';
import { resolveDaemonUrl } from '../daemon-url.js';

/** UI and headless callers share the same local module lifecycle. */
export async function runDictationCli(args: string[]): Promise<void> {
  const action=args[0];
  if(!action || action==='--help'){process.stdout.write('od dictation <status|enable|disable|download|cancel-download|select|delete|transcribe> [--session-file WordPress-session.json] [--model base-q5|small-q5|small] [--audio-file recording.wav] [--language en] [--daemon-url URL] [--json]\n');return;}
  if(!['status','enable','disable','download','cancel-download','select','delete','transcribe'].includes(action))throw new Error('Unknown dictation action.');
  const flags=new Map<string,string>();
  for(let i=1;i<args.length;i++){
    if(args[i]==='--json')continue;
    if(!['--session-file','--model','--audio-file','--language','--daemon-url'].includes(args[i]!) || !args[i+1])throw new Error('Invalid dictation argument.');
    flags.set(args[i]!,args[++i]!);
  }
  const url=await resolveDaemonUrl({flagUrl:flags.get('--daemon-url')??null});
  const audio=flags.get('--audio-file');
  if(action==='transcribe'&&!audio)throw new Error('Supply --audio-file with a PCM WAV recording.');
  const sessionFile=flags.get('--session-file');
  if(!sessionFile)throw new Error('Supply --session-file with a current WordPress direct session for Pro audio.');
  const session=JSON.parse(await fs.readFile(sessionFile,'utf8'));
  const response=await fetch(url.replace(/\/$/,'')+'/api/pixflow/dictation/'+action+'?language='+encodeURIComponent(flags.get('--language')??'auto'),{
    method:'POST',headers:{'X-Pixflow-Audio-Session':JSON.stringify(session),'Content-Type':action==='transcribe'?'audio/wav':'application/json'},
    body:action==='transcribe'?new Uint8Array(await fs.readFile(audio!)):JSON.stringify({model:flags.get('--model')}),
  });
  if(!response.ok)throw new Error(await response.text());
  process.stdout.write(JSON.stringify(await response.json())+'\n');
}
