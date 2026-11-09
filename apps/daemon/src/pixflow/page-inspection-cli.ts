import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';

/** No prompt or AI execution: the CLI calls the same inspection endpoint as the UI. */
export async function runPageInspectionCli(args:string[]):Promise<void> {
  const {values}=parseArgs({args,strict:true,options:{'bridge-url':{type:'string'},'headers-file':{type:'string'},url:{type:'string'},mobile:{type:'boolean'},json:{type:'boolean'},help:{type:'boolean'}}});
  if(values.help){console.log('od inspect-page --bridge-url http://127.0.0.1:PORT --headers-file PRIVATE_JSON --url PUBLIC_URL [--mobile] --json');return;}
  if(!values['bridge-url']||!values['headers-file']||!values.url)throw Error('Provide Bridge URL, private headers file and public URL.');
  const base=new URL(values['bridge-url']);
  if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw Error('Use the local Bridge URL.');
  const headers:unknown=JSON.parse(await readFile(values['headers-file'],'utf8'));
  if(!headers||typeof headers!=='object'||Array.isArray(headers)||Object.values(headers).some(v=>typeof v!=='string'))throw Error('Invalid authentication headers.');
  const response=await fetch(new URL('/api/pixflow/visual-capture',base),{method:'POST',redirect:'error',signal:AbortSignal.timeout(40000),headers:{...headers as Record<string,string>,'Content-Type':'application/json'},body:JSON.stringify({url:values.url,inspectionOnly:true,viewports:[{id:values.mobile?'mobile':'desktop',width:values.mobile?390:1440,height:900}]})});
  const result=await response.json();
  if(!response.ok)process.exitCode=1;
  process.stdout.write(JSON.stringify(result,null,values.json?undefined:2)+'\n');
}
