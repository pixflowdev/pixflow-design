export {};
declare const chrome:any;
const configPromise=fetch(chrome.runtime.getURL('config.json')).then(r=>r.json());
const pattern=(origin:string)=>{const u=new URL(origin);return u.protocol+'//'+u.hostname+'/*';};
async function enabled(origin:string){const s=await chrome.storage.local.get('sites');return (s.sites||[]).includes(origin)&&await chrome.permissions.contains({origins:[pattern(origin)]});}
async function registrations(){
 const config=await configPromise,s=await chrome.storage.local.get('sites');
 await chrome.scripting.unregisterContentScripts();
 for(const [index,origin] of (s.sites||[]).entries()){
  if(!config.sites.includes(origin)||!await enabled(origin))continue;
  await chrome.scripting.registerContentScripts([
   {id:'pixflow-content-'+index,matches:[pattern(origin)],js:['content.js'],runAt:'document_start',allFrames:false},
   {id:'pixflow-page-'+index,matches:[pattern(origin)],js:['page.js'],runAt:'document_start',world:'MAIN',allFrames:false}
  ]);
 }
}
chrome.runtime.onInstalled.addListener(()=>void registrations());
chrome.runtime.onStartup.addListener(()=>void registrations());
chrome.permissions.onRemoved.addListener(()=>void registrations());
chrome.runtime.onMessage.addListener((message:any,sender:any,reply:any)=>{
 if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return;
 void (async()=>{
  const config=await configPromise;
  if(message.type==='configuration'){reply({sites:config.sites,enabled:(await chrome.storage.local.get('sites')).sites||[]});return;}
  if(!config.sites.includes(message.origin))throw new Error('Site not configured');
  const sites=new Set<string>((await chrome.storage.local.get('sites')).sites||[]);
  if(message.type==='enable'){
   if(!await chrome.permissions.contains({origins:[pattern(message.origin)]}))throw new Error('Site permission required');sites.add(message.origin);
  }else if(message.type==='disable')sites.delete(message.origin);else throw new Error('Unknown operation');
  await chrome.storage.local.set({sites:[...sites]});await registrations();
  for(const tab of await chrome.tabs.query({url:pattern(message.origin)})){
   if(new URL(tab.url).origin!==message.origin)continue;
   if(message.type==='enable'){
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['page.js']});
   }else await chrome.tabs.sendMessage(tab.id,{type:'disable'}).catch(()=>{});
  }
  reply({ok:true});
 })().catch(e=>reply({error:e.message}));return true;
});
chrome.runtime.onConnect.addListener((port:any)=>{
 void (async()=>{
  const sender=port.sender,origin=sender?.origin;
  const config=await configPromise;
  if(port.name!=='pixflow-native-prototype'||sender?.frameId!==0||!config.sites.includes(origin)||!await enabled(origin)){port.postMessage({type:'disabled'});port.disconnect();return;}
  const native=chrome.runtime.connectNative('dev.pixflow.bridge_prototype');
  native.onMessage.addListener((message:any)=>port.postMessage(message));
  native.onDisconnect.addListener(()=>{void chrome.runtime.lastError;port.disconnect();});
  port.onDisconnect.addListener(()=>native.disconnect());
  let delivery=Promise.resolve();
  port.onMessage.addListener((message:any)=>{delivery=delivery.then(async()=>{if(await enabled(origin))native.postMessage({...message,origin});else port.disconnect();}).catch(()=>port.disconnect());});
  port.postMessage({type:'ready',bridge:config.bridge});
 })().catch(()=>port.disconnect());
});
