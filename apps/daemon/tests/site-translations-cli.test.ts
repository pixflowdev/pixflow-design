import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSiteTranslationsCli } from '../src/pixflow/site-translations-cli.js';

test('preview exposes the same non-persistent operation to headless clients',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pixflow-guidance-preview-'));
  const headersFile=join(directory,'headers.json'),inputFile=join(directory,'input.json');
  await writeFile(headersFile,JSON.stringify({Authorization:'test-only'}));
  const input={mode:'prepare',locale:'es',sample:'Hello',revision:1,rules:{brandVoice:{tone:'Warm'}}};
  await writeFile(inputFile,JSON.stringify(input));
  vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
  const request=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
    assert.equal(new URL(String(url)).searchParams.get('rest_route'),'/pixflow-design/v1/site-translations');
    assert.deepEqual(JSON.parse(String(init?.body)),{...input,action:'preview'});
    return Response.json({prompt:'Prepared sample'});
  });
  try {await runSiteTranslationsCli(['preview','--site-url','https://example.test','--headers-file',headersFile,'--prompt-file',inputFile,'--json']);assert.equal(request.mock.calls.length,1);}
  finally {vi.restoreAllMocks();await rm(directory,{recursive:true,force:true});}
});

test('multi-language preparation paginates, reads source once, and never forwards credentials to source', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pixflow-translations-'));
  const headersFile = join(directory, 'headers.json');
  await writeFile(headersFile, JSON.stringify({ Authorization: 'test-only' }));
  const sources: number[] = [];
  const captures: number[] = [];
  let output = '';
  const previousExit = process.exitCode;
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { output += chunk; return true; });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init?: RequestInit) => {
    const url = new URL(String(input));
    if (!url.searchParams.has('rest_route')) {
      assert.equal(init?.headers, undefined);
      const id = Number(url.pathname.slice(1)); sources.push(id);
      return new Response(id === 2 ? 'Unavailable' : '<p>Source</p>', { status: id === 2 ? 503 : 200, headers: {'Content-Type':'text/html'} });
    }
    assert.equal((init?.headers as Record<string,string>).Authorization, 'test-only');
    if (init?.body) { captures.push(JSON.parse(String(init.body)).postId); return Response.json({}); }
    if (url.searchParams.has('postId')) return Response.json({revision: 3});
    const id = url.searchParams.has('offset') ? 2 : 1;
    return Response.json({settings:{languages:[{code:'es'},{code:'nl'}],rules:{excludedPages:[3]}},pages:[{id,title:`Page ${id}`,url:`https://example.test/${id}`},...(id===2?[{id:3,title:'Excluded page',url:'https://example.test/3'}]:[])],hasMore:id===1,nextOffset:id===1?50:null});
  });
  try {
    await runSiteTranslationsCli(['prepare','--site-url','https://example.test','--headers-file',headersFile,'--scope','site','--locales','es,nl,es','--json']);
    const result = JSON.parse(output);
    assert.deepEqual(sources, [1,2]); assert.deepEqual(captures,[1]);
    assert.deepEqual(result.results.map((row: {locales:string[];status:string})=>[row.locales,row.status]),[[['es','nl'],'prepared'],[['es','nl'],'failed']]);
    assert.equal(process.exitCode,1);
  } finally { process.exitCode=previousExit; vi.restoreAllMocks(); await rm(directory,{recursive:true,force:true}); }
});

test('job commands share the WordPress endpoint and carry explicit actions and leases', async () => {
  const directory=await mkdtemp(join(tmpdir(),'pixflow-translation-jobs-'));
  const headersFile=join(directory,'headers.json');const inputFile=join(directory,'input.json');
  await writeFile(headersFile,JSON.stringify({Authorization:'test-only'}));
  await writeFile(inputFile,JSON.stringify({lease:'fixture-lease',output:'translated',provider:{apiProtocol:'openai',model:'fixture'}}));
  const calls:Array<{url:URL;init:RequestInit|undefined}>=[];
  vi.spyOn(process.stdout, 'write').mockImplementation(()=>true);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async(input,init?:RequestInit)=>{calls.push({url:new URL(String(input)),init});return Response.json({job:{id:'fixture-job'}});});
  try {
    for(const action of ['status','start','step','claim','complete','pause','resume','retry','cancel']){
      await runSiteTranslationsCli([`job-${action}`,'--site-url','https://example.test','--headers-file',headersFile,'--job-id','fixture-job','--json',...(action==='status'?[]:['--prompt-file',inputFile])]);
      const call=calls.at(-1)!;
      assert.equal(call.url.searchParams.get('rest_route'),'/pixflow-design/v1/site-translations');
      assert.equal(call.url.searchParams.get('jobs'),'1');assert.equal(call.url.searchParams.get('jobId'),'fixture-job');
      assert.equal(call.init?.method,action==='status'?'GET':'POST');
      if(action!=='status'){const body=JSON.parse(String(call.init?.body));assert.equal(body.action,action);assert.equal(body.lease,'fixture-lease');}
    }
  } finally {vi.restoreAllMocks();await rm(directory,{recursive:true,force:true});}
});

test('translated URL drafts use the same revision-checked mutation as the workspace', async () => {
  const directory=await mkdtemp(join(tmpdir(),'pixflow-translation-url-'));
  const headersFile=join(directory,'headers.json');const inputFile=join(directory,'input.json');
  const input={postId:-11,locale:'es',path:'noticias',revision:2};
  await writeFile(headersFile,JSON.stringify({Authorization:'test-only'}));
  await writeFile(inputFile,JSON.stringify(input));
  vi.spyOn(process.stdout, 'write').mockImplementation(()=>true);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async(url,init?:RequestInit)=>{
    assert.equal(new URL(String(url)).searchParams.get('rest_route'),'/pixflow-design/v1/site-translations');
    assert.equal(init?.method,'POST');assert.deepEqual(JSON.parse(String(init?.body)),{...input,action:'url'});
    return Response.json({url:{revision:3,draftPath:'noticias/',publishedPath:''}});
  });
  try { await runSiteTranslationsCli(['url','--site-url','https://example.test','--headers-file',headersFile,'--prompt-file',inputFile,'--json']); }
  finally {vi.restoreAllMocks();await rm(directory,{recursive:true,force:true});}
});


test('updates probe and prepare use active languages and skip unchanged pages',async ()=>{
 const directory=await mkdtemp(join(tmpdir(),'pixflow-translation-updates-'));
 const headersFile=join(directory,'headers.json');await writeFile(headersFile,JSON.stringify({Authorization:'fixture-only'}));
 const calls:Array<{url:URL;body:any}>=[];
 vi.spyOn(process.stdout, 'write').mockImplementation(()=>true);
 vi.spyOn(globalThis, 'fetch').mockImplementation(async(input,init?:RequestInit)=>{
  const url=new URL(String(input));const body=init?.body?JSON.parse(String(init.body)):null;calls.push({url,body});
  if(url.searchParams.has('updates'))return Response.json({activeLanguages:['es'],needsUpdate:true});
  if(url.searchParams.has('postId'))return Response.json({revision:1,sourceVersion:'capture-version'});
  if(url.searchParams.has('pixflow_translation_source'))return new Response('<p>New text</p>',{headers:{'content-type':'text/html'}});
  if(body)return Response.json({revision:2});
  return Response.json({settings:{languages:[{code:'es'},{code:'nl'}],rules:{excludedPages:[]}},pages:[{id:1,url:'https://example.test/a',pendingLanguages:['es']},{id:2,url:'https://example.test/b',pendingLanguages:[]}],hasMore:false});
 });
 try {
  await runSiteTranslationsCli(['updates','--site-url','https://example.test','--headers-file',headersFile,'--json']);
  assert.equal(calls.length,1);assert.equal(calls[0]!.url.searchParams.get('updates'),'1');
  await runSiteTranslationsCli(['prepare','--scope','updates','--site-url','https://example.test','--headers-file',headersFile,'--json']);
  const captures=calls.filter(c=>c.body?.action==='capture');assert.equal(captures.length,1);assert.equal(captures[0]!.body.postId,1);assert.equal(captures[0]!.body.locale,'es');assert.equal(captures[0]!.body.sourceVersion,'capture-version');
  assert.equal(calls.some(c=>c.body?.action==='publish'),false);
 }finally{vi.restoreAllMocks();await rm(directory,{recursive:true,force:true});}
});
