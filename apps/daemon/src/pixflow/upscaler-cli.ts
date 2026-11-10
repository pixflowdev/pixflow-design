import fs from 'node:fs/promises';
import { resolveDaemonUrl } from '../daemon-url.js';

export async function runUpscalerCli(args: string[]) {
  const [action,...options]=args;
  if(!action || action==='--help'){
    process.stdout.write('od upscaler <status|enable|disable|install|run|remove> --session-file session.json [--model photo2|photo4|art4] [--noise -1|0|1|2|3] [--input image.png --output copy.png] [--daemon-url URL] [--json]\n');
    return;
  }
  if(!['status','install','run','remove','enable','disable'].includes(action))throw new Error('Unknown upscaler action.');
  const flags=new Map<string,string>();
  for(let i=0;i<options.length;i++){
    const key=options[i]!;
    if(key==='--json')continue;
    if(!['--session-file','--model','--noise','--input','--output','--daemon-url'].includes(key) || !options[i+1])throw new Error('Invalid upscaler argument.');
    flags.set(key,options[++i]!);
  }
  if(!flags.has('--session-file'))throw new Error('Supply a current WordPress session.');
  if(action==='run' && (!flags.has('--input') || !flags.has('--output')))throw new Error('Supply --input and a new --output filename.');
  const session=JSON.parse(await fs.readFile(flags.get('--session-file')!,'utf8'));
  const url=await resolveDaemonUrl({flagUrl:flags.get('--daemon-url')??null});
  const png=action==='run'?(await fs.readFile(flags.get('--input')!)).toString('base64'):undefined;
  const res=await fetch(url.replace(/\/$/,'')+'/api/pixflow/upscaler/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,png,noise:flags.has('--noise')?Number(flags.get('--noise')):undefined,model:flags.get('--model')})});
  const result=await res.json() as { message?: string; png?: string };
  if(!res.ok)throw new Error(result.message||'Upscaler unavailable.');
  if(action==='run'){
    if(!result.png)throw new Error('Bridge returned no image.');
    await fs.writeFile(flags.get('--output')!,Buffer.from(result.png,'base64'),{flag:'wx'});
    process.stdout.write(JSON.stringify({output:flags.get('--output')})+'\n');
  }else process.stdout.write(JSON.stringify(result)+'\n');
}
