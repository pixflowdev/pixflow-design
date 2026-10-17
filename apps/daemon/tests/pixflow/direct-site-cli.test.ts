import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runDirectSiteCli } from '../../src/pixflow/direct-site-cli.js';

vi.mock('../../src/daemon-url.js',()=>({resolveDaemonUrl:async()=> 'http://127.0.0.1:17457'}));
const dirs:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();process.exitCode=0;await Promise.all(dirs.splice(0).map(dir=>fs.rm(dir,{recursive:true,force:true})));});
describe('Direct HTTP CLI parity',()=>{
  async function privateRequest(){
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'direct-cli-'));dirs.push(dir);
    const file=path.join(dir,'request.json');
    await fs.writeFile(file,JSON.stringify({id:'run',token:'private-continuation',session:{token:'private-wordpress'},afterSequence:4}));
    return {dir,file};
  }
  it.each(['status','cancel','resume','voice-end','voice-preview','history-clear'])('uses the same authenticated %s endpoint without putting secrets in output',async(command)=>{
    const {file}=await privateRequest();
    const fetcher=vi.fn().mockResolvedValue(command==='resume'?new Response('{"type":"done","ok":true,"outcome":"answered"}\n'):Response.json({outcome:'answered'}));vi.stubGlobal('fetch',fetcher);
    const output=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
    await runDirectSiteCli([command,'--request-file',file,'--json']);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`http://127.0.0.1:17457/api/pixflow/direct-site/${command==='resume'?'resume-stream':command}`);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toMatchObject({afterSequence:4,token:'private-continuation',session:{token:'private-wordpress'}});
    expect(output.mock.calls.flat().join('')).not.toContain('private-');
  });
  it('reads long prompts from a file and preserves a failed terminal exit status',async()=>{
    const {dir,file}=await privateRequest();const promptFile=path.join(dir,'prompt.txt');const prompt='A long prompt\nwith literal `code` and $()';await fs.writeFile(promptFile,prompt);
    const fetcher=vi.fn().mockResolvedValue(new Response('{"type":"done","ok":false,"outcome":"interrupted"}\n'));vi.stubGlobal('fetch',fetcher);vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
    await runDirectSiteCli(['start','--request-file',file,'--prompt-file',promptFile,'--json']);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body).prompt).toBe(prompt);expect(process.exitCode).toBe(1);
  });
  it('reports a truncated stream without treating partial text as success',async()=>{
    const {file}=await privateRequest();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"type":"text_delta","delta":"Partial"}\n')));vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
    await expect(runDirectSiteCli(['resume','--request-file',file,'--json'])).rejects.toThrow('transport interrupted');
  });
  it('passes voice offers and returns transient answers through the same JSON stream',async()=>{
    const {file}=await privateRequest();
    await fs.writeFile(file,JSON.stringify({agentId:'codex',prompt:'Voice conversation',voice:{sdp:'test-offer'},session:{token:'private-wordpress'},history:[]}));
    const fetcher=vi.fn().mockResolvedValue(new Response('{"type":"voice_sdp","sdp":"test-answer"}\n{"type":"done","ok":true}\n'));vi.stubGlobal('fetch',fetcher);
    const output=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
    await runDirectSiteCli(['start','--request-file',file,'--json']);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body).voice).toEqual({sdp:'test-offer'});
    expect(output.mock.calls.flat().join('')).toContain('test-answer');
    expect(output.mock.calls.flat().join('')).not.toContain('private-wordpress');
  });
});
