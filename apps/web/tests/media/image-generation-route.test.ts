import {describe,it,expect} from 'vitest';
import {imageGenerationRoute} from '../../src/media/image-generation-route';
describe('shared image generation capability',()=>{
 const codex={id:'codex',available:true,authStatus:'ok' as const};
 it('needs a real signed-in Codex capability, not just the selected agent',()=>{
  expect(imageGenerationRoute({mode:'daemon',agentId:'codex'},[])).toBeNull();
  expect(imageGenerationRoute({mode:'daemon',agentId:'codex'},[codex])).toEqual({kind:'codex'});
  expect(imageGenerationRoute({mode:'daemon',agentId:'codex'},[{...codex,available:false}])).toBeNull();
 });
 it('uses an enabled configured provider without requiring Bridge',()=>{
  expect(imageGenerationRoute({mode:'api',agentId:'codex',mediaProviders:{openai:{apiKey:'test',baseUrl:''}}})).toMatchObject({kind:'provider'});
  expect(imageGenerationRoute({mode:'api',agentId:'codex',mediaProviders:{openai:{apiKey:'test',baseUrl:'',enabled:false}}})).toBeNull();
  expect(imageGenerationRoute({mode:'api',agentId:'codex',mediaProviders:{openai:{apiKey:'',baseUrl:'',apiKeyConfigured:true}}})).toBeNull();
 });
 it('allows Claude to use available Codex but does not invent a provider',()=>{
  expect(imageGenerationRoute({mode:'daemon',agentId:'claude'},[codex])).toEqual({kind:'codex'});
  expect(imageGenerationRoute({mode:'daemon',agentId:'claude'},[])).toBeNull();
  expect(imageGenerationRoute({mode:'api',agentId:'codex'},[codex])).toBeNull();
 });
});
