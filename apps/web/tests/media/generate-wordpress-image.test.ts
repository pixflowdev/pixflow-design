import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import type {AppConfig,AgentEvent} from '../../src/types';
const mocks=vi.hoisted(()=>({run:vi.fn(),media:vi.fn(),generate:vi.fn()}));
vi.mock('../../src/pixflow/direct-site',()=>({runDirectSite:mocks.run}));
vi.mock('../../src/providers/registry',()=>({fetchPixflowMedia:mocks.media,generateProjectMediaOnWordPress:mocks.generate}));
import {generateWordPressImage} from '../../src/media/generate-wordpress-image';
describe('saved image generation receipts',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('window',{location:{origin:'https://site.test'}});});
 afterEach(()=>vi.unstubAllGlobals());
 const args=()=>({config:{mode:'daemon',agentId:'codex'} as AppConfig,agents:[{id:'codex',available:true,authStatus:'ok'}] as Parameters<typeof generateWordPressImage>[0]['agents'],prompt:'An illustrative image',projectId:'project',surface:'blog-media-test',signal:new AbortController().signal});
 it('does not run an agent when no provider exists',async()=>{
  await expect(generateWordPressImage({...args(),agents:[]})).rejects.toThrow('unavailable');expect(mocks.run).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('accepts only the matching saved generated attachment',async()=>{
  const item={attachmentId:42,type:'image',source:'generated',url:'https://site.test/image.png'};
  mocks.run.mockImplementation(async ({onUpdate})=>{onUpdate('',[{kind:'tool_result',content:JSON.stringify({pixflowGeneratedMedia:{...item,libraryUrl:'https://site.test/wp-admin/?pixflow_media_id=42'}})}] as AgentEvent[]);return 'completed';});
  mocks.media.mockResolvedValue({items:[item]});expect(await generateWordPressImage(args())).toEqual(item);
  expect(mocks.media.mock.calls[0]?.[0]).toEqual({attachmentId:42});
 });
 it('does not convert successful prose into a fictional attachment',async()=>{
  mocks.run.mockResolvedValue('completed');await expect(generateWordPressImage(args())).rejects.toThrow('receipt');expect(mocks.media).not.toHaveBeenCalled();
 });
 it('uses shared provider polling and forwards cancellation',async()=>{
  const input=args();input.config={...input.config,mode:'api',mediaProviders:{openai:{apiKey:'test',baseUrl:''}}};
  mocks.generate.mockResolvedValue({media:{attachmentId:43}});await generateWordPressImage(input);
  expect(mocks.generate.mock.calls[0]?.[0].signal).toBe(input.signal);expect(mocks.run).not.toHaveBeenCalled();
 });
 it('does not start cancelled work',async()=>{
  const signal=AbortSignal.abort();await expect(generateWordPressImage({...args(),signal})).rejects.toThrow();expect(mocks.run).not.toHaveBeenCalled();
 });
});
