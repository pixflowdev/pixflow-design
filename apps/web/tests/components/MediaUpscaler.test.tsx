// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaUpscaler } from '../../src/components/MediaUpscaler';
import type { PixflowMediaItem } from '../../src/providers/registry';

vi.mock('../../src/pixflow/upscaler-access', () => ({upscalerRequest:vi.fn(async()=>({installed:true,noiseReduction:true}))}));
vi.mock('../../src/components/MediaOptimiser', () => ({readMediaImage:vi.fn(()=>new Promise(()=>{})),encodeMediaImage:vi.fn()}));
vi.mock('../../src/providers/registry', () => ({uploadPixflowMedia:vi.fn()}));
vi.stubGlobal('IntersectionObserver',class {observe(){} unobserve(){} disconnect(){}});
vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});
afterEach(cleanup);
describe('multi-image upscaler settings', () => {
  it('keeps each image model, scale and adjustments when switching cards', async () => {
    const image=(id:string)=>({id,url:'/'+id+'.png',filename:id+'.png',mimeType:'image/png',width:400,height:300} as PixflowMediaItem);
    render(<MediaUpscaler item={image('one')} queue={[image('one'),image('two')]} installedModels={['photo2','photo4','art4']} onBack={()=>{}} onSaved={()=>{}}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Render image'}).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('radio',{name:/Illustration 4×\s*Real-ESRGAN/}));
    fireEvent.click(screen.getByRole('radio',{name:'3×'}));
    fireEvent.keyDown(screen.getByRole('slider',{name:'Sharpen'}),{key:'ArrowRight'});
    fireEvent.click(within(screen.getAllByRole('article')[1]!).getByRole('button',{name:'two.png'}));
    expect(screen.getByRole('radio',{name:/Photo 2×\s*Waifu2x/}).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('slider',{name:'Sharpen'}).getAttribute('aria-valuenow')).toBe('0');
    fireEvent.click(within(screen.getAllByRole('article')[0]!).getByRole('button',{name:'one.png'}));
    expect(screen.getByRole('radio',{name:/Illustration 4×\s*Real-ESRGAN/}).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio',{name:'3×'}).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('slider',{name:'Sharpen'}).getAttribute('aria-valuenow')).toBe('1');
    fireEvent.change(screen.getByRole('spinbutton',{name:'Height'}),{target:{value:'600'}});
    expect((screen.getByRole('spinbutton',{name:'Target width'}) as HTMLInputElement).value).toBe('800');
    expect(screen.getByRole('radio',{name:'2\u00d7'}).getAttribute('aria-checked')).toBe('true');
    const lock=screen.getByRole('button',{name:'Lock aspect ratio'});
    expect(lock.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(lock);
    fireEvent.change(screen.getByRole('spinbutton',{name:'Height'}),{target:{value:'450'}});
    expect((screen.getByRole('spinbutton',{name:'Target width'}) as HTMLInputElement).value).toBe('800');
    fireEvent.change(screen.getByRole('spinbutton',{name:'Target width'}),{target:{value:'1000'}});
    expect((screen.getByRole('spinbutton',{name:'Height'}) as HTMLInputElement).value).toBe('450');
    fireEvent.click(lock);
    expect((screen.getByRole('spinbutton',{name:'Height'}) as HTMLInputElement).value).toBe('750');
  });
});
