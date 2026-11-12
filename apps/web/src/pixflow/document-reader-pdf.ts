import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

export async function readPdf(bytes: ArrayBuffer, asset: (name: string) => string,
  add: (label: string, text: string) => boolean, signal: AbortSignal): Promise<string | undefined> {
  GlobalWorkerOptions.workerSrc = asset('pdf/pdf.worker.min.js');
  const loading = getDocument({
    data: new Uint8Array(bytes), enableXfa: false,
    cMapUrl: asset('pdf/cmaps/'), cMapPacked: true,
    standardFontDataUrl: asset('pdf/standard_fonts/'), wasmUrl: asset('pdf/wasm/'),
    maxImageSize: 12_000_000,
  });
  const stop = () => { void loading.destroy().catch(() => {}); };
  signal.addEventListener('abort', stop, { once: true });
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let scans = 0;
  let skipped = 0;
  try {
    const pdf = await loading.promise;
    for (let number = 1; number <= Math.min(pdf.numPages, 160); number++) {
      signal.throwIfAborted();
      const page = await pdf.getPage(number);
      try {
        const layer = await page.getTextContent();
        let text = layer.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
        let label = `Page ${number}`;
        if (!text) {
          if (scans >= 12) { skipped++; continue; }
          scans++;
          const bounds = page.getViewport({ scale: 1 });
          const scale = Math.min(2.5, 2200 / Math.max(bounds.width, bounds.height));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          try {
            await page.render({ canvas, viewport }).promise;
            signal.throwIfAborted();
            let abortOcr: (() => void) | undefined;
            try {
              const result = await Promise.race([
                (async () => {
                  worker ??= await createWorker('eng', 1, {
                    workerPath: asset('ocr/worker.min.js'), corePath: asset('ocr/tesseract-core-lstm.wasm.js'),
                    langPath: asset('ocr'), workerBlobURL: false, cacheMethod: 'none', errorHandler: () => {},
                  });
                  if (signal.aborted) {
                    await worker.terminate();
                    signal.throwIfAborted();
                  }
                  return worker.recognize(canvas);
                })(),
                new Promise<never>((_, reject) => {
                  abortOcr = () => reject(signal.reason);
                  signal.addEventListener('abort', abortOcr, { once: true });
                }),
              ]);
              text = result.data.text.trim();
            } finally { if (abortOcr) signal.removeEventListener('abort', abortOcr); }
            label += ' (English OCR)';
          } catch {
            signal.throwIfAborted();
            skipped++;
            continue;
          } finally { canvas.width = canvas.height = 0; }
          if (!text) skipped++;
        }
        if (!add(label, text)) break;
      } finally { page.cleanup(); }
    }
    if (skipped || pdf.numPages > 160) return 'Some PDF pages could not be read within the text and English OCR limits.';
  } finally {
    signal.removeEventListener('abort', stop);
    await Promise.allSettled([loading.destroy(), worker?.terminate()]);
  }
}
