import {expect,it} from 'vitest';
import {SiteResultStore} from '../../src/pixflow/site-result-store';
it('advertises individual ledger item paths rather than inviting index-range guesses',()=>{
  const store=new SiteResultStore();
  const receipt=store.reference([{tool:'etch.audit',result:{ok:true}},{tool:'skills.read',result:{content:'guidance'}}]) as {resultId:string;readPaths:Record<string,unknown>[]};
  expect(receipt.readPaths).toEqual([{resultId:receipt.resultId,path:[0]},{resultId:receipt.resultId,path:[1]}]);
  for(const request of receipt.readPaths) expect(store.read(request)).toHaveProperty('text');
});
it('advertises paths relative to the stored value even when the receipt is nested in context',()=>{
  const store=new SiteResultStore(40);
  const value={payload:'x'.repeat(100),siteDesignGuidance:{source:'Saved site guidance'}};
  const envelope={context:store.present(value)} as {context:{resultId:string;readPaths:Array<{resultId:string;path:string[]}>}};
  expect(envelope.context.readPaths).toContainEqual({resultId:envelope.context.resultId,path:['siteDesignGuidance']});
  for(const request of envelope.context.readPaths) expect(store.read(request)).toHaveProperty('text');
  expect(()=>store.read({resultId:envelope.context.resultId,path:['context','siteDesignGuidance']})).toThrow('path not found');
});
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
it('references review evidence without duplicating previews and retains it across recovery',()=>{
  const store=new SiteResultStore();
  const receipts=[{tool:'audit',result:'Exact evidence '.repeat(3000),isError:false}];
  const reference=store.reference(receipts) as {resultId:string};
  expect(JSON.stringify(reference).length).toBeLessThan(600);
  const restored=new SiteResultStore();restored.restore(store.snapshot());
  let offset=0,text='';
  for(;;){const page=restored.read({resultId:reference.resultId,offset}) as {text:string;nextOffset:number|null};text+=page.text;if(page.nextOffset===null)break;offset=page.nextOffset;}
  expect(JSON.parse(text)).toEqual(receipts);
});
