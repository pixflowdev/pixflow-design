import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { bridgeConnectionRoute } from '../../src/pixflow/bridge-connection-route';

it('only labels a confirmed route, never cached presence, failures or pending connections', () => {
  for (const state of ['checking','missing','error','switching']) expect(bridgeConnectionRoute({state,running:true,connectionRoute:'chrome-extension'})).toBeNull();
  expect(bridgeConnectionRoute({state:'connected',running:true})).toBeNull();
  expect(bridgeConnectionRoute({state:'connected',running:true,error:'denied',connectionRoute:'direct'})).toBeNull();
  for (const connectionRoute of ['direct','chrome-extension'] as const) expect(bridgeConnectionRoute({state:'connected',running:true,connectionRoute})).toBe(connectionRoute);
});

it('publishes route changes even when health/version are unchanged and clears failed routes', async () => {
  const dom = new JSDOM('<body/>',{url:'https://site.test',runScripts:'outside-only'});
  try {
    const win = dom.window as any;
    Object.defineProperty(win.document,'readyState',{value:'complete'});
    win.pixflowDesignAdminBridge={bridgeBaseUrl:'http://127.0.0.1:7456',siteHash:'site'};
    let route='direct', failed=false;
    win.fetch=async()=>{if(failed)throw new Error('offline');return {ok:true,headers:{get:()=>route==='chrome-extension'?route:null},json:async()=>({ok:true,version:'2.1.1',site:{key:'site'}})};};
    win.eval(readFileSync(resolve(import.meta.dirname,'../../../../wordpress/assets/admin/bridge-status.js'),'utf8'));
    const probe=async()=>{win.dispatchEvent(new win.CustomEvent('pixflow-design:bridge-reconnect-request'));await new Promise(r=>setTimeout(r,20));};
    await probe();expect(win.pixflowDesignBridgeStatus.connectionRoute).toBe('direct');
    route='chrome-extension';await probe();expect(win.pixflowDesignBridgeStatus.connectionRoute).toBe('chrome-extension');
    route='unknown';win.__PIXFLOW_NATIVE_PROTOTYPE__=true;await probe();expect(win.pixflowDesignBridgeStatus.connectionRoute).toBe('');
    failed=true;await probe();expect(win.pixflowDesignBridgeStatus.connectionRoute).toBe('');
  } finally {dom.window.close();}
});

it('keeps the open Bridge popover in sync without duplicating the route or retaining a stale label', () => {
  const dom=new JSDOM('<body/>',{url:'https://site.test',runScripts:'outside-only',pretendToBeVisual:true});
  try {
    const win=dom.window as any;
    win.eval(readFileSync(resolve(import.meta.dirname,'../../../../wordpress/assets/pixflow-design-floating-panel.js'),'utf8'));
    const status={state:'connected',running:true,connectionRoute:'direct'};
    win.pixflowDesignBridgeStatus=status;
    const control=win.PixflowDesignFloatingPanel.createBridgeStatusControl({initialStatus:status});
    win.document.body.appendChild(control);
    control.querySelector('button').click();
    const route=win.document.querySelector('[data-bridge-route]');
    expect(route.textContent).toBe('Connected directly');
    win.dispatchEvent(new win.CustomEvent('pixflow-design:bridge-status',{detail:{...status,connectionRoute:'chrome-extension'}}));
    expect(route.textContent).toBe('Connected via Chrome extension');
    expect(win.document.querySelectorAll('[data-bridge-route]')).toHaveLength(1);
    win.dispatchEvent(new win.CustomEvent('pixflow-design:bridge-status',{detail:{state:'missing',running:false}}));
    expect(route.hidden).toBe(true);
    control.destroy();
  } finally {dom.window.close();}
});

it('preserves entitlement synchronization when connecting after a site switch', async () => {
  const dom = new JSDOM('<body/>', { url: 'https://site.test', runScripts: 'outside-only' });
  try {
    const win = dom.window as any;
    Object.defineProperty(win.document, 'readyState', { value: 'complete' });
    win.pixflowDesignAdminBridge = { bridgeBaseUrl: 'http://127.0.0.1:7456', siteHash: 'site', restBaseUrl: 'https://site.test/wp-json/pixflow', siteOrigin: 'https://site.test' };
    let switched = false, entitlementSynced = false;
    win.fetch = async (url: string) => {
      let payload: unknown;
      if (url.endsWith('/pixflow/site-context/switch')) { switched = true; payload = { ok: true, status: 'claimed' }; }
      else if (url.endsWith('/license/status')) payload = { license: { valid: true }, bridge_entitlement: { token: 'synthetic-test-token' } };
      else if (url.endsWith('/pixflow/license-entitlement')) { entitlementSynced = true; payload = { ok: true }; }
      else payload = { ok: true, version: '2.1.1', site: { key: switched ? 'site' : 'other' } };
      return { ok: true, headers: { get: () => null }, json: async () => payload };
    };
    win.eval(readFileSync(resolve(import.meta.dirname, '../../../../wordpress/assets/admin/bridge-status.js'), 'utf8'));
    await new Promise(r => setTimeout(r, 60));
    win.dispatchEvent(new win.CustomEvent('pixflow-design:bridge-reconnect-request'));
    await new Promise(r => setTimeout(r, 60));
    expect(entitlementSynced).toBe(true);
    expect(win.pixflowDesignBridgeStatus.state).toBe('connected');
    expect(win.pixflowDesignBridgeStatus.connectionRoute).toBe('direct');
  } finally { dom.window.close(); }
});
