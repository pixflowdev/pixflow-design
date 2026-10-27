export {};
declare const chrome:any;
// Only an explicit toolbar click activates a tab. Navigation drops its grant.
const grants=new Map<number,string>();
chrome.action.onClicked.addListener(async(tab:any)=>{
  if(!tab.id||!/^https?:/.test(tab.url||''))return;
  const origin=new URL(tab.url).origin;
  grants.set(tab.id,origin);
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
  await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['page.js']});
});
chrome.tabs.onUpdated.addListener((id:number,change:any)=>{if(change.status==='loading')grants.delete(id);});
chrome.tabs.onRemoved.addListener((id:number)=>grants.delete(id));
chrome.runtime.onConnect.addListener((port:any)=>{
  const sender=port.sender,tab=sender?.tab?.id;
  if(port.name!=='pixflow-native-prototype'||sender.frameId!==0||grants.get(tab)!==sender.origin){port.disconnect();return;}
  const native=chrome.runtime.connectNative('dev.pixflow.bridge_prototype');
  native.onMessage.addListener((message:any)=>port.postMessage(message));
  native.onDisconnect.addListener(()=>{void chrome.runtime.lastError;port.disconnect();});
  port.onDisconnect.addListener(()=>native.disconnect());
  port.onMessage.addListener((message:any)=>{
    if(grants.get(tab)!==sender.origin){port.disconnect();return;}
    native.postMessage({...message,origin:sender.origin});
  });
});
