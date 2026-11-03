export async function encodeMediaImage(image: HTMLImageElement, format: string, quality: number, limit: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(image.naturalWidth, limit || image.naturalWidth);
  canvas.height = Math.max(1, Math.round(image.naturalHeight * canvas.width / image.naturalWidth));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  if (format === 'jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const mime = 'image/' + format;
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => {
    if (value?.type === mime) resolve(value);
    else reject(new Error('Unsupported image format'));
  }, mime, quality / 100));
  return { blob, width: canvas.width, height: canvas.height };
}

