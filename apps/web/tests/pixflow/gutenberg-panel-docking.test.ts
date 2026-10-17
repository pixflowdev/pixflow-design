// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { mountGutenbergPanelDocking } from '../../src/pixflow/gutenberg-panel-docking';

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.innerHTML = ''; });
function setup(width = 1600) {
  document.body.innerHTML = '<main class="interface-interface-skeleton__body"><aside class="interface-interface-skeleton__secondary-sidebar"></aside><div class="interface-interface-skeleton__content"></div><aside class="interface-interface-skeleton__sidebar"></aside></main><footer class="interface-interface-skeleton__footer"></footer>';
  const body = document.querySelector<HTMLElement>('main')!;
  const bounds = (width: number, top = 96, height = 700) => ({ x:0,y:top,left:0,right:width,top,bottom:top+height,width,height,toJSON(){} });
  body.getBoundingClientRect = () => bounds(width);
  document.querySelectorAll('aside').forEach(node => { node.getBoundingClientRect = () => bounds(280); });
  document.querySelector('footer')!.getBoundingClientRect = () => bounds(width, 720, 32);
  dispose = mountGutenbergPanelDocking();
  return { body, adapter: (window as any).PixflowDesignHostDock };
}
it('fits both native sidebars and keeps the dock below the header and above the footer', () => {
  const { body, adapter } = setup();
  expect(adapter.getDockRect('left',460)).toEqual({x:0,y:96,width:460,height:624});
  expect(adapter.getDockRect('right',900)).toEqual({x:880,y:96,width:720,height:624});
  adapter.onDockApply({dock:'right',width:460,collapsed:false});
  expect(body.dataset.pixflowGutenbergDock).toBe('right');
  expect(body.style.getPropertyValue('--pixflow-gutenberg-dock-width')).toBe('460px');
  adapter.onDockApply({dock:'left',width:460,collapsed:true});
  expect(body.dataset.pixflowGutenbergDock).toBeUndefined();
  adapter.onDockApply({dock:'left',width:460,collapsed:false});
  adapter.onDockRelease();
  expect(body.style.getPropertyValue('--pixflow-gutenberg-dock-width')).toBe('');
});
it('declines docking when the native controls leave too little canvas room', () => {
  const { adapter } = setup(1000);
  expect(adapter.getDockRect('right',460)).toBeNull();
  expect(adapter.inferDockSide(990,150)).toBe('');
});
it('waits for Gutenberg to mount before replacing the host docking adapter', async () => {
  document.body.innerHTML = '';
  dispose = mountGutenbergPanelDocking();
  expect((window as any).PixflowDesignHostDock).toBeUndefined();
  document.body.insertAdjacentHTML('beforeend','<main class="interface-interface-skeleton__body"></main>');
  await new Promise(resolve => setTimeout(resolve,0));
  expect((window as any).PixflowDesignHostDock).toBeDefined();
});
it('recognises real panel-edge drags and removes its adapter and hint on disposal', () => {
  const { adapter } = setup();
  expect(adapter.inferDockSide(220,150,{x:5,y:120,width:460,height:600})).toBe('left');
  expect(adapter.inferDockSide(1400,150,{x:1140,y:120,width:460,height:600})).toBe('right');
  expect(adapter.inferDockSide(20,40)).toBe('');
  adapter.onDockHint('left');
  expect(document.querySelector('[data-pixflow-annotation]')?.getAttribute('hidden')).toBeNull();
  dispose?.(); dispose = undefined;
  expect((window as any).PixflowDesignHostDock).toBeUndefined();
  expect(document.querySelector('[data-pixflow-annotation]')).toBeNull();
});
