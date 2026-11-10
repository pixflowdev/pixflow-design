import { chromium } from 'playwright-core';
import type { PixflowPageInspection } from '@open-design/contracts';
import { resolvePixflowCaptureBrowser } from './browser-screenshot.js';

/** Inspection is deliberately anonymous and same-origin. It never clicks consent,
 * load-more, forms or builder controls. Unsupported dependencies remain partial. */
export function inspectionRequestAllowed(raw:string,origin:string,method='GET'):boolean {
  try {
    const url=new URL(raw);
    return method==='GET' && ['http:','https:'].includes(url.protocol) && url.origin===origin && !url.username && !url.password
      && !/\/(?:wp-admin|wp-login\.php|wp-json|xmlrpc\.php)(?:\/|$)/i.test(url.pathname)
      && !['rest_route','action','preview','bricks','elementor-preview','etch','add-to-cart','logout'].some(key=>url.searchParams.has(key));
  } catch {return false;}
}

// Runs in the isolated browser, not the daemon. Cap DOM output as well as network time.
export const snapshotScript=`(() => {
  const all=(s)=>Array.from(document.querySelectorAll(s));
  const visible=(e)=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
  const headings=all('h1,h2,h3,h4,h5,h6').filter(visible);
  const links=all('a[href]'); const ids=all('[id],a[name]'); const images=all('img').filter(visible);
  const linkUrl=(e)=>{try{return typeof e.href==='string'?e.href:new URL(e.getAttribute('href'),location.href).href;}catch{return '';}};
  return {
    finalUrl:location.href,title:document.title.slice(0,1000),
    canonical:(document.querySelector('link[rel="canonical"]')?.href||'').slice(0,2000),
    description:(document.querySelector('meta[name="description"]')?.content||'').slice(0,2000),
    headings:headings.slice(0,100).map(e=>({level:Number(e.tagName[1]),text:e.textContent.trim().slice(0,500)})),
    links:Array.from(new Set(links.map(linkUrl).filter(Boolean))).slice(0,1000).map(s=>s.slice(0,2000)),
    ids:Array.from(new Set(ids.map(e=>e.id||e.getAttribute('name')).filter(s=>typeof s==='string'&&s.length>0))).slice(0,5000).map(s=>s.slice(0,300)),
    images:images.slice(0,200).map(e=>({src:(e.currentSrc||e.src).slice(0,2000),alt:e.getAttribute('alt')?.slice(0,2000)??null,loaded:e.complete&&e.naturalWidth>0,failed:e.complete&&e.naturalWidth===0&&!!e.currentSrc,width:Math.round(e.getBoundingClientRect().width),naturalWidth:e.naturalWidth})),
    limited:headings.length>100||links.length>1000||ids.length>5000||images.length>200,
    remaining:document.documentElement.scrollHeight>scrollY+innerHeight+100,
    consent:all('[role="dialog"],#onetrust-banner-sdk,.cmplz-cookiebanner').some(visible)
  };
})()`;

let active=0;
export async function inspectPublicPage(raw:string,width:390|1440=1440):Promise<PixflowPageInspection> {
  const target=new URL(raw);target.hash='';
  if(!inspectionRequestAllowed(target.href,target.origin))throw Error('Choose a public HTTP(S) page, not an editor or administrative URL.');
  if(active>=2)throw Error('Browser inspection is busy. Try again after the current page.');
  active++;
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  let deadline:ReturnType<typeof setTimeout>|undefined;
  try {
    const executablePath=await resolvePixflowCaptureBrowser();
    if(!executablePath)throw Error('No supported local browser is available. HTML checks are retained.');
    browser=await chromium.launch({executablePath,headless:true,timeout:10000,args:['--disable-background-networking','--disable-extensions','--mute-audio']});
    const running=browser;
    deadline=setTimeout(()=>{void running.close().catch(()=>{});},25000);
    const context=await browser.newContext({viewport:{width,height:width===390?844:900},serviceWorkers:'block',acceptDownloads:false});
    let blocked=0,requests=0;
    await context.route('**/*',async route=>{
      const req=route.request();
      if(++requests>180||!inspectionRequestAllowed(req.url(),target.origin,req.method())){blocked++;await route.abort();}
      else await route.continue();
    });
    await context.routeWebSocket('**/*',socket=>socket.close());
    const page=await context.newPage();
    page.on('dialog',dialog=>{void dialog.dismiss();});
    context.on('page',popup=>{if(popup!==page)void popup.close();});
    const response=await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:12000});
    await page.waitForTimeout(1000);
    for(let i=0;i<5;i++){
      await page.evaluate('window.scrollBy(0,window.innerHeight)');
      await page.waitForTimeout(250);
    }
    const snapshot=await page.evaluate(snapshotScript) as Omit<PixflowPageInspection,'url'|'checkedAt'|'status'|'width'|'limitations'> & {limited:boolean;remaining:boolean;consent:boolean};
    const {limited,remaining,consent,...data}=snapshot;
    return {...data,url:target.href,checkedAt:new Date().toISOString(),status:response?.status()??0,width,
      limitations:[
        'Anonymous browser sample with bounded scrolling. No clicks, consent approval or form submission; not Googlebot or complete infinite-scroll coverage.',
        ...(blocked?[`${blocked} cross-origin, administrative, mutating or over-budget requests blocked.`]:[]),
        ...(remaining?['Page extends beyond the scroll sample; later lazy content may be unobserved.']:[]),
        ...(limited?['DOM evidence reached its sampling limit.']:[]),
        ...(consent?['A visible dialog or consent overlay may restrict the observed content.']:[]),
      ]};
  } finally {if(deadline)clearTimeout(deadline);try {await browser?.close();} finally {active--;}}
}
