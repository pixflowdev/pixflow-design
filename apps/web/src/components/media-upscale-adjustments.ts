export type UpscaleAdjustments = { sharpen: number; contrast: number; preserve: boolean };

/** Adjust RGB only. Transparent pixels and their hidden colours remain untouched. */
export function adjustPixelRows(source: Uint8ClampedArray, output: Uint8ClampedArray, width: number, height: number, settings: UpscaleAdjustments, first = 0, end = height) {
  const sharp = Math.max(0, Math.min(100, settings.sharpen)) / 100;
  const contrast = 1 + Math.max(-50, Math.min(50, settings.contrast)) / 100;
  for (let y = first; y < end; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    output[i + 3] = source[i + 3]!;
    for (let c = 0; c < 3; c++) {
      const value = source[i + c]!;
      if (!source[i + 3]) { output[i + c] = value; continue; }
      let sum = 0, count = 0;
      for (const offset of [x > 0 ? i - 4 : i, x < width - 1 ? i + 4 : i, y > 0 ? i - width * 4 : i, y < height - 1 ? i + width * 4 : i]) {
        if (source[offset + 3]) { sum += source[offset + c]!; count++; }
      }
      const detail = value - (count ? sum / count : value);
      const protection = settings.preserve ? Math.max(0, 1 - Math.abs(detail) / 64) : 1;
      output[i + c] = ((value + detail * sharp * protection) - 127.5) * contrast + 127.5;
    }
  }
}

/** Yield between row batches so large exports remain cancellable and the controls responsive. */
export async function encodeUpscaleAdjustments(image: HTMLImageElement, format: string, quality: number, width: number, settings: UpscaleAdjustments, signal: AbortSignal, height?: number): Promise<Blob> {
  signal.throwIfAborted();
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(image.naturalWidth, width);
  canvas.height = height ?? Math.max(1, Math.round(image.naturalHeight * canvas.width / image.naturalWidth));
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (settings.sharpen || settings.contrast) {
    const original = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 32) {
      signal.throwIfAborted();
      adjustPixelRows(original.data, result.data, canvas.width, canvas.height, settings, y, Math.min(y + 32, canvas.height));
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    context.putImageData(result, 0, 0);
  }
  if (format === 'jpeg') { context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
  signal.throwIfAborted();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image encoding failed')), 'image/' + format, quality / 100));
  signal.throwIfAborted();
  if (blob.type !== 'image/' + format) throw new Error('Unsupported image format');
  return blob;
}
