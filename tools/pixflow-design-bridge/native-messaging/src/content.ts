export {};
declare const chrome:any;
const scope=globalThis as any;
if(!scope.pixflowNativePrototype){
 scope.pixflowNativePrototype=true;
 const port=chrome.runtime.connect({name:'pixflow-native-prototype'});
 window.addEventListener('message',event=>{if(event.source===window&&event.origin===location.origin&&event.data?.channel==='pixflow-native-request')port.postMessage(event.data.payload);});
 port.onMessage.addListener((payload:any)=>window.postMessage({channel:'pixflow-native-response',payload},location.origin));
 port.onDisconnect.addListener(()=>{scope.pixflowNativePrototype=false;window.postMessage({channel:'pixflow-native-disconnected'},location.origin);});
}
