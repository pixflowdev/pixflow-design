import type {ConnectionState} from './connection-status';
declare const chrome:any;
const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const site=element<HTMLSelectElement>('site'),action=element<HTMLButtonElement>('action'),disconnect=element<HTMLButtonElement>('disconnect');
const title=element('state-title'),description=element('state-description'),status=element('connection'),notice=element('notice');
let origin='',busy=false,state:ConnectionState|'unsupported'='direct';
const copy:Record<string,[string,string,string]>={
 direct:['Connect this site','Use your local CLI from Pixflow in WordPress or your builder.','Connect to Pixflow Bridge'],
 permission:['Site permission needed','Allow access to this site in Chrome to use the extension connection.','Allow site access'],
 connected:['Bridge connected','Continue in Pixflow on this site to choose your Local CLI.','Check connection'],
 'missing-host':['Bridge setup needed','Chrome cannot find the Pixflow connection helper. Install the compatible Bridge and complete its extension setup, then check again.','Check again'],
 unavailable:['Bridge not reachable','Open Pixflow Bridge on your computer, then check again. If it is already running, restart it from its tray menu.','Try again'],
 timeout:['Connection timed out','Bridge did not respond in time. Check that it is running, then try again. Your chats are unchanged.','Try again'],
 denied:['Site access needs checking','Bridge refused this site. Check the approved site in Bridge and sign in to WordPress, then try again.','Check again'],
 unsupported:['Open a Pixflow site','Open a WordPress admin or builder tab with Pixflow enabled, then reopen this popup.','Connect to Pixflow Bridge'],
};
function render(next:typeof state){
 state=next;const text=copy[next];title.textContent=text[0];description.textContent=text[1];action.textContent=text[2];
 status.dataset.state=next;document.body.dataset.state=next;disconnect.hidden=['direct','unsupported'].includes(next);disconnect.disabled=busy;action.disabled=busy||!origin;site.disabled=busy;
 action.setAttribute('aria-busy',String(busy));
}
function loading(label:string){busy=true;render(state);title.textContent=label;status.dataset.state='checking';action.textContent=label;notice.textContent='';}
async function check(){
 loading('Checking connection…');
 try{const result=await chrome.runtime.sendMessage({type:'status',origin});if(result.error)throw Error(result.error);render(copy[result.state]?result.state:'unavailable');}
 catch{render('unavailable');}
 finally{busy=false;render(state);}
}
action.onclick=async()=>{
 if(busy||!origin)return;
 if(!['direct','permission'].includes(state)){await check();return;}
 loading('Connecting…');
 try{
  // Request from the click itself, preserving Chrome's user gesture.
  const u=new URL(origin),permission={origins:[u.protocol+'//'+u.hostname+'/*']};
  if(!await chrome.permissions.request(permission)){render('permission');notice.textContent='Access was not granted. You can try again or keep using the direct connection.';return;}
  const result=await chrome.runtime.sendMessage({type:'enable',origin});if(result.error)throw Error(result.error);
  await check();
 }catch{render('permission');notice.textContent='Could not finish connecting. Check the site permission in Chrome, then try again.';}
 finally{busy=false;render(state);}
};
disconnect.onclick=async()=>{
 if(busy||!origin)return;loading('Disconnecting…');
 try{const result=await chrome.runtime.sendMessage({type:'disable',origin});if(result.error)throw Error(result.error);render('direct');notice.textContent='Extension disconnected. Pixflow can use its direct connection. Active requests are not replayed.';}
 catch{notice.textContent='Could not disconnect. Try again, or remove this extension’s access in Chrome.';}
 finally{busy=false;render(state);}
};
site.onchange=()=>{origin=site.value;site.title=origin;notice.textContent='';void check();};
void (async()=>{
 loading('Loading site…');
 try{
  const config=await chrome.runtime.sendMessage({type:'configuration'});if(config.error)throw Error(config.error);
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  let current='';try{current=new URL(tab?.url||'').origin;}catch{}
  for(const value of config.sites){const option=document.createElement('option');option.value=value;const host=new URL(value).host;option.textContent=config.sites.some((other:string)=>other!==value&&new URL(other).host===host)?value:host;option.title=value;site.append(option);}
  origin=config.sites.includes(current)?current:config.sites.length===1?config.sites[0]:'';
  if(origin){site.value=origin;site.title=origin;await check();}else render('unsupported');
 }catch{render('unsupported');notice.textContent='Extension setup could not be loaded. Reload the extension in Chrome, then reopen this popup.';}
 finally{busy=false;render(state);}
})();
