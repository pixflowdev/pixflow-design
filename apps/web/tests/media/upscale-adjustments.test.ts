import { describe, it, expect, vi } from 'vitest';
import { adjustPixelRows, encodeUpscaleAdjustments } from '../../src/components/media-upscale-adjustments';

const run = (pixels: number[], width: number, sharpen = 0, contrast = 0, preserve = true) => {
  const input = new Uint8ClampedArray(pixels), output = new Uint8ClampedArray(input.length);
  adjustPixelRows(input, output, width, input.length / 4 / width, { sharpen, contrast, preserve });
  return [...output];
};
describe('upscale exported adjustments', () => {
  it('keeps neutral output byte-identical including alpha', () => {
    const pixels = [10, 20, 90, 0, 50, 150, 255, 128, 85, 100, 40, 255];
    expect(run(pixels, 3)).toEqual(pixels);
  });
  it('changes real pixels and keeps alpha and transparent colours intact', () => {
    expect(run([10, 20, 90, 0, 50, 150, 255, 128], 2, 0, 50)).toEqual([10, 20, 90, 0, 11, 161, 255, 128]);
  });
  it('protects strong edges from sharpening halos', () => {
    const pixels = [20, 20, 20, 255, 200, 200, 200, 255, 20, 20, 20, 255];
    const protectedPixels = run(pixels, 3, 100, 0, true);
    const unprotected = run(pixels, 3, 100, 0, false);
    expect(protectedPixels[4]).toBe(200);
    expect(unprotected[4]).toBe(255);
  });
  it('batching rows is identical to a complete pass', () => {
    const input = new Uint8ClampedArray([10,20,30,255,100,110,120,255,90,100,150,128,30,80,120,255]);
    const batch = new Uint8ClampedArray(input.length);
    for (let row = 0; row < 2; row++) adjustPixelRows(input, batch, 2, 2, {sharpen:40,contrast:20,preserve:true},row,row+1);
    expect([...batch]).toEqual(run([...input],2,40,20,true));
  });
});


describe('independent output dimensions', () => {
  it('encodes both selected dimensions instead of restoring the source ratio', async () => {
    const drawImage=vi.fn();
    const canvas={width:0,height:0,getContext:()=>({drawImage}),toBlob:(callback:(blob:Blob)=>void)=>callback(new Blob(['test'],{type:'image/png'}))};
    vi.stubGlobal('document',{createElement:()=>canvas});
    try {
      await encodeUpscaleAdjustments({naturalWidth:800,naturalHeight:600} as HTMLImageElement,'png',100,700,{sharpen:0,contrast:0,preserve:true},new AbortController().signal,450);
      expect(canvas.width).toBe(700);
      expect(canvas.height).toBe(450);
      expect(drawImage).toHaveBeenCalledWith(expect.anything(),0,0,700,450);
    } finally { vi.unstubAllGlobals(); }
  });
});
