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
