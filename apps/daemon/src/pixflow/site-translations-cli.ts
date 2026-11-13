import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import type { SiteTranslationDocument, SiteTranslationIndex, SiteTranslationMutation, SiteTranslationUpdates } from '@open-design/contracts';

/** WordPress-owned capability: UI and CLI use the identical authenticated REST route. */
export async function runSiteTranslationsCli(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {
    'site-url': { type:'string' }, 'headers-file': { type:'string' }, 'post-id': { type:'string' },
    locale: { type:'string' }, locales: { type:'string' }, 'post-ids': { type:'string' }, scope:{type:'string'}, offset: { type:'string' }, 'prompt-file': { type:'string' }, json:{type:'boolean'}, help:{type:'boolean'},
    'job-id':{type:'string'},
  }});
  if(values.help || !positionals.length) {
    console.log('AI jobs: job-status|job-start|job-step|job-claim|job-complete|job-pause|job-resume|job-retry|job-cancel [--job-id ID] [--prompt-file JSON_PATH|-] [--json]. API uses job-step. Bridge uses job-claim, od agent-text, then job-complete with the returned lease and output. Inspect job-status before retrying any unconfirmed request; publication follows the job autoPublish setting.');
    console.log('od site-translations updates|list|read|configure|capture|save|url|publish|prepare|preview --site-url URL --headers-file PRIVATE_JSON [--post-id ID --locale CODE] [--prompt-file JSON_PATH|-] [--json]\nprepare --scope site|selected|updates --locales es,nl [--post-ids 12,34] reads anonymous public source once per page for all selected languages. Use --scope updates to select pending pages and active languages automatically. It does not generate or publish translations; use job-start with its returned page IDs/locales, then job-step or job-claim/job-complete. New jobs publish each completed page/language automatically. Set autoPublish:false in job-start JSON to keep drafts. Existing jobs retain their original publication choice.\nUses WordPress permissions. Mutations accept the same JSON body as the workspace. Capture supplies anonymous source HTML; no arbitrary remote URL is fetched by WordPress.'); return;
  }
  const action=positionals[0];
  const jobAction=action?.startsWith('job-')?action.slice(4):null;
  if(positionals.length!==1 || !(['updates','list','read','configure','capture','save','publish','prepare','url','preview'].includes(action!)||['status','start','step','claim','complete','pause','resume','retry','cancel'].includes(jobAction??''))) throw new Error('Choose a supported site-translations operation.');
  if(!values['site-url']||!values['headers-file']) throw new Error('Provide --site-url and --headers-file.');
  const site=new URL(values['site-url']);
  if(site.username||site.password||site.search||site.hash||(site.protocol!=='https:'&&!(site.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(site.hostname)))) throw new Error('Use HTTPS, or HTTP on loopback only.');
  const endpoint=new URL(site.href.replace(/\/$/,'')+'/'); endpoint.searchParams.set('rest_route','/pixflow-design/v1/site-translations');
  if(jobAction){endpoint.searchParams.set('jobs','1');if(values['job-id'])endpoint.searchParams.set('jobId',values['job-id']);}
  const headers: unknown=JSON.parse(await readFile(values['headers-file'],'utf8'));
  if(!headers||typeof headers!=='object'||Array.isArray(headers)||Object.entries(headers).some(([name,value])=>typeof value!=='string'||/^(host|content-length)$/i.test(name))) throw new Error('Use a private JSON object of authentication headers.');
  const requestHeaders = (post: boolean) => {
    const result = new Headers(headers as Record<string, string>);
    result.set('Content-Type', 'application/json');
    if (post) result.set('Origin', endpoint.origin);
    return result;
  };
  if(action==='prepare') {
    if(values['prompt-file']) throw new Error('Preparation uses --scope, --locales and --post-ids, not a mutation file.');
    const scope=values.scope;
    let locales=[...new Set((values.locales??'').split(',').filter(Boolean))];
    const selected=(values['post-ids']??'').split(',').filter(Boolean).map(Number);
    if(!['site','selected','updates'].includes(scope??'')||(scope!=='updates'&&!locales.length)||(scope==='selected'&&(!selected.length||selected.some(id=>!Number.isSafeInteger(id)||id===0)))) throw new Error('Choose site or selected scope and at least one target language. Selected scope requires valid --post-ids.');
    const call=async<T>(url:URL,body?:unknown):Promise<T>=>{
      const response=await fetch(url,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:requestHeaders(Boolean(body)),...(body?{body:JSON.stringify(body)}:{})});
      const result=await response.json() as T & {message?:string};
      if(!response.ok)throw new Error(result.message||`WordPress returned ${response.status}.`);return result;
    };
    if(scope==='updates'){const statusUrl=new URL(endpoint);statusUrl.searchParams.set('updates','1');locales=(await call<SiteTranslationUpdates>(statusUrl)).activeLanguages;if(!locales.length){process.stdout.write(JSON.stringify({results:[]})+'\n');return;}}
    let index=await call<SiteTranslationIndex>(endpoint);
    if(locales.some(locale=>!index.settings.languages.some(language=>language.code===locale)))throw new Error('Choose configured target languages.');
    while(index.hasMore) { const nextUrl=new URL(endpoint);nextUrl.searchParams.set('offset',String(index.nextOffset));const next=await call<SiteTranslationIndex>(nextUrl);index={...next,pages:[...index.pages,...next.pages]}; }
    const pages=index.pages.filter(page=>!index.settings.rules?.excludedPages.includes(page.id)&&(scope==='updates'?page.pendingLanguages?.some(locale=>locales.includes(locale)):scope==='site'||selected.includes(page.id)));
    if(scope==='selected'&&selected.some(id=>!pages.some(page=>page.id===id)))throw new Error('A selected page is unavailable or cannot be edited.');
    const results=[];
    for(const page of pages) {
      try {
        const readUrl=new URL(endpoint);readUrl.searchParams.set('postId',String(page.id));readUrl.searchParams.set('locale',locales[0]!);
        const current=await call<SiteTranslationDocument>(readUrl);
        const source=new URL(page.url);
        if(source.origin!==site.origin||source.username||source.password)throw new Error('Source must belong to the selected site.');
        source.searchParams.set('pixflow_translation_source','1');
        // Do not forward WordPress authentication headers to public source requests.
        const response=await fetch(source,{redirect:'error',signal:AbortSignal.timeout(20000)});
        if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error('Public source could not be loaded.');
        const html=await response.text();if(Buffer.byteLength(html)>2_000_000)throw new Error('Source exceeds the preview size limit.');
        await call(endpoint,{action:'capture',postId:page.id,locale:locales[0],html,sourceRevision:current.revision,sourceVersion:current.sourceVersion});
        results.push({postId:page.id,locales,status:'prepared'});
      }catch(error){results.push({postId:page.id,locales,status:'failed',error:error instanceof Error?error.message:String(error)});}
    }
    process.stdout.write(JSON.stringify({results},null,values.json?undefined:2)+'\n');
    if(results.some(result=>result.status==='failed'))process.exitCode=1;
    return;
  }
  let body: SiteTranslationMutation | undefined;
  if(action==='updates'||action==='list'||action==='read'||jobAction==='status') {
    if(values['prompt-file']) throw new Error('Read operations do not accept a mutation file.');
    if(action==='read') { if(!values['post-id']||!values.locale) throw new Error('Provide --post-id and --locale.'); endpoint.searchParams.set('postId',values['post-id']);endpoint.searchParams.set('locale',values.locale); }
    if(action==='updates')endpoint.searchParams.set('updates','1');
    if(values.offset) endpoint.searchParams.set('offset',values.offset);
  } else {
    if(!values['prompt-file']) throw new Error('Provide --prompt-file with the mutation JSON.');
    let text=''; if(values['prompt-file']==='-') for await(const chunk of process.stdin) text+=chunk; else text=await readFile(values['prompt-file'],'utf8');
    const input:unknown=JSON.parse(text);
    if(!input||typeof input!=='object'||Array.isArray(input)||('action' in input&&input.action!==(jobAction??action))) throw new Error('Mutation action does not match the command.');
    body={...input,action:jobAction??action} as SiteTranslationMutation;
  }
  const response=await fetch(endpoint,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(jobAction==='step'||action==='preview'?135000:30000),headers:requestHeaders(Boolean(body)),...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json() as {message?:string};
  if(!response.ok) throw new Error(result.message||`WordPress returned ${response.status}.`);
  process.stdout.write(JSON.stringify(result,null,values.json?undefined:2)+'\n');
}
