import {probeBridge} from './connection-status';
declare const chrome:any;
const configPromise=fetch(chrome.runtime.getURL('config.json')).then(r=>r.json());
const pattern=(origin:string)=>{const u=new URL(origin);return u.protocol+'//'+u.hostname+'/*';};
const disabledOrigins=new Set<string>();
async function enabled(origin:string){
 if(disabledOrigins.has(origin))return false;
 const s=await chrome.storage.local.get('sites');
 const allowed=(s.sites||[]).includes(origin)&&await chrome.permissions.contains({origins:[pattern(origin)]});
 return allowed&&!disabledOrigins.has(origin);
}
// Invalidate admissions as well as established ports before asynchronous cleanup.
let permissionGeneration=0;
// Consent writes must retain operation order across asynchronous storage reads.
let consentWrites=Promise.resolve();
function persistConsent(operation:()=>Promise<void>){
 const result=consentWrites.then(operation);consentWrites=result.catch(()=>{});return result;
}
const connections=new Set<{origin:string;close:(disabled?:boolean)=>void}>();
function invalidateConnections(origin?:string){
 permissionGeneration++;
 for(const connection of connections)if(!origin||connection.origin===origin)connection.close(true);
}
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
chrome.permissions.onRemoved.addListener(()=>{invalidateConnections();void registrations();});
chrome.runtime.onMessage.addListener((message:any,sender:any,reply:any)=>{
 if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return;
 void (async()=>{
  const config=await configPromise;
  if(message.type==='configuration'){reply({sites:config.sites,enabled:(await chrome.storage.local.get('sites')).sites||[]});return;}
  if(!config.sites.includes(message.origin))throw new Error('Site not configured');
  if(message.type==='status'){
   const stored=(await chrome.storage.local.get('sites')).sites||[];
   if(!stored.includes(message.origin)||disabledOrigins.has(message.origin)){reply({state:'direct'});return;}
   if(!await enabled(message.origin)){reply({state:'permission'});return;}
   const generation=permissionGeneration;
   const state=await probeBridge(chrome.runtime,message.origin,config.bridge);
   reply({state:generation===permissionGeneration&&await enabled(message.origin)?state:'permission'});return;
  }
  const generation=permissionGeneration;
  if(message.type==='disable'){disabledOrigins.add(message.origin);invalidateConnections(message.origin);}
  else if(message.type!=='enable')throw new Error('Unknown operation');
  await persistConsent(async()=>{
   const sites=new Set<string>((await chrome.storage.local.get('sites')).sites||[]);
   if(message.type==='enable'){
    const granted=await chrome.permissions.contains({origins:[pattern(message.origin)]});
    if(generation!==permissionGeneration||!granted)throw new Error('Site access changed; enable the connection again');
    sites.add(message.origin);
   }else sites.delete(message.origin);
   await chrome.storage.local.set({sites:[...sites]});
   if(message.type==='enable'){
    const granted=await chrome.permissions.contains({origins:[pattern(message.origin)]});
    if(generation!==permissionGeneration||!granted){
     sites.delete(message.origin);await chrome.storage.local.set({sites:[...sites]});
     throw new Error('Site access changed; enable the connection again');
    }
    disabledOrigins.delete(message.origin);
   }
  });
  await registrations();
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
 const generation=permissionGeneration;
 let closed=false,native:any;
 const origin=port.sender?.origin;
 const connection={origin,close(disabled=false){
  if(closed)return;closed=true;connections.delete(connection);
  if(disabled){try{port.postMessage({type:'disabled'});}catch{}}
  try{native?.disconnect();}catch{}
  try{port.disconnect();}catch{}
 }};
 port.onDisconnect.addListener(()=>connection.close());
 void (async()=>{
  const config=await configPromise;
  if(port.name!=='pixflow-native-prototype'||port.sender?.frameId!==0||!config.sites.includes(origin)||!await enabled(origin)||generation!==permissionGeneration||closed){connection.close(true);return;}
  native=chrome.runtime.connectNative('dev.pixflow.bridge_prototype');connections.add(connection);
  let responses=Promise.resolve(),delivery=Promise.resolve();
  native.onMessage.addListener((message:any)=>{
   responses=responses.then(async()=>{
    if(closed)return;
    if(!await enabled(origin)){connection.close(true);return;}
    if(!closed)port.postMessage(message);
   }).catch(()=>connection.close());
  });
  native.onDisconnect.addListener(()=>{void chrome.runtime.lastError;connection.close();});
  port.onMessage.addListener((message:any)=>{
   delivery=delivery.then(async()=>{
    if(closed)return;
    if(!await enabled(origin)){connection.close(true);return;}
    if(!closed)native.postMessage({...message,origin});
   }).catch(()=>connection.close());
  });
  if(!closed)port.postMessage({type:'ready',bridge:config.bridge});
 })().catch(()=>connection.close());
});
