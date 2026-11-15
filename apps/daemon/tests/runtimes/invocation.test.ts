import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createAgentInvocation, execAgentFile } from '../../src/runtimes/invocation.js';

describe('provider invocation', () => {
  it('preserves native executables and arguments without a shell', () => {
    const args = ['literal %PATH%', 'spaces & symbols', '"quoted"'];
    expect(createAgentInvocation({command:process.execPath,args})).toEqual({command:process.execPath,args});
  });
  it('uses the same runtime for script probes and execution', async () => {
    const root=await mkdtemp(path.join(tmpdir(),'provider-launch-'));
    try {
      const script=path.join(root,'provider with spaces.mjs');
      await writeFile(script,'console.log(JSON.stringify(process.argv.slice(2)))');
      const args=['literal %PATH%', 'space & bang!', 'café 日本', '{"name":"quote"}'];
      const invocation=createAgentInvocation({command:script,args});
      expect(invocation.command).toBe(process.execPath);
      const output=await new Promise<string>((resolve,reject)=>{
        const child=spawn(invocation.command,invocation.args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PSExecutionPolicyPreference:'Restricted'}});
        let text='';child.stdout.on('data',chunk=>text+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(text):reject(new Error(String(code))));
      });
      expect(JSON.parse(output)).toEqual(args);
      const probe=await execAgentFile(script,args);
      expect(JSON.parse(String(probe.stdout))).toEqual(args);
    } finally {await rm(root,{recursive:true,force:true});}
  });
  it.runIf(process.platform==='win32')('keeps the required cmd compatibility path for batch wrappers',()=>{
    const invocation=createAgentInvocation({command:'C:\\CLI folder\\agent.cmd',args:['--version']});
    expect(invocation.command.toLowerCase()).toMatch(/cmd\.exe$/);
    expect(invocation.windowsVerbatimArguments).toBe(true);
    expect(invocation.args.slice(0,3)).toEqual(['/d','/s','/c']);
  });
});
