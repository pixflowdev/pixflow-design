import {expect,it} from 'vitest';
import {SiteResultStore} from '../../src/pixflow/site-result-store';
it('retains complete large data and reads selected paths without prototype traversal',()=>{
  const store=new SiteResultStore(40);
  const original={classes:Array.from({length:20},(_,id)=>({id,name:`class-${id}`})),title:'Title'};
  const summary=store.present(original) as {resultId:string};
  expect(store.read({resultId:summary.resultId,path:['title']})).toMatchObject({text:'"Title"',nextOffset:null});
  let offset=0,text='';
  do {const page=store.read({resultId:summary.resultId,offset}) as {text:string;nextOffset:number|null};text+=page.text;if(page.nextOffset===null)break;offset=page.nextOffset;}while(true);
  expect(JSON.parse(text)).toEqual(original);
  expect(()=>store.read({resultId:summary.resultId,path:['__proto__']})).toThrow('path not found');
  expect(()=>store.read({resultId:'unknown'})).toThrow('not found');
});
it('describes nested data before a model guesses paths and explains invalid paths',()=>{
  const store=new SiteResultStore(20);
  const summary=store.present({result:{globalClasses:[{id:'one',name:'hero'}],context:{sections:{variables:[]}}}}) as {resultId:string;structure:unknown};
  expect(summary.structure).toMatchObject({result:{globalClasses:{type:'array',length:1},context:{type:'object',keys:['sections']}}});
  expect(()=>store.read({resultId:summary.resultId,path:['result','variables']})).toThrow('Available keys at this level: ["globalClasses","context"]');
});
