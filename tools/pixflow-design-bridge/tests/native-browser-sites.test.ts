import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserSites, validateBrowserSite} from '../native-messaging/src/browser-sites';
const origin='https://fresh.example';
const site={siteKey:'a'.repeat(64),siteOrigin:origin,siteUrl:origin,siteLabel:'Fresh site'};
test('supported active browser site is discoverable without native pairing or saved consent',async()=>{
 const chrome={tabs:{query:async()=>[{id:1,url:origin+'/wp-admin/'}]},scripting:{executeScript:async()=>[{frameId:0,result:site}]}};
 assert.deepEqual(await discoverBrowserSites(chrome),[site]);
});
test('unsupported pages, credentials and cross-origin configuration are not candidates',async()=>{
 for(const value of [null,{}, {...site,siteOrigin:'https://other.example'}, {...site,siteUrl:'https://other.example'}, {...site,siteKey:'bad'}])assert.equal(validateBrowserSite(value,origin),null);
 const chrome={tabs:{query:async()=>[{id:1,url:'chrome://extensions'}]},scripting:{executeScript:async()=>{throw Error('must not inspect');}}};
 assert.deepEqual(await discoverBrowserSites(chrome),[]);
});
test('inaccessible tabs do not hide another supported site',async()=>{
 const chrome={tabs:{query:async()=>[{id:1,url:origin},{id:2,url:origin}]},scripting:{executeScript:async({target}:any)=>{if(target.tabId===1)throw Error('permission');return [{frameId:0,result:site}];}}};
 assert.deepEqual(await discoverBrowserSites(chrome),[site]);
});
