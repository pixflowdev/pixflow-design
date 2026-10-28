import {createHash} from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverPairedSite } from '../native-messaging/src/enrollment';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { decoder, encode } from '../native-messaging/src/relay';

test('customer enrollment discovers only the exact already-paired Bridge origin', async () => {
  const request = (async (url: string, options: RequestInit) => {
    assert.equal(url, 'http://127.0.0.1:17467/api/pixflow/site-context');
    assert.equal(options.redirect, 'error');
    return Response.json({ ok: true, site: { key: 'synthetic-key', origin: 'https://customer.example:8443' } });
  }) as typeof fetch;
  assert.deepEqual(await discoverPairedSite('http://127.0.0.1:17467', request), ['https://customer.example:8443']);
  await assert.rejects(discoverPairedSite('https://remote.example', request), /Invalid local/);
});

test('unpaired, invalid and failed discovery cannot enroll a site', async () => {
  for (const origin of ['', 'http://customer.example', 'https://customer.example/path', 'https://user:pass@customer.example', 'file:///site']) {
    const request = (async () => Response.json({ ok: true, site: { key: 'synthetic-key', origin } })) as typeof fetch;
    assert.deepEqual(await discoverPairedSite('http://127.0.0.1:17467', request), []);
  }
  assert.deepEqual(await discoverPairedSite('http://127.0.0.1:17467', (async () => Response.json({ ok: true, site: null })) as typeof fetch), []);
  await assert.rejects(discoverPairedSite('http://127.0.0.1:17467', (async () => new Response('', { status: 403 })) as typeof fetch));
});

test('native process discovers pairing and rejects a different customer origin', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'pixflow-native-enrollment-'));
  const origin = 'https://paired.example';
  let protectedRequests = 0;
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/pixflow/site-context') res.end(JSON.stringify({ ok: true, site: { key: 'synthetic-pairing', origin } }));
    else { protectedRequests++; res.end('{}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No port');
  const bridge = `http://127.0.0.1:${address.port}`, extensionOrigin = `chrome-extension://${'a'.repeat(32)}/`;
  await build({ entryPoints: [fileURLToPath(new URL('../native-messaging/src/host.ts', import.meta.url))], outfile: join(root, 'host.mjs'), bundle: true, platform: 'node', format: 'esm' });
  await writeFile(join(root, 'config.json'), JSON.stringify({ bridge, extensionOrigin, sites: [], discoverPairedSite: true }));
  const child = spawn(process.execPath, [join(root, 'host.mjs'), extensionOrigin], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    const events: any[] = [];
    child.stdout.on('data', decoder(message => events.push(message)));
    const wait = async (predicate: () => boolean) => {
      const deadline = Date.now() + 5000;
      while (!predicate()) { if (Date.now() > deadline) throw Error('Enrollment process timeout'); await new Promise(resolve => setTimeout(resolve, 10)); }
    };
    child.stdin.write(encode({ id: 'discover', type: 'discover' }));
    await wait(() => events.length > 0);
    assert.deepEqual(events[0], { id: 'discover', type: 'sites', sites: [origin] });
    child.stdin.write(encode({ id: 'foreign', origin: 'https://another.example', url: bridge + '/api/projects' }));
    await wait(() => events.some(event => event.id === 'foreign'));
    assert.equal(events.find(event => event.id === 'foreign').type, 'error');
    assert.equal(protectedRequests, 0);
    child.stdin.end(); await wait(() => child.exitCode !== null);
    assert.equal(child.exitCode, 0);
  } finally {
    child.kill(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('extension enrollment connects a new site without loopback browser requests and does not admit another origin', {timeout:15000}, async()=>{
 const root=await mkdtemp(join(tmpdir(),'pixflow-native-new-site-'));
 const origin='https://new.example', site={siteKey:createHash('sha256').update(origin).digest('hex'),siteOrigin:origin,siteUrl:origin,siteLabel:'New'};
 let selected:any=null, switches=0, protectedRequests=0;
 const server=createServer((req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/api/pixflow/site-context')res.end(JSON.stringify({ok:true,site:null}));
  else if(req.url==='/api/health')res.end(JSON.stringify({ok:true,site:selected}));
  else if(req.url==='/api/pixflow/site-context/switch'){
   assert.equal(req.headers.origin,origin);switches++;selected={key:site.siteKey,origin};res.end('{"ok":true}');
  }else{protectedRequests++;res.end('{}');}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error('No port');
 const bridge=`http://127.0.0.1:${address.port}`, extensionOrigin=`chrome-extension://${'a'.repeat(32)}/`;
 await build({entryPoints:[fileURLToPath(new URL('../native-messaging/src/host.ts',import.meta.url))],outfile:join(root,'host.mjs'),bundle:true,platform:'node',format:'esm'});
 await writeFile(join(root,'config.json'),JSON.stringify({bridge,extensionOrigin,sites:[],discoverPairedSite:true}));
 const child=spawn(process.execPath,[join(root,'host.mjs'),extensionOrigin],{stdio:['pipe','pipe','pipe']});
 const events:any[]=[];child.stdout.on('data',decoder(message=>{events.push(message);if(message.type==='chunk')child.stdin.write(encode({id:message.id,type:'ack'}));}));
 const wait=async(predicate:()=>boolean)=>{const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)throw Error('Timeout');await new Promise(r=>setTimeout(r,10));}};
 try{
  child.stdin.write(encode({id:'before',origin,url:bridge+'/api/projects'}));await wait(()=>events.some(e=>e.id==='before'));assert.equal(events.at(-1).type,'error');
  child.stdin.write(encode({id:'enroll',type:'enroll',site}));await wait(()=>events.some(e=>e.type==='enrolled'));assert.equal(switches,1);
  child.stdin.write(encode({id:'allowed',origin,url:bridge+'/api/projects'}));await wait(()=>events.some(e=>e.id==='allowed'&&e.type==='end'));assert.equal(protectedRequests,1);
  child.stdin.write(encode({id:'foreign',origin:'https://other.example',url:bridge+'/api/projects'}));await wait(()=>events.some(e=>e.id==='foreign'));assert.equal(events.at(-1).type,'error');assert.equal(protectedRequests,1);
  events.length=0;child.stdin.write(encode({id:'enroll',type:'enroll',site}));await wait(()=>events.some(e=>e.type==='enrolled'));assert.equal(switches,1,'repeat connection must not switch an already registered site');
 }finally{child.kill();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
