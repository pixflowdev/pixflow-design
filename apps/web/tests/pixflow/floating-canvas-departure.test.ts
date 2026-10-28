// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../../src/pixflow/runtime-fetch',()=>({pixflowWordPressRestFetch:request}));
import {notifyFloatingCanvasDeparture} from '../../src/pixflow/floating-canvas-departure';
afterEach(()=>{vi.restoreAllMocks();request.mockReset();});
const metadata={editorTarget:{builder:'bricks',canvasId:'a'.repeat(32),postId:10}};
it('notifies the same-page transition while holding the originating canvas lock',async()=>{
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:vi.fn(async(_id,_opts,cb)=>cb({name:'lock'}))}});
 request.mockResolvedValue({ok:true});
 await notifyFloatingCanvasDeparture(metadata,10);
 expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({action:'depart',...metadata.editorTarget});
});
it('does not suspend another live tab or a different page',async()=>{
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:vi.fn(async(_id,_opts,cb)=>cb(null))}});
 await notifyFloatingCanvasDeparture(metadata,10);
 await notifyFloatingCanvasDeparture(metadata,11);
 expect(request).not.toHaveBeenCalled();
});
it('attaches only this window’s same-page Gutenberg target',async()=>{
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:vi.fn(async(_id,_opts,cb)=>cb({name:'lock'}))}});
 request.mockResolvedValue({ok:true});
 const destination={builder:'gutenberg' as const,canvasId:'b'.repeat(32),postId:10};
 await notifyFloatingCanvasDeparture(metadata,10,async()=>destination);
 expect(JSON.parse(request.mock.calls[0]![1].body).destination).toEqual(destination);
 await notifyFloatingCanvasDeparture(metadata,10,async()=>({...destination,postId:11}));
 expect(JSON.parse(request.mock.calls[1]![1].body).destination).toBeUndefined();
});
