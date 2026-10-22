import { beforeEach, expect, it, vi } from 'vitest';
import { loadComposerGuidanceReferences } from '../../src/pixflow/composer-guidance-references';
const mocks=vi.hoisted(()=>({request:vi.fn(),available:vi.fn(()=>true)}));
vi.mock('../../src/pixflow/license',()=>({requestWordPressRest:mocks.request}));
vi.mock('../../src/pixflow/planning-availability',()=>({planningAvailable:mocks.available}));
beforeEach(()=>{mocks.available.mockReturnValue(true);mocks.request.mockReset();});
it('attaches complete saved documents and the selected system as read-only snapshots',async()=>{
 const product='Purpose\n\n'+ 'a'.repeat(20000);
 mocks.request.mockResolvedValue({ok:true,body:{guidance:{revision:7,product,design:'# Design',source:'system',systemId:'brand'},systems:[{id:'brand',title:'Our brand',profile:{color:'blue'}}]}});
 const rows=await loadComposerGuidanceReferences(new AbortController().signal);
 expect(rows.map(r=>r.label)).toEqual(['PRODUCT.md','DESIGN.md','Our brand']);
 expect(JSON.parse(rows[0]!.content!).content).toBe(product);
 expect(mocks.request).toHaveBeenCalledWith('design-guidance');
});
it('does not request Pro data in Free',async()=>{mocks.available.mockReturnValue(false);expect(await loadComposerGuidanceReferences(new AbortController().signal)).toEqual([]);expect(mocks.request).not.toHaveBeenCalled();});
it('never substitutes empty documents or an unselected system',async()=>{mocks.request.mockResolvedValue({ok:true,body:{guidance:{revision:1,product:'',design:' ',source:'existing',systemId:'x'},systems:[{id:'x',title:'Other',profile:{}}]}});expect(await loadComposerGuidanceReferences(new AbortController().signal)).toEqual([]);});
it('rejects access failures and ignores late responses after unmount',async()=>{mocks.request.mockResolvedValue({ok:false});await expect(loadComposerGuidanceReferences(new AbortController().signal)).rejects.toThrow('guidance.requestFailed');const abort=new AbortController();abort.abort();expect(await loadComposerGuidanceReferences(abort.signal)).toEqual([]);});
