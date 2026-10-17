// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listBuilderDestinations, prepareBuilderDestination, safeBuilderEditorUrl } from '../../src/pixflow/builder-destinations';
import { pixflowWordPressRestFetch } from '../../src/pixflow/runtime-fetch';
vi.mock('../../src/pixflow/runtime-fetch',()=>({pixflowWordPressRestFetch:vi.fn()}));
afterEach(()=>vi.clearAllMocks());
describe('Builder destination service',()=>{
  it('sends search text as encoded data with its cancellation signal',async()=>{
    vi.mocked(pixflowWordPressRestFetch).mockResolvedValue(new Response(JSON.stringify({builders:[],pages:[],hasMore:false})));
    const signal=new AbortController().signal;
    await listBuilderDestinations('gutenberg',' Tea & cake ',signal);
    expect(pixflowWordPressRestFetch).toHaveBeenCalledWith('/builder-destinations?builder=gutenberg&search=Tea+%26+cake',{signal});
  });
  it('uses one shared endpoint for draft and existing-page requests',async()=>{
    vi.mocked(pixflowWordPressRestFetch).mockResolvedValue(new Response(JSON.stringify({created:false,reused:false})));
    await prepareBuilderDestination({action:'open',builder:'bricks',postId:42});
    expect(pixflowWordPressRestFetch).toHaveBeenCalledWith('/builder-destinations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'open',builder:'bricks',postId:42})});
  });
  it('surfaces permission failures without pretending to open a destination',async()=>{
    vi.mocked(pixflowWordPressRestFetch).mockResolvedValue(new Response(JSON.stringify({message:'Access denied'}),{status:403}));
    await expect(listBuilderDestinations()).rejects.toThrow('Access denied');
  });
  it('only accepts same-origin HTTP editor links without embedded credentials',()=>{
    expect(safeBuilderEditorUrl('/wp-admin/post.php?post=1&action=edit')).toBe(`${window.location.origin}/wp-admin/post.php?post=1&action=edit`);
    for(const url of ['javascript:alert(1)','data:text/html,test','//foreign.example/editor','https://foreign.example/editor',`${window.location.protocol}//user:pass@${window.location.host}/wp-admin/`]) expect(safeBuilderEditorUrl(url)).toBeNull();
  });
});
