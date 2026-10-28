export type BrowserSite = {siteKey:string;siteOrigin:string;siteUrl:string;siteLabel:string};
/** Metadata is a candidate, never consent. Origin is independently supplied by Chrome. */
export function validateBrowserSite(value:any, origin:string):BrowserSite|null {
 try {
  const url=new URL(origin), siteUrl=new URL(value?.siteUrl);
  if(url.origin!==origin||url.username||url.password||!(url.protocol==='https:'||(url.protocol==='http:'&&url.hostname==='127.0.0.1')))return null;
  if(value.siteOrigin!==origin||siteUrl.origin!==origin||siteUrl.username||siteUrl.password||siteUrl.search||siteUrl.hash||! /^[a-f0-9]{64}$/.test(value.siteKey))return null;
  return {siteKey:value.siteKey,siteOrigin:origin,siteUrl:siteUrl.href.replace(/\/$/,''),siteLabel:String(value.siteLabel||url.host).slice(0,200)};
 }catch{return null;}
}
/** activeTab authorizes inspection after clicking the popup; saved host consent covers later visits. */
export async function discoverBrowserSites(chrome:any):Promise<BrowserSite[]> {
 const sites=new Map<string,BrowserSite>();
 for(const tab of await chrome.tabs.query({})) {
  let origin:string;try{origin=new URL(tab.url).origin;if(!/^https?:/.test(origin))continue;}catch{continue;}
  try {
   const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>{
    const w=window as any,c=w.__PIXFLOW_DESIGN_WORDPRESS__??w.pixflowDesignWpAdmin??w.pixflowDesignShell;
    if(!c)return null;
    return {siteKey:c.siteHash,siteOrigin:c.siteOrigin,siteUrl:c.siteUrl,siteLabel:c.siteLabel};
   }});
   const site=validateBrowserSite(results.find((r:any)=>r.frameId===0)?.result,origin);
   if(site)sites.set(origin,site);
  }catch{/* No permission, navigation, or unsupported tab. */}
 }
 return [...sites.values()];
}
