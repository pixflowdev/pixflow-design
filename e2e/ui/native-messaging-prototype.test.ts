import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';

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
    port.onMessage.addListener((message:any)=>{messages.push(message);if(['end','error'].includes(message.type)){clearTimeout(timer);port.disconnect();resolve(messages);}});
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
