import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve(import.meta.dirname,'../../.tmp/native-messaging-prototype');
test('popup connects, recovers and disconnects without replaying runs',async({page})=>{
 await page.addInitScript(()=>{
  const state=(window as any).fixture={enabled:false,allowed:false,result:'connected',requests:[] as string[]};
  (window as any).chrome={tabs:{query:async()=>[{url:'https://example.test/wp-admin/'}]},permissions:{request:async()=>state.allowed},runtime:{sendMessage:async(message:any)=>{
   state.requests.push(message.type);
   if(message.type==='configuration')return {sites:['https://example.test'],enabled:[]};
   if(message.type==='enable'){state.enabled=true;return {ok:true};}
   if(message.type==='disable'){state.enabled=false;return {ok:true};}
   await new Promise(r=>setTimeout(r,150));return {state:state.enabled?state.result:'direct'};
  }}};
 });
 await page.route('https://popup.test/**',async route=>{const file=new URL(route.request().url()).pathname.slice(1)||'popup.html';await route.fulfill({path:resolve(output,file)});});
 await page.setViewportSize({width:360,height:600});await page.goto('https://popup.test/popup.html');
 await expect(page.getByRole('button',{name:'Connect to Pixflow Bridge'})).toBeEnabled();
 await page.locator('body').screenshot({path:test.info().outputPath('light-connect.png'),animations:'disabled'});
 await page.getByRole('button',{name:'Connect to Pixflow Bridge'}).click();
 await expect(page.getByRole('heading',{name:'Site permission needed'})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).fixture.enabled)).toBe(false);
 await page.evaluate(()=>{(window as any).fixture.allowed=true;});
 await page.getByRole('button',{name:'Allow site access'}).click();
 await expect(page.getByRole('heading',{name:'Bridge connected'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Check connection'})).toBeEnabled();
 await page.emulateMedia({colorScheme:'dark'});await page.locator('body').screenshot({path:test.info().outputPath('dark-connected.png'),animations:'disabled'});
 await page.evaluate(()=>{(window as any).fixture.result='unavailable';});
 await page.getByRole('button',{name:'Check connection'}).click();
 await expect(page.getByRole('heading',{name:'Bridge not reachable'})).toBeVisible();
 await page.locator('body').screenshot({path:test.info().outputPath('dark-offline.png'),animations:'disabled'});
 await page.evaluate(()=>{(window as any).fixture.result='connected';});
 await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('heading',{name:'Bridge connected'})).toBeVisible();
 for(const [result,heading] of [['missing-host','Bridge setup needed'],['timeout','Connection timed out'],['denied','Site access needs checking'],['permission','Site permission needed']] as const){
  await page.evaluate(value=>{(window as any).fixture.result=value;},result);
  await page.getByRole('button',{name:/Check connection|Check again|Try again/}).click();
  await expect(page.getByRole('heading',{name:heading})).toBeVisible();
 }
 await page.getByRole('button',{name:'Disconnect this site'}).click();
 await expect(page.getByRole('heading',{name:'Connect this site'})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).fixture.requests.filter((x:string)=>!['configuration','status','enable','disable'].includes(x)))).toEqual([]);
 await page.getByText('Connection help',{exact:true}).click();await expect(page.getByText('WordPress permissions still apply.',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('empty and long site choices stay usable with keyboard and narrow layout',async({page})=>{
 await page.addInitScript(()=>{(window as any).chrome={tabs:{query:async()=>[{url:'chrome://extensions'}]},runtime:{sendMessage:async(message:any)=>message.type==='configuration'?{sites:['https://a-very-long-customer-site-name.example.test:443','https://second.test'],enabled:[]}:{state:'direct'}}};});
 await page.route('https://popup.test/**',async route=>{const file=new URL(route.request().url()).pathname.slice(1)||'popup.html';await route.fulfill({body:await readFile(resolve(output,file)),contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/html'});});
 await page.setViewportSize({width:320,height:600});await page.goto('https://popup.test/popup.html');
 await expect(page.getByRole('heading',{name:'Open your WordPress site'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Connect to Pixflow Bridge'})).toBeDisabled();
 await page.keyboard.press('Tab');await expect(page.getByRole('combobox')).toBeFocused();
 await page.getByRole('combobox').selectOption({index:1});await expect(page.getByRole('heading',{name:'Connect this site'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'Connect to Pixflow Bridge'})).toBeEnabled();
 await page.locator('body').screenshot({path:test.info().outputPath('narrow-long-site.png'),animations:'disabled'});
});
