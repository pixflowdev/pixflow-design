import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,readFile,copyFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

test('approved installed extension connects automatically and preserves direct mode after restart',async()=>{
 const extension=process.env.PIXFLOW_NATIVE_EXTENSION;
 test.skip(!extension,'Explicit isolated prototype required');
 const config=JSON.parse(await readFile(join(extension!,'config.json'),'utf8'));
 const fixture=await mkdtemp(join(extension!,'popup-extension-'));
 for(const name of ['manifest.json','config.json','background.js','page.js','content.js','popup.js','popup.html','popup.css','brand.svg','icon.png'])await copyFile(join(extension!,name),join(fixture,name));
 const manifest=JSON.parse(await readFile(join(fixture,'manifest.json'),'utf8'));
 const site=new URL(config.sites[0]);manifest.host_permissions=[site.protocol+'//'+site.hostname+'/*'];
 await writeFile(join(fixture,'manifest.json'),JSON.stringify(manifest));
 const profile=await mkdtemp(join(extension!,'popup-profile-'));
 let context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`]});
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const popup=await context.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  // Existing Chrome approval must be enough; no second Connect action.

  await expect(popup.getByRole('heading',{name:'Bridge connected'})).toBeVisible({timeout:15000});
  await expect(popup.getByRole('button',{name:'Check connection'})).toBeEnabled();
  await popup.emulateMedia({colorScheme:'dark'});await popup.locator('body').screenshot({path:test.info().outputPath('installed-connected.png'),animations:'disabled'});
  await popup.reload();await expect(popup.getByRole('heading',{name:'Bridge connected'})).toBeVisible();
  await popup.getByRole('button',{name:'Disconnect this site'}).click();
  await expect(popup.getByRole('heading',{name:'Connect this site'})).toBeVisible();
  const stored=await worker.evaluate(async()=>await (globalThis as any).chrome.storage.local.get('sites'));
  expect(stored.sites).toEqual([]);
  await popup.reload();
  await expect(popup.getByRole('heading',{name:'Connect this site'})).toBeVisible();
  await context.close();
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`]});
  const reopened=await context.newPage();await reopened.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await expect(reopened.getByRole('heading',{name:'Connect this site'})).toBeVisible();
 }finally{await context.close();}
});

test('optional native adapter reaches existing Bridge and preserves site rejection',async()=>{
 const extension=process.env.PIXFLOW_NATIVE_EXTENSION;
 test.skip(!extension,'Explicit isolated prototype build and native registration required');
 const config=JSON.parse(await readFile(join(extension!,'config.json'),'utf8'));
 const profile=await mkdtemp(join(extension!,'browser-test-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const results=await worker.evaluate(async(config)=>{
   const chrome=(globalThis as any).chrome;
   const request=(origin:string,headers:Record<string,string>={},path='/api/health')=>new Promise<any[]>((resolve,reject)=>{
    const port=chrome.runtime.connectNative('dev.pixflow.bridge_prototype'),messages:any[]=[];
    const timer=setTimeout(()=>{port.disconnect();reject(new Error('Native host timeout'));},15000);
    port.onMessage.addListener((message:any)=>{messages.push(message);if(message.type==='chunk')port.postMessage({id:message.id,type:'ack'});if(['end','error'].includes(message.type)){clearTimeout(timer);port.disconnect();resolve(messages);}});
    port.onDisconnect.addListener(()=>{const error=chrome.runtime.lastError;if(error){clearTimeout(timer);reject(new Error(error.message));}});
    port.postMessage({id:'browser-test',origin,url:config.bridge+path,headers});
   });
   return {health:await request(config.sites[0]),denied:await request('https://not-approved.invalid'),mismatch:await request(config.sites[0],{'X-Pixflow-Site-Key':'unpaired-prototype-site'},'/api/pixflow/site-context'),recovered:await request(config.sites[0])};
  },config);
  expect(results.health[0]).toMatchObject({type:'headers',status:200});
  expect(results.health.at(-1)).toMatchObject({type:'end'});
  expect(results.denied).toHaveLength(1);expect(results.denied[0].type).toBe('error');
  const baseline=await fetch(config.bridge+'/api/pixflow/site-context',{headers:{Origin:config.sites[0],'X-Pixflow-Site-Key':'unpaired-prototype-site'}});
  expect(results.mismatch[0]).toMatchObject({type:'headers',status:baseline.status});
  expect(results.recovered[0]).toMatchObject({type:'headers',status:200});
  await test.info().attach('native-results',{body:JSON.stringify({healthStatus:results.health[0].status,denied:results.denied[0].type,mismatchStatus:results.mismatch[0].status}),contentType:'application/json'});
 }finally{await context.close();}
});

test('real CLI streams, steers and reconnects after approved-site navigation',async()=>{
 test.setTimeout(300000);
 const extension=process.env.PIXFLOW_NATIVE_EXTENSION;
 test.skip(!extension||process.env.PIXFLOW_NATIVE_REAL_CLI!=='1','Explicit real CLI acceptance opt-in required');
 const config=JSON.parse(await readFile(join(extension!,'config.json'),'utf8'));
 const fixture=await mkdtemp(join(extension!,'acceptance-'));
 for(const name of ['manifest.json','config.json','background.js','page.js','content.js','popup.js','popup.html','popup.css','brand.svg','icon.png'])await copyFile(join(extension!,name),join(fixture,name));
 const manifest=JSON.parse(await readFile(join(fixture,'manifest.json'),'utf8'));
 // Pre-approved only in this disposable test profile. Production uses the popup permission request.
 const site=new URL(config.sites[0]);manifest.host_permissions=[site.protocol+'//'+site.hostname+'/*'];
 await writeFile(join(fixture,'manifest.json'),JSON.stringify(manifest));
 const profile=await mkdtemp(join(extension!,'real-profile-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`]});
 let runId='';
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const page=await context.newPage();page.setDefaultTimeout(20000);console.log('Opening isolated page');await page.goto(config.sites[0]+'/?page_id=10',{waitUntil:'domcontentloaded'});console.log('Isolated page opened');
  // Browser localhost HTTP is deliberately unavailable: passing requires native messaging.
  await context.route(config.bridge+'/**',route=>route.abort('blockedbyclient'));
  const popup=await context.newPage();popup.setDefaultTimeout(20000);await popup.goto(`chrome-extension://${id}/popup.html`);
  console.log('Enabling extension transport');await popup.getByRole('button',{name:'Connect to Pixflow Bridge'}).click();
  await expect(popup.getByRole('button',{name:'Disconnect this site'})).toBeVisible();
  await page.waitForFunction(()=>Boolean((window as any).__PIXFLOW_NATIVE_PROTOTYPE__));
  const binding=JSON.parse(await readFile(join(extension!,'session.private.json'),'utf8'));
  const call=async(path:string,body?:unknown)=>page.evaluate(async({url,body,session})=>{
   const response=await (window as any).__PIXFLOW_DESIGN_NATIVE_FETCH__(url,body?{method:'POST',headers:{'Content-Type':'application/json','X-Pixflow-Site-Key':'team-real-qa',...(url.endsWith('/api/runs')?{'X-Pixflow-Workspace-Session':JSON.stringify(session)}:{})},body:JSON.stringify(body)}:{});
   return {status:response.status,body:await response.json()};
  },{url:config.bridge+path,body,session:{endpoint:binding.session.endpoint,token:binding.session.token,expiresAt:binding.session.expiresAt}});
  console.log('Checking page-to-native health');expect((await call('/api/health')).status).toBe(200);console.log('Native health passed');
  const project=await call('/api/projects',{id:binding.projectId,name:'Native extension acceptance '+Date.now(),metadata:{skipDiscoveryBrief:true}});
  console.log('Project response',project.status,project.status>=300?project.body.error:'created');expect(project.status).toBeLessThan(300);
  const projectId=project.body.project?.id||project.body.id;
  expect(projectId).toBeTruthy();
  const run=await call('/api/runs',{agentId:'codex',model:'gpt-6.1-sol',reasoning:'low',projectId,conversationId:binding.conversationId,sessionMode:'chat',skipDiscoveryBrief:true,message:'This is a synthetic transport test. Do not use tools or change any files. Write a numbered list of 80 short practical ideas for a fictional community book club, with one sentence explaining each. Start directly with the list.'});
  console.log('Run response',run.status);expect(run.status).toBe(202);runId=run.body.runId;expect(runId).toBeTruthy();
  await page.evaluate(({url})=>{
   (window as any).nativeEvents='';(window as any).nativeChunks=0;
   void (async()=>{const r=await (window as any).__PIXFLOW_DESIGN_NATIVE_FETCH__(url);const reader=r.body.getReader(),decoder=new TextDecoder();for(;;){const x=await reader.read();if(x.done)break;(window as any).nativeChunks++;(window as any).nativeEvents+=decoder.decode(x.value,{stream:true});}})().catch(e=>{(window as any).nativeStreamError=String(e);});
  },{url:config.bridge+'/api/runs/'+runId+'/events'});
  await page.waitForFunction(()=>/text_delta/.test((window as any).nativeEvents),undefined,{timeout:180000});
  const steer=await call('/api/runs/'+runId+'/steer',{messageId:crypto.randomUUID(),prompt:'Please finish with the exact phrase NATIVE STEER CONFIRMED. Keep this text-only and do not use tools.'});
  expect(['accepted','queued'],JSON.stringify(steer.body)).toContain(steer.body.state);
  const before=await page.evaluate(()=>({chunks:(window as any).nativeChunks,events:(window as any).nativeEvents}));
  expect(before.chunks).toBeGreaterThan(1);
  await page.goto(config.sites[0]+'/wp-admin/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean((window as any).__PIXFLOW_NATIVE_PROTOTYPE__));
  console.log('Checking page-to-native health');expect((await call('/api/health')).status).toBe(200);console.log('Native health passed');
  const reattached=await page.evaluate(async(url)=>{const response=await (window as any).__PIXFLOW_DESIGN_NATIVE_FETCH__(url);return response.text();},config.bridge+'/api/runs/'+runId+'/events');
  const deltas=String(reattached).split('\n').filter(line=>line.startsWith('data:')).flatMap(line=>{try{const e=JSON.parse(line.slice(5));return e.type==='text_delta'?[e.delta]:[];}catch{return [];}}).join('');
  expect(deltas).toContain('NATIVE STEER CONFIRMED');
  const status=await call('/api/runs/'+runId);expect(status.body.status).toBe('succeeded');
  const runs=await call('/api/runs?projectId='+encodeURIComponent(projectId));expect(runs.body.runs).toHaveLength(1);
  await popup.getByRole('button',{name:'Disconnect this site'}).click();
  await expect(popup.getByRole('button',{name:'Connect to Pixflow Bridge'})).toBeVisible();
  await context.unroute(config.bridge+'/**');console.log('Checking page-to-native health');expect((await call('/api/health')).status).toBe(200);console.log('Native health passed');
  await test.info().attach('real-cli-result',{body:JSON.stringify({runId,projectId,steer:steer.body.state,chunks:before.chunks,completed:true,navigation:true,directRestored:true}),contentType:'application/json'});
 }finally{
  if(runId){const status=await fetch(config.bridge+'/api/runs/'+runId).then(r=>r.json());if(!['succeeded','completed','failed','canceled','cancelled'].includes(status.status))await fetch(config.bridge+'/api/runs/'+runId+'/cancel',{method:'POST'});}
  await context.close();
 }
});


test('interactive Chrome site approval connects without opening the extension popup',async()=>{
 test.skip(process.env.PIXFLOW_NATIVE_MANUAL_APPROVAL!=='1','Requires the user to accept the real Chrome site-access request');
 test.setTimeout(240000);
 const extension=process.env.PIXFLOW_NATIVE_EXTENSION!;
 const config=JSON.parse(await readFile(join(extension,'config.json'),'utf8'));
 const fixture=await mkdtemp(join(extension,'automatic-extension-'));
 for(const name of ['manifest.json','config.json','background.js','page.js','content.js','popup.js','popup.html','popup.css','brand.svg','icon.png'])await copyFile(join(extension,name),join(fixture,name));
 const profile=await mkdtemp(join(extension,'automatic-profile-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,args:[`--disable-extensions-except=${fixture}`,`--load-extension=${fixture}`]});
 try{
  const initialWorker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const initialPermissions=await initialWorker.evaluate(async()=>await (globalThis as any).chrome.permissions.getAll());
  expect(initialPermissions.origins||[]).toEqual([]);
  // Synthetic page at the isolated approved origin: this checks Chrome permission, not WordPress authoring.
  await context.route(config.sites[0]+'/**',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><title>Pixflow connection approval test</title><h1>Pixflow connection approval test</h1><p>Allow the extension for this isolated site using Chrome�s site-access control. No existing WordPress content is loaded or changed.</p>'}));
  const page=await context.newPage();await page.goto(config.sites[0],{waitUntil:'domcontentloaded'});
  await context.route(config.bridge+'/**',route=>route.abort('blockedbyclient'));
  console.log('Awaiting the user to approve Chrome site access in the isolated browser.');
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const site=new URL(config.sites[0]);
  await expect.poll(async()=>worker.evaluate(async(pattern)=>{const permissions=await (globalThis as any).chrome.permissions.getAll();return (permissions.origins||[]).includes(pattern);},site.protocol+'//'+site.hostname+'/*'),{timeout:200000}).toBe(true);
  await page.waitForFunction(()=>Boolean((window as any).__PIXFLOW_NATIVE_PROTOTYPE__),undefined,{timeout:200000});
  const health=await page.evaluate(async(url)=>{const r=await fetch(url+'/api/health');return r.status;},config.bridge);
  expect(health).toBe(200);
  await page.reload();
  await page.waitForFunction(()=>Boolean((window as any).__PIXFLOW_NATIVE_PROTOTYPE__));
  expect(await page.evaluate(async(url)=>(await fetch(url+'/api/health')).status,config.bridge)).toBe(200);
 }finally{await context.close();}
});
