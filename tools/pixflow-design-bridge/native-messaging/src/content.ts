export {};
declare const chrome:any;
const scope=globalThis as any;
if(!scope.pixflowNativePrototype){
 scope.pixflowNativePrototype=true;
 const port=chrome.runtime.connect({name:'pixflow-native-prototype'});let ready:any=null;
 const emit=(payload:any)=>window.postMessage({channel:'pixflow-native-response',payload},location.origin);
 const onWindowMessage=(event:MessageEvent)=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='pixflow-native-request')return;
  if(event.data.payload?.type==='hello'){if(ready)emit(ready);return;}
  try{port.postMessage(event.data.payload);}catch{emit({type:'disconnected'});}
 };
 window.addEventListener('message',onWindowMessage);
 port.onMessage.addListener((payload:any)=>{if(payload.type==='ready'||payload.type==='disabled')ready=payload;emit(payload);});
 port.onDisconnect.addListener(()=>{
  scope.pixflowNativePrototype=false;
  // Chrome can invalidate extension APIs during revocation. Notify the page first.
  emit({type:'disconnected'});
  window.removeEventListener('message',onWindowMessage);
  try{chrome.runtime.onMessage.removeListener(onControl);}catch{}
 });
 const onControl=(message:any)=>{if(message.type==='disable'){emit({type:'disabled'});port.disconnect();}};
 chrome.runtime.onMessage.addListener(onControl);
}
