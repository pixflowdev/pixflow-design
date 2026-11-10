import {describe,it,expect} from 'vitest';
import {inspectionRequestAllowed,snapshotScript} from '../src/pixflow/public-page-inspection.js';
import {runInNewContext} from 'node:vm';
describe('anonymous bounded inspection policy',()=>{
  it.each([false,true])('collects real anchors with empty ids (SVG links: %s)',(svg)=>{
    const result=runInNewContext(snapshotScript,{
      location:{href:'https://site.test/'},URL,scrollY:0,innerHeight:900,
      document:{title:'Site',documentElement:{scrollHeight:900},querySelector:()=>null,
        querySelectorAll:(selector:string)=>selector==='[id],a[name]'?[
          {id:'',getAttribute:()=>null},{id:'section',getAttribute:()=>null},{id:'',getAttribute:()=> 'named'},
        ]:selector==='a[href]'?[
          {href:'https://site.test/article/'},...(svg?[{href:{baseVal:'#section'},getAttribute:()=> '#section'}]:[]),
        ]:[],
      },
    });
    expect(result.ids).toEqual(['section','named']);
    expect(result.links).toEqual(['https://site.test/article/',...(svg?['https://site.test/#section']:[])]);
  });
  it('allows public same-origin resources and paginated URLs',()=>{
    for(const url of ['https://site.test/article/','https://site.test/page/2/','https://site.test/wp-content/a.js'])expect(inspectionRequestAllowed(url,'https://site.test')).toBe(true);
  });
  it('blocks credentials, mutations, admin, API, foreign origins and editor controls',()=>{
    for(const url of ['https://site.test/wp-admin/','https://site.test/wp-login.php','https://site.test/?rest_route=/x','https://site.test/?bricks=run','https://site.test/?add-to-cart=1','https://other.test/a.js','file:///x','https://user:pass@site.test/'])expect(inspectionRequestAllowed(url,'https://site.test')).toBe(false);
    expect(inspectionRequestAllowed('https://site.test/','https://site.test','POST')).toBe(false);
    expect(inspectionRequestAllowed('http://127.0.0.1:1/','http://127.0.0.1:18364')).toBe(false);
  });
});
