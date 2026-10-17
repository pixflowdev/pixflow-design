import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';

it('returns to floating mode when the host cannot safely reserve dock space', () => {
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only', url: 'http://localhost/' });
  try {
    dom.window.eval(readFileSync(fileURLToPath(new URL('../../../../wordpress/assets/pixflow-design-floating-panel.js', import.meta.url)), 'utf8'));
    const state = dom.window.PixflowDesignFloatingPanel.normalizePanelState({dock:'right',width:460,height:640}, {getDockRect:()=>null});
    expect(state.dock).toBe('float');
    expect(Number.isFinite(state.x)).toBe(true);
    expect(Number.isFinite(state.y)).toBe(true);
    const restored = dom.window.PixflowDesignFloatingPanel.normalizePanelState({dock:'right',width:560,height:950,floatWidth:460,floatHeight:680}, {getDockRect:()=>null,getFloatTop:()=>96});
    expect(restored.width).toBe(460);
    expect(restored.y + restored.height).toBeLessThanOrEqual(dom.window.innerHeight - 8);
  } finally { dom.window.close(); }
});

it('releases a previously rendered dock when a viewport change makes docking unavailable', () => {
  const dom = new JSDOM('<body><div id="panel"></div></body>', {runScripts:'outside-only',url:'http://localhost/',pretendToBeVisual:true});
  try {
    dom.window.eval(readFileSync(fileURLToPath(new URL('../../../../wordpress/assets/pixflow-design-floating-panel.js', import.meta.url)), 'utf8'));
    let fits = true;
    let state: any = {dock:'left',width:460,height:640,loaded:true};
    const applied = vi.fn();
    const controller = dom.window.PixflowDesignFloatingPanel.createPanelController({shellSelector:'#panel',getState:()=>state,setState:(next:any)=>{state=next;},getDockRect:()=>fits ? {x:0,y:96,width:460,height:640} : null,onDockApply:applied});
    controller.refreshDockGeometry();
    fits = false;
    controller.refreshDockGeometry();
    expect(state.dock).toBe('float');
    expect(applied).toHaveBeenLastCalledWith(expect.objectContaining({dock:'float'}));
  } finally { dom.window.close(); }
});

it('passes the dragged panel bounds to docking and restores floating size when dragged out', () => {
  const dom = new JSDOM('<body><div id="panel"><header>Drag</header></div></body>', { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  try {
    Object.defineProperty(win, 'innerWidth', { value: 1600 });
    Object.defineProperty(win, 'innerHeight', { value: 1000 });
    win.eval(readFileSync(fileURLToPath(new URL('../../../../wordpress/assets/pixflow-design-floating-panel.js', import.meta.url)), 'utf8'));
    let state: any = { x: 400, y: 100, width: 460, height: 640, dock: 'float', loaded: true };
    const infer = vi.fn((_x, _y, panel) => panel.x < 90 ? 'left' : '');
    const controller = win.PixflowDesignFloatingPanel.createPanelController({ shellSelector: '#panel', getState: () => state, setState: (next: any) => { state = next; }, inferDockSide: infer, getDockRect: () => ({x:48,y:0,width:460,height:950}) });
    expect(controller.normalizeState({dock:'float',y:0}).y).toBe(48);
    expect(win.PixflowDesignFloatingPanel.normalizePanelState({dock:'float',y:0}, {getFloatTop:()=>0}).y).toBe(0);
    const header = win.document.querySelector('header')!;
    header.setPointerCapture = vi.fn(); header.releasePointerCapture = vi.fn();
    controller.bindDrag(header);
    const pointer = (type: string, x: number, y: number) => header.dispatchEvent(new win.MouseEvent(type, { bubbles: true, clientX:x, clientY:y, button:0 }));
    pointer('pointerdown',600,120); pointer('pointermove',250,120); pointer('pointerup',250,120);
    expect(infer.mock.lastCall?.[2]).toMatchObject({x:50,width:460});
    expect(state.dock).toBe('left');
    pointer('pointerdown',248,20); pointer('pointermove',600,140); pointer('pointerup',600,140);
    expect(state).toMatchObject({dock:'float',width:460,height:640});
    pointer('pointerdown',600,140); pointer('pointermove',248,140); pointer('pointerup',248,140);
    expect(state.dock).toBe('left');
    controller.releaseDockLocks();
  } finally { dom.window.close(); }
});
