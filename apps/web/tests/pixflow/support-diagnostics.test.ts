// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { collectBridgeSupport } from '../../src/pixflow/support-diagnostics';
import { observeSupport } from '../../src/pixflow/support-timeline';
import { pixflowWordPressRestFetch } from '../../src/pixflow/runtime-fetch';
vi.mock('../../src/pixflow/wordpress-context',()=>({getPixflowWordPressConfig:()=>({siteHash:'paired',restNonce:'private-nonce',bridgeRequiredVersion:'2.1.4'})}));
vi.mock('../../src/pixflow/runtime-fetch',()=>({pixflowWordPressRestFetch:vi.fn(async()=>new Response(null,{status:204}))}));
vi.mock('../../src/pixflow/optional-bridge',()=>({
  pixflowOptionalBridgeApiUrl:()=> 'http://127.0.0.1:7456/api/pixflow/diagnostics/support',
  pixflowOptionalBridgeSiteHeaders:()=>new Headers({'X-Pixflow-Site-Key':'paired'}),
  readPublishedBridgeStatus:()=>({running:true,state:'connected',connectionRoute:'chrome-extension'}),
  readCachedPixflowOptionalBridgeAgents:()=>[],
}));
afterEach(()=>{delete window.__PIXFLOW_DESIGN_NATIVE_FETCH__;vi.clearAllMocks();});
test('no device request until explicitly included; older and unreachable Bridge do not prevent export',async()=>{
  const fetcher=vi.fn();
  window.__PIXFLOW_DESIGN_NATIVE_FETCH__=fetcher;
  expect(await collectBridgeSupport(false)).toMatchObject({collection:'not-requested'});
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(new Response('old',{status:404})).mockRejectedValueOnce(Error('private failure SECRET'));
  expect(await collectBridgeSupport(true)).toMatchObject({collection:'unsupported'});
  expect(await collectBridgeSupport(true)).toMatchObject({collection:'unreachable-or-blocked'});
});
test('only known machine and auth fields are sent to WordPress',async()=>{
  const at=new Date().toISOString();
  window.__PIXFLOW_DESIGN_NATIVE_FETCH__=vi.fn(async()=>Response.json({
    schema:'pixflow.bridge-support.v1', platform:'win32',arch:'x64', hostname:'SECRET',
    claude:{state:'failed',source:'desktop',attemptId:'SECRET',milestones:[
      {at,stage:'process-exited',exitCode:1,rawOutput:'SECRET'}, {at,stage:'SECRET'}]},
  }));
  const report=await collectBridgeSupport(true);
  expect(report).toMatchObject({collection:'collected',connection:{route:'chrome-extension'},report:{claude:{state:'failed',milestones:[{at,stage:'process-exited',exitCode:1}]}}});
  expect(JSON.stringify(report)).not.toContain('SECRET');
});
test('a failed browser read and its recovery are posted as fixed metadata',()=>{
  observeSupport('licence-status','html',503);
  observeSupport('licence-status','html',503);
  observeSupport('licence-status','json',200);
  expect(vi.mocked(pixflowWordPressRestFetch).mock.calls.map(([,init])=>JSON.parse(String(init?.body)))).toEqual([
    {area:'licence',event:'status-html',http:503,operation:'licence-status'},
    {area:'licence',event:'recovered',http:200,operation:'licence-status'},
  ]);
});
