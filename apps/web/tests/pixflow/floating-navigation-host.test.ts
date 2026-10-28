import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
const source = readFileSync(resolve(import.meta.dirname, '../../../../wordpress/assets/admin/wp-admin-floating-panel.js'), 'utf8');

it.each(['same', 'different-user', 'missing-run'] as const)('auto-opens only the owned pending conversation: %s', scenario => {
  const dom = new JSDOM('<body></body>', {url:'https://site.test/wp-admin/', runScripts:'outside-only'});
  try {
    Object.defineProperty(dom.window.document, 'readyState', {value:'complete'});
    const host = dom.window as unknown as Record<string, unknown>;
    host.pixflowDesignWpAdmin = {restRouteBaseUrl:'https://site.test/',userId:1};
    const mount = vi.fn(() => ({}));
    host.PixflowDesignApp = {mount};
    host.PixflowDesignFloatingPanel = {setUiLabel() {}, createPanelController:()=>null};
    const scope = `https://site.test/:user:${scenario === 'different-user' ? 2 : 1}`;
    const runKey = `pixflow:direct-bricks-run:${scope}:post:12`;
    dom.window.sessionStorage.setItem(`pixflow:floating-conversation:v1:${scope}`, JSON.stringify({surface:'bricks',historyKey:'bricks:existing',runKey}));
    if (scenario !== 'missing-run') dom.window.sessionStorage.setItem(runKey, JSON.stringify({connection:{id:'a'.repeat(32),token:'b'.repeat(64)},metadata:{sessionKey:'bricks:existing'}}));
    dom.window.eval(source);
    expect(!!dom.window.document.querySelector('#pixflow-wp-admin-agent-shell.is-open')).toBe(scenario === 'same');
    expect(mount.mock.calls.length).toBe(scenario === 'same' ? 1 : 0);
  } finally {dom.window.close();}
});


it.each([false, true])('restores the header Bridge control with a pre-open mode change: %s', changedBeforeOpen => {
  const dom = new JSDOM('<body><div id="wp-admin-bar-pixflow-design"><a class="ab-item" href="#">Pixflow</a></div></body>', {url:'https://site.test/wp-admin/',runScripts:'outside-only'});
  try {
    Object.defineProperty(dom.window.document,'readyState',{value:'complete'});
    const host = dom.window as any;
    host.pixflowDesignWpAdmin={restRouteBaseUrl:'https://site.test/',userId:1,appConfig:{mode:'api'}};
    host.PixflowDesignApp={mount:()=>({})};
    dom.window.eval(readFileSync(resolve(import.meta.dirname,'../../../../wordpress/assets/pixflow-design-floating-panel.js'),'utf8'));
    host.PixflowDesignFloatingPanel.createPanelController=()=>null;
    dom.window.eval(source);
    if (changedBeforeOpen) dom.window.dispatchEvent(new dom.window.CustomEvent('pixflow-design:app-config-changed',{detail:{mode:'daemon'}}));
    (dom.window.document.querySelector('#wp-admin-bar-pixflow-design a') as HTMLElement).click();
    const control=dom.window.document.querySelector('.pixflow-agent-bridge-status') as HTMLElement;
    expect(control).not.toBeNull();
    expect(control.hidden).toBe(!changedBeforeOpen);
    for (const event of ['pixflow-design:app-config-changed','open-design:app-config-changed']) {
      dom.window.dispatchEvent(new dom.window.CustomEvent(event,{detail:{mode:'daemon'}}));
      expect(control.hidden).toBe(false);
      dom.window.dispatchEvent(new dom.window.CustomEvent(event,{detail:{theme:'dark'}}));
      expect(control.hidden).toBe(false);
      dom.window.dispatchEvent(new dom.window.CustomEvent(event,{detail:{mode:'api'}}));
      expect(control.hidden).toBe(true);
    }
    expect(dom.window.document.querySelectorAll('.pixflow-agent-bridge-status')).toHaveLength(1);
  } finally {dom.window.close();}
});
