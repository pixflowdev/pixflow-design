export {};
declare const chrome:any;
void (async()=>{
 const config=await chrome.runtime.sendMessage({type:'configuration'});
 const container=document.getElementById('sites')!;
 for(const origin of config.sites){
  const row=document.createElement('div'),label=document.createElement('p'),button=document.createElement('button');label.textContent=origin;
  const on=config.enabled.includes(origin);button.textContent=on?'Use direct connection':'Enable native connection';
  button.onclick=async()=>{
   try{const u=new URL(origin),permission={origins:[u.protocol+'//'+u.hostname+'/*']};if(!on&&!await chrome.permissions.contains(permission)&&!await chrome.permissions.request(permission))throw new Error('Site permission was not granted');
    const response=await chrome.runtime.sendMessage({type:on?'disable':'enable',origin});if(response.error)throw new Error(response.error);location.reload();
   }catch(e){document.getElementById('status')!.textContent=String(e);}
  };
  row.append(label,button);container.append(row);
 }
})();
